use async_trait::async_trait;
use chrono::{DateTime, NaiveDateTime, NaiveTime};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use std::time::Duration as StdDuration;
use tokio::time::sleep;
use log::debug;

use crate::brokers::broker_provider::{
    BrokerApiConfig, BrokerError, BrokerProvider, ExternalActivity,
};

static ORDERS_ENDPOINT: &str = "https://live.trading212.com/api/v0/equity/history/orders";
static DIVIDENDS_ENDPOINT: &str = "https://live.trading212.com/api/v0/history/dividends";
static DEPOSITS_ENDPOINT: &str = "https://live.trading212.com/api/v0/history/transactions";

pub struct Trading212Provider {
    api_key: String,
    client: Client,
}

impl Trading212Provider {
    pub async fn new(config: BrokerApiConfig) -> Result<Self, BrokerError> {
        if config.api_key.trim().is_empty() {
            return Err(BrokerError::AuthenticationFailed("API key is empty".into()));
        }
        Ok(Self {
            api_key: config.api_key,
            client: Client::new(),
        })
    }

    async fn retry_get(&self, url: &str) -> Result<String, BrokerError> {
        let mut retries = 0;
        loop {
            debug!("GET {}", url);
            let resp = self.client
                .get(url)
                .header("Authorization", &self.api_key)
                .send()
                .await
                .map_err(BrokerError::from)?;

            if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                if retries >= 5 {
                    return Err(BrokerError::ApiRequestFailed("Too many 429s; giving up".into()));
                }
                let wait = 2u64.pow(retries) * 2000;
                debug!("429 received; retrying in {}ms", wait);
                sleep(StdDuration::from_millis(wait)).await;
                retries += 1;
                continue;
            }
            let status = resp.status();
            let body = resp.text().await.map_err(BrokerError::from)?;
            if !status.is_success() {
                return Err(BrokerError::ApiRequestFailed(format!(
                    "HTTP {}: {}",
                    status, body
                )));
            }
            return Ok(body);
        }
    }

    async fn fetch_paginated<T, R, F>(
        &self,
        base_url: &str,
        since: NaiveDateTime,
        mut to_activity: F,
    ) -> Result<Vec<ExternalActivity>, BrokerError>
    where
        T: DeserializeOwned,
        R: PageResponse<Item = T> + DeserializeOwned,
        F: FnMut(&T, NaiveDateTime) -> Option<ExternalActivity>,
    {
        let mut activities = Vec::new();
        let mut cursor = Some(base_url.to_string());
        let mut stop_early = false;

        while let Some(path) = cursor.filter(|_| !stop_early) {
            // Build full URL matching original behavior
            let full_url = if path.starts_with("http") {
                // Absolute URL returned
                path.clone()
            } else if base_url == DEPOSITS_ENDPOINT {
                // Deposits: append query parameters to the base endpoint
                if path.starts_with('?') {
                    // API returned leading '?'
                    format!("{}{}", base_url, path)
                } else {
                    format!("{}?{}", base_url, path)
                }
            } else {
                // Orders & Dividends: prefix relative paths with host
                format!("https://live.trading212.com{}", path)
            };

            let body = self.retry_get(&full_url).await?;
            let page: R = serde_json::from_str(&body).map_err(BrokerError::from)?;
            debug!("fetched {} items", page.items().len());

            for item in page.items().iter() {
                if let Some(act) = to_activity(item, since) {
                    activities.push(act);
                } else {
                    // Stop early only when item is older than since
                    stop_early = true;
                    break;
                }
            }

            cursor = page.next_page_path();
            sleep(StdDuration::from_millis(300)).await;
        }

        Ok(activities)
    }

    fn convert_t212_to_yahoo_ticker(raw: &str) -> String {
        let mut base = raw.to_string();
        for suf in &["_EQ","_ETF","_CFD","_FUND","_ADR","_TR"] {
            if base.ends_with(suf) {
                base.truncate(base.len() - suf.len());
                break;
            }
        }

        if let Some(pos) = base.find("_US") {
            return base[..pos].to_string();
        }

        let letters: String = base.chars().filter(|c| c.is_alphabetic()).collect();
        let symbol: String = letters.chars().filter(|c| c.is_uppercase()).collect();
        if let Some(code) = letters.chars().find(|c| c.is_lowercase()) {
            let suffix = match code {
                'a' => ".AS",
                'l' => ".L",
                'd' => ".DE",
                'm' => ".MI",
                'p' => ".PA",
                'h' => ".HK",
                't' => ".TO",
                'v' => ".V",
                'n' => ".NE",
                'o' => ".OL",
                'k' => ".KS",
                's' => ".SG",
                _   => "",
            };
            if !suffix.is_empty() {
                return format!("{}{}", symbol, suffix);
            }
        }
        symbol
    }
}

trait PageResponse {
    type Item;
    fn items(&self) -> &Vec<Self::Item>;
    fn next_page_path(&self) -> Option<String>;
}

// === Response structs ===
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212OrderResponse {
    items: Vec<Trading212Order>,
    next_page_path: Option<String>,
}
impl PageResponse for Trading212OrderResponse {
    type Item = Trading212Order;
    fn items(&self) -> &Vec<Self::Item> { &self.items }
    fn next_page_path(&self) -> Option<String> { self.next_page_path.clone() }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212DividendResponse {
    items: Vec<Trading212Dividend>,
    next_page_path: Option<String>,
}
impl PageResponse for Trading212DividendResponse {
    type Item = Trading212Dividend;
    fn items(&self) -> &Vec<Self::Item> { &self.items }
    fn next_page_path(&self) -> Option<String> { self.next_page_path.clone() }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212DepositResponse {
    items: Vec<Trading212Deposit>,
    next_page_path: Option<String>,
}
impl PageResponse for Trading212DepositResponse {
    type Item = Trading212Deposit;
    fn items(&self) -> &Vec<Self::Item> { &self.items }
    fn next_page_path(&self) -> Option<String> { self.next_page_path.clone() }
}

// === Domain models ===
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trading212Order {
    pub ticker: String,
    pub date_executed: Option<String>,
    pub date_created: Option<String>,
    pub filled_quantity: Option<f64>,
    pub filled_value: Option<f64>,
    pub fill_price: Option<f64>,
    pub ordered_value: Option<f64>,
    #[serde(default)]
    pub taxes: Vec<Trading212Tax>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trading212Tax {
    pub quantity: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212Dividend {
    pub ticker: String,
    pub paid_on: String,
    pub quantity: f64,
    pub gross_amount_per_share: Option<f64>,
    pub amount: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trading212Deposit {
    pub amount: f64,
    pub date_time: String,
    #[serde(rename = "type")]
    pub kind: String,
}

// === Converters ===
impl Trading212Order {
    fn to_activity(&self, since: NaiveDateTime) -> Option<ExternalActivity> {
        let ts_opt = self.date_executed.as_ref().or(self.date_created.as_ref())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.naive_utc());
        let ts = match ts_opt {
            Some(t) if t.and_utc().timestamp() > since.and_utc().timestamp() => t,
            _ => return None,
        };

        let qty = self.filled_quantity
            .unwrap_or_else(|| self.filled_value.unwrap_or(0.0) / self.fill_price.unwrap_or(1.0))
            .abs();
        if qty == 0.0 { return None; }

        let price = self.fill_price.or_else(|| self.filled_value.map(|v| v / qty))?;

        let activity_type = if self.filled_value.unwrap_or(0.0) < 0.0 {
            "SELL"
        } else {
            "BUY"
        };

        let fee = self.taxes.iter().map(|t| t.quantity).sum::<f64>().abs();
        let symbol = Trading212Provider::convert_t212_to_yahoo_ticker(&self.ticker);

        Some(ExternalActivity {
            symbol,
            activity_type: activity_type.into(),
            quantity: qty,
            price,
            timestamp: ts,
            currency: Some("EUR".into()),
            fee: Some(fee),
            comment: Some("Imported from Trading212 order history".into()),
        })
    }
}

impl Trading212Dividend {
    fn to_activity(&self, since: NaiveDateTime) -> Option<ExternalActivity> {
        if self.amount.abs() == 0.0 {
            return None;
        }
        let ts = DateTime::parse_from_rfc3339(&self.paid_on).ok()?.naive_utc();
        if ts.and_utc().timestamp() <= since.and_utc().timestamp() { return None; }

        let symbol = Trading212Provider::convert_t212_to_yahoo_ticker(&self.ticker);
        Some(ExternalActivity {
            symbol,
            activity_type: "DIVIDEND".into(),
            quantity: self.quantity,
            price: self.gross_amount_per_share.unwrap_or(0.0),
            timestamp: ts,
            currency: Some("EUR".into()),
            fee: Some(0.0),
            comment: Some("Imported from Trading212 dividend history".into()),
        })
    }
}

impl Trading212Deposit {
    fn to_activity(&self, since: NaiveDateTime) -> Option<ExternalActivity> {
        let ts = DateTime::parse_from_rfc3339(&self.date_time).ok()?.naive_utc();
        if ts.and_utc().timestamp() <= since.and_utc().timestamp() { return None; }

        let activity_type = match self.kind.as_str() {
            "DEPOSIT" => {
                let t = ts.time();
                if (NaiveTime::from_hms_opt(0, 0, 0).unwrap()
                    .. NaiveTime::from_hms_opt(0, 30, 0).unwrap())
                    .contains(&t)
                {
                    "INTEREST"
                } else {
                    "DEPOSIT"
                }
            }
            "WITHDRAW"   => "WITHDRAWAL",
            "TRANSFER"   => if self.amount > 0.0 { "TRANSFER_IN" } else { "TRANSFER_OUT" },
            "FEE"        => "FEE",
            _             => return None,
        };

        Some(ExternalActivity {
            symbol: "$CASH-EUR".into(),
            activity_type: activity_type.into(),
            quantity: self.amount.abs(),
            price: 1.0,
            timestamp: ts,
            currency: Some("EUR".into()),
            fee: Some(0.0),
            comment: Some("Imported from Trading212 deposit history".into()),
        })
    }
}

#[async_trait]
impl BrokerProvider for Trading212Provider {
    async fn fetch_activities(&self, since: NaiveDateTime) -> Result<Vec<ExternalActivity>, BrokerError> {
        let mut activities = Vec::new();
        debug!("Since: {}", since);

        activities.extend(
            self.fetch_paginated::<Trading212Order, Trading212OrderResponse, _>(
                ORDERS_ENDPOINT,
                since,
                |o, s| o.to_activity(s),
            ).await?
        );

        activities.extend(
            self.fetch_paginated::<Trading212Dividend, Trading212DividendResponse, _>(
                DIVIDENDS_ENDPOINT,
                since,
                |d, s| d.to_activity(s),
            ).await?
        );

        activities.extend(
            self.fetch_paginated::<Trading212Deposit, Trading212DepositResponse, _>(
                DEPOSITS_ENDPOINT,
                since,
                |d, s| d.to_activity(s),
            ).await?
        );

        debug!("Total T212 activities fetched: {}", activities.len());
        Ok(activities)
    }
}
