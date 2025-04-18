use async_trait::async_trait;
use chrono::{DateTime, NaiveDateTime};
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use crate::brokers::broker_provider::{
    BrokerApiConfig, BrokerError, BrokerProvider, ExternalActivity,
};
use tokio::time::{sleep, Duration};
use log::debug;

pub struct Trading212Provider {
    api_key: String,
    client: Client,
    endpoint_orders: String,
    endpoint_dividends: String,
    endpoint_deposits: String,
}

// T212 specific Logic
impl Trading212Provider {
    pub async fn new(config: BrokerApiConfig) -> Result<Self, BrokerError> {
        if config.api_key.is_empty() {
            return Err(BrokerError::AuthenticationFailed("API key is empty".to_string()));
        }

        Ok(Self {
            api_key: config.api_key,
            client: Client::new(),
            endpoint_orders: "https://live.trading212.com/api/v0/equity/history/orders".to_string(),
            endpoint_dividends: "https://live.trading212.com/api/v0/history/dividends".to_string(),
            endpoint_deposits: "https://live.trading212.com/api/v0/history/transactions".to_string(),
        })
    }

    fn convert_t212_to_yahoo_ticker(raw: &str) -> String {
        let exchange_map: HashMap<char, &str> = [
            ('a', ".AS"), ('l', ".L"), ('d', ".DE"), ('m', ".MI"), ('p', ".PA"),
            ('h', ".HK"), ('t', ".TO"), ('v', ".V"), ('n', ".NE"), ('o', ".OL"),
            ('k', ".KS"), ('s', ".SG"),
        ]
        .iter()
        .cloned()
        .collect();
        let suffixes = ["_EQ", "_ETF", "_CFD", "_FUND", "_ADR", "_TR"];
        let mut base = raw.to_string();
        for suffix in &suffixes {
            if base.ends_with(suffix) {
                base = base.trim_end_matches(suffix).to_string();
                break;
            }
        }
        if base.contains("_US") {
            let parts: Vec<&str> = base.split("_US").collect();
            if let Some(symbol) = parts.first() {
                return symbol.to_string();
            }
        }
        let data = base.chars().filter(|c| c.is_alphabetic()).collect::<String>();
        let ticker: String = data.chars().filter(|c| c.is_uppercase()).collect();
        let exchange_code: Option<char> = data.chars().find(|c| c.is_lowercase());

        if let Some(code) = exchange_code {
            if let Some(suffix) = exchange_map.get(&code) {
                return format!("{}{}", ticker, suffix);
            }
        }
        ticker
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trading212Order {
    pub order_type: Option<String>,        
    pub id: Option<u64>,           
    pub fill_id: Option<u64>,
    pub parent_order: Option<u64>,
    pub ticker: String,
    pub ordered_quantity: Option<f64>,
    pub filled_quantity: Option<f64>,
    pub limit_price: Option<f64>,
    pub stop_price: Option<f64>,
    pub time_validity: Option<String>,
    pub ordered_value: Option<f64>,
    pub filled_value: Option<f64>,
    pub executor: Option<String>,
    pub date_modified: Option<String>,
    pub date_executed: Option<String>,
    pub date_created: Option<String>,
    pub fill_result: Option<String>,
    pub fill_price: Option<f64>,
    pub fill_cost: Option<f64>,
    #[serde(default)]
    pub taxes: Vec<Trading212Tax>,
    pub fill_type: Option<String>,
    pub status: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trading212Tax {
    name: String,
    quantity: f64,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212Dividend {
    ticker: String,
    reference: Option<String>,
    quantity: f64,
    amount: f64,
    gross_amount_per_share: Option<f64>,
    amount_in_euro: Option<f64>,
    paid_on: String,
    #[serde(rename = "type")]
    dividend_type: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212Deposit {
    amount: f64,
    date_time: String,
    reference: Option<String>,
    #[serde(rename = "type")]
    deposit_type: String, // "WITHDRAW", "DEPOSIT", etc.
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212OrderResponse {
    items: Vec<Trading212Order>,
    next_page_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212DividendResponse {
    items: Vec<Trading212Dividend>,
    next_page_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212DepositResponse {
    items: Vec<Trading212Deposit>,
    next_page_path: Option<String>,
}

#[async_trait]
impl BrokerProvider for Trading212Provider {
    async fn fetch_activities(&self, since: NaiveDateTime) -> Result<Vec<ExternalActivity>, BrokerError> {
        let mut all_activities: Vec<ExternalActivity> = Vec::new();
        debug!("Fetching T212 Data since {:?}", since);

        // === ORDERS ===
        let mut next_url = Some(self.endpoint_orders.clone());
        while let Some(url) = next_url {
            let full_url = if url.starts_with("http") {
                url
            } else {
                format!("https://live.trading212.com{}", url)
            };

            let mut retries = 0;
            let resp = loop {
                debug!("Fetching orders from URL: {}", full_url);
                let resp = self
                    .client
                    .get(&full_url)
                    .header("Authorization", self.api_key.clone())
                    .send()
                    .await;

                match resp {
                    Ok(r) if r.status() == reqwest::StatusCode::TOO_MANY_REQUESTS => {
                        if retries >= 5 {
                            return Err(BrokerError::ApiRequestFailed("Too many 429s on orders; giving up".to_string()));
                        }
                        let wait = 2u64.pow(retries) * 2000;
                        debug!("Got 429 on orders. Sleeping for {}ms before retrying...", wait);
                        sleep(Duration::from_millis(wait)).await;
                        retries += 1;
                        continue;
                    }
                    Ok(r) => break r,
                    Err(e) => return Err(BrokerError::from(e)),
                }
            };

            let status = resp.status();
            let body = resp.text().await.map_err(BrokerError::from)?;
            if !status.is_success() {
                return Err(BrokerError::ApiRequestFailed(format!(
                    "Failed to fetch order history: HTTP {}", status
                )));
            }

            let parsed: Trading212OrderResponse = serde_json::from_str(&body).map_err(BrokerError::from)?;
            debug!("Parsed {} orders", parsed.items.len());
            debug!("next_page_path (orders): {:?}", parsed.next_page_path);

            for o in parsed.items {
                // debug!("Raw order {:?}", o);
            
                // Parse timestamp
                let timestamp = o.date_executed
                    .as_ref()
                    .or(o.date_created.as_ref())
                    .and_then(|dt| DateTime::parse_from_rfc3339(dt).ok())
                    .map(|dt| dt.naive_utc());
            
                let Some(ts) = timestamp else {
                    debug!("Skipping order with missing timestamp: {:?}", o.ticker);
                    continue;
                };
            
                if ts <= since {
                    debug!("Skipping older order: {:?}", o.ticker);
                    continue;
                }
            
                // Derive filled_quantity: fallback to filled_value / fill_price
                let filled_quantity = match o.filled_quantity {
                    Some(qty) if qty > 0.0 => qty,
                    _ => {
                        if let (Some(filled_val), Some(fill_price)) = (o.filled_value, o.fill_price) {
                            let derived = filled_val / fill_price;
                            debug!(
                                "Derived filled_quantity = {} from filled_value {} / fill_price {}",
                                derived, filled_val, fill_price
                            );
                            derived
                        } else {
                            debug!("Skipping order with no valid filled quantity: {:?}", o.ticker);
                            continue;
                        }
                    }
                };
            
                // Derive price: fallback to filled_value / filled_quantity
                let price = o.fill_price.or_else(|| {
                    if let (Some(filled_val), Some(qty)) = (o.filled_value, Some(filled_quantity)) {
                        let derived = filled_val / qty;
                        debug!(
                            "Derived fill_price = {} from filled_value {} / qty {}",
                            derived, filled_val, qty
                        );
                        Some(derived)
                    } else {
                        None
                    }
                });
            
                let Some(price) = price else {
                    debug!("Skipping order with no price: {:?}", o.ticker);
                    continue;
                };
            
                let activity_type = match o.filled_value {
                    Some(v) if v < 0.0 => "SELL",
                    Some(_) => "BUY",
                    None => {
                        if o.ordered_value.unwrap_or(0.0) < 0.0 {
                            "SELL"
                        } else {
                            "BUY"
                        }
                    }
                };
                let symbol = Self::convert_t212_to_yahoo_ticker(&o.ticker);
                let fee = o.taxes.iter().map(|t| t.quantity).sum::<f64>().abs();
            
                debug!("Order activity type: {}", activity_type);
            
                all_activities.push(ExternalActivity {
                    symbol,
                    activity_type: activity_type.to_string(),
                    quantity: filled_quantity.abs(),
                    price,
                    timestamp: ts,
                    currency: Some("EUR".to_string()),
                    fee: Some(fee),
                    comment: Some("Imported from Trading212 order history".to_string()),
                });
            }            
            next_url = parsed.next_page_path;
            sleep(Duration::from_millis(300)).await;
        }

        // === DIVIDENDS ===
        let mut next_url = Some(self.endpoint_dividends.clone());
        while let Some(url) = next_url {
            let full_url = if url.starts_with("http") {
                url
            } else {
                format!("https://live.trading212.com{}", url)
            };

            let mut retries = 0;
            let resp = loop {
                debug!("Fetching dividends from URL: {}", full_url);
                let resp = self
                    .client
                    .get(&full_url)
                    .header("Authorization", self.api_key.clone())
                    .send()
                    .await;

                match resp {
                    Ok(r) if r.status() == reqwest::StatusCode::TOO_MANY_REQUESTS => {
                        if retries >= 5 {
                            return Err(BrokerError::ApiRequestFailed("Too many 429s on dividends; giving up".to_string()));
                        }
                        let wait = 2u64.pow(retries) * 2000;
                        debug!("Got 429 on dividends. Sleeping for {}ms before retrying...", wait);
                        sleep(Duration::from_millis(wait)).await;
                        retries += 1;
                        continue;
                    }
                    Ok(r) => break r,
                    Err(e) => return Err(BrokerError::from(e)),
                }
            };

            let status = resp.status();
            let body = resp.text().await.map_err(BrokerError::from)?;
            if !status.is_success() {
                return Err(BrokerError::ApiRequestFailed(format!(
                    "Failed to fetch dividend history: HTTP {}", status
                )));
            }

            let parsed: Trading212DividendResponse = serde_json::from_str(&body).map_err(BrokerError::from)?;
            debug!("Parsed {} dividends", parsed.items.len());
            debug!("next_page_path (dividends): {:?}", parsed.next_page_path);

            for d in parsed.items {
                if d.amount.abs() == 0.0 {
                    continue;
                }

                if let Ok(ts) = DateTime::parse_from_rfc3339(&d.paid_on).map(|dt| dt.naive_utc()) {
                    if ts <= since {
                        debug!("Skipping older dividend: {:?}", d.ticker);
                        continue;
                    }

                    let symbol = Self::convert_t212_to_yahoo_ticker(&d.ticker);
                    all_activities.push(ExternalActivity {
                        symbol,
                        activity_type: "DIVIDEND".to_string(),
                        quantity: d.quantity,
                        price: d.gross_amount_per_share.unwrap_or(0.0),
                        timestamp: ts,
                        currency: Some("EUR".to_string()),
                        fee: Some(0.0),
                        comment: Some("Imported from Trading212 dividend history".to_string()),
                    });
                }
            }

            next_url = parsed.next_page_path;
            sleep(Duration::from_millis(300)).await;
        }

        // === DEPOSITS ===
        let mut next_url = Some(self.endpoint_deposits.clone());
        while let Some(url) = next_url {
            let full_url = if url.starts_with("http") {
                url
            } else {
                format!("https://live.trading212.com/api/v0/history/transactions?{}", url)
            };

            let mut retries = 0;
            let resp = loop {
                debug!("Fetching deposits from URL: {}", full_url);
                let resp = self
                    .client
                    .get(&full_url)
                    .header("Authorization", self.api_key.clone())
                    .send()
                    .await;
                
                match resp {
                    Ok(r) if r.status() == reqwest::StatusCode::TOO_MANY_REQUESTS => {
                        if retries >=5 {
                            return Err(BrokerError::ApiRequestFailed("Too many 429s on deposits; giving up".to_string()));
                        }
                        let wait = 2u64.pow(retries) * 2000;
                        debug!("Got 429 on deposit. Sleeping for {}ms before retrying...", wait);
                        sleep(Duration::from_millis(wait)).await;
                        retries += 1;
                        continue;
                    }
                    Ok(r) => break r,
                    Err(e) => return Err(BrokerError::from(e)),
                }
            };

            let status = resp.status();
            let body = resp.text().await.map_err(BrokerError::from)?;
            if !status.is_success() {
                return Err(BrokerError::ApiRequestFailed(format!(
                    "Failed to fetch deposit history: HTTP {}", status
                )));
            }

            let parsed: Trading212DepositResponse = serde_json::from_str(&body).map_err(BrokerError::from)?;
            debug!("Parsed {} deposits", parsed.items.len());
            debug!("next_page_path (deposits): {:?}", parsed.next_page_path);

            for o in parsed.items {
                let ts = match DateTime::parse_from_rfc3339(&o.date_time) {
                    Ok(dt) => dt.naive_utc(),
                    Err(_) => {
                        debug!("Skipping deposit with invalid date: {:?}", o.date_time);
                        continue;
                    }
                };

                if ts <= since {
                    debug!("Skipping older deposits");
                    continue;
                }

                let activity_type = match o.deposit_type.as_str() {
                    "DEPOSIT" => {
                        let time = ts.time();
                        if time >= chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap()
                            && time < chrono::NaiveTime::from_hms_opt(0, 30, 0).unwrap()
                        {
                            "INTEREST"
                        } else {
                            "DEPOSIT"
                        }
                    }
                    "WITHDRAW" => "WITHDRAWAL",
                    "TRANSFER" => {
                        if o.amount > 0.0 {
                            "TRANSFER_IN"
                        } else {
                            "TRANSFER_OUT"
                        }
                    }
                    "FEE" => "FEE",
                    other => {
                        debug!("Unknown deposit type: {}", other);
                        continue;
                    }
                };

                all_activities.push(ExternalActivity {
                    symbol: "$CASH-EUR".to_string(), // tbd what should this be
                    activity_type: activity_type.to_string(),
                    quantity: o.amount.abs(),
                    price: 1.0,
                    timestamp: ts,
                    currency: Some("EUR".to_string()),
                    fee: Some(0.0),
                    comment: Some("Imported from Trading212 deposit history".to_string()),
                });
            }
            next_url = parsed.next_page_path;
            sleep(Duration::from_millis(300)).await;
        }

        debug!("Total T212 activities fetched: {}", all_activities.len());
        Ok(all_activities)
    }
}
