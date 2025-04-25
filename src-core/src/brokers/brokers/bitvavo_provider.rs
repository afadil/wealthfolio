use async_trait::async_trait;
use chrono::NaiveDateTime;
use chrono::DateTime;
use hmac::{Hmac, Mac};
use reqwest::Client;
use serde::Deserialize;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::brokers::broker_provider::{BrokerApiConfig, BrokerError, BrokerProvider, ExternalActivity};
type HmacSha256 = Hmac<Sha256>;

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryResponse {
    items: Vec<TransactionItem>,
    current_page: u32,
    total_pages: u32,
    max_items: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionItem {
    pub transaction_id: String,
    pub executed_at: String,

    #[serde(rename = "type")]
    pub tx_type: String,

    #[serde(default)]
    pub price_currency: Option<String>,
    #[serde(default)]
    pub price_amount: Option<String>,
    #[serde(default)]
    pub sent_currency: Option<String>,
    #[serde(default)]
    pub sent_amount: Option<String>,
    #[serde(default)]
    pub received_currency: Option<String>,
    #[serde(default)]
    pub received_amount: Option<String>,
    #[serde(default)]
    pub fees_currency: Option<String>,
    #[serde(default)]
    pub fees_amount: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
}

pub struct BitvavoProvider {
    api_key: String,
    api_secret: String,
    client: Client,
    endpoint: String,
}

impl BitvavoProvider {
    pub async fn new(config: BrokerApiConfig) -> Result<Self, BrokerError> {
        let api_secret = config.api_key;
        let api_key = config.optional
            .ok_or(BrokerError::MissingApiData)?;

        Ok(Self {
            api_key,
            api_secret,
            client: Client::new(),
            endpoint: "https://api.bitvavo.com/v2/account/history".to_string(),
        })
    }
}

#[async_trait]
impl BrokerProvider for BitvavoProvider {
    async fn fetch_activities(&self, since: NaiveDateTime) -> Result<Vec<ExternalActivity>, BrokerError> {
        let mut all_activities = Vec::new();
        let from_ts = since.and_utc().timestamp_millis();
        let to_ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| BrokerError::ApiRequestFailed(format!("Time error: {}", e)))?
            .as_millis() as i64;

        let mut page = 1;
        let page_size = 100;

        while page <= u32::MAX {
            let query = format!(
                "fromDate={}&toDate={}&page={}&maxItems={}",
                from_ts, to_ts, page, page_size
            );

            let timestamp_str = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| BrokerError::ApiRequestFailed(format!("Timestamp error: {}", e)))?
                .as_millis()
                .to_string();
            let path = "/v2/account/history";
            let prehash = format!("{}GET{}?{}", timestamp_str, path, query);

            let mut mac = HmacSha256::new_from_slice(self.api_secret.as_bytes())
                .map_err(|e| BrokerError::ApiRequestFailed(format!("Invalid HMAC secret length: {}", e)))?;
            mac.update(prehash.as_bytes());
            let signature = hex::encode(mac.finalize().into_bytes());

            let url = format!("{}?{}", self.endpoint, query);
            let resp = self.client
                .get(&url)
                .header("Bitvavo-Access-Key", &self.api_key)
                .header("Bitvavo-Access-Timestamp", &timestamp_str)
                .header("Bitvavo-Access-Window", "10000")
                .header("Bitvavo-Access-Signature", signature)
                .send()
                .await
                .map_err(BrokerError::from)?;

            let status = resp.status();
            let body = resp.text().await.map_err(BrokerError::from)?;

            if !status.is_success() {
                return Err(BrokerError::ApiRequestFailed(
                    format!("HTTP {}: {}", status, body)
                ));
            }

            let parsed: HistoryResponse = serde_json::from_str(&body)
                .map_err(BrokerError::from)?;

            for item in parsed.items {
                let executed = DateTime::parse_from_rfc3339(&item.executed_at)
                    .map_err(|e| BrokerError::ApiRequestFailed(format!("Failed to parse executed_at: {}", e)))?
                    .naive_utc();

                let symbol: String;
                let qty: f64;
                let activity_type = match item.tx_type.as_str() {
                    "buy" => "BUY".to_string(),
                    "sell" => "SELL".to_string(),
                    "staking" => "INTEREST".to_string(),
                    "deposit" => "DEPOSIT".to_string(),
                    "withdrawal" => "SELL".to_string(),
                    other => other.to_uppercase(),
                };
                if activity_type == "INTEREST" {
                    continue; // for now crypto staking is not suported, there's no good way to handle this in Wealtfolio a.t.m.
                    //TODO:  Maybe in the future I can add some custom code to handle this case automatically
                }
                if activity_type == "DEPOSIT" || activity_type == "WITHDRAWAL" {
                    symbol = "$CASH-EUR".to_string();
                    qty = item.received_amount.as_deref().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                } 
                else if activity_type == "SELL" {
                    let sent = item.sent_currency.clone().unwrap_or_default();
                    symbol = format!("{}-EUR", sent);
                    qty = item.sent_amount.as_deref().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                }
                else {
                    let recieved = item.received_currency.clone().unwrap_or_default();
                    symbol = format!("{}-EUR", recieved);
                    qty = item
                        .received_amount
                        .clone()
                        .unwrap_or_default()
                        .parse::<f64>()
                        .unwrap_or(0.0);
                }

                let price = item.price_amount
                    .as_deref()
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let currency = item.price_currency.clone();
                let fee = item.fees_amount
                    .as_deref()
                    .and_then(|s| s.parse::<f64>().ok());
                let comment = item.address.clone();

                all_activities.push(ExternalActivity {
                    symbol,
                    activity_type: activity_type,
                    quantity: qty,
                    price,
                    timestamp: executed,
                    currency,
                    fee,
                    comment,
                });
            }

            if page >= parsed.total_pages {
                break;
            }
            page += 1;
        }

        Ok(all_activities)
    }
}
