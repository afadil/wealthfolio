use async_trait::async_trait;
use chrono::{DateTime, NaiveDateTime};
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use crate::brokers::broker_provider::{
    BrokerApiConfig, BrokerError, BrokerProvider, ExternalActivity,
};
use log::debug;

pub struct CoinbaseProvider {
    api_key: String,
    client: Client,
    endpoint: String,
}

impl CoinbaseProvider {
    pub async fn new(config: BrokerApiConfig) -> Result<Self, BrokerError> {
        if config.api_key.is_empty() {
            return Err(BrokerError::AuthenticationFailed("API key is empty".to_string()));
        }

        Ok(Self {
            api_key: config.api_key,
            client: Client::new(),
            endpoint: "https://api.coinbase.com/v2".to_string(),
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct CoinbaseMoney {
    pub amount: String,
    pub currency: String,
}

#[derive(Debug, Deserialize)]
pub struct CoinbaseTransaction {
    pub id: String,
    #[serde(rename = "type")]
    pub tx_type: String,
    pub status: String,
    pub amount: CoinbaseMoney,
    pub native_amount: CoinbaseMoney,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub details: Option<HashMap<String, String>>,
    pub to: Option<HashMap<String, String>>,
    pub network: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
struct BrokerageAccount {
    uuid: String,
    name: String,
    currency: String,
    r#type: Option<String>,
    active: bool,
    ready: bool,
    platform: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TransactionListResponse {
    pub data: Vec<CoinbaseTransaction>,
}

#[derive(Debug, Deserialize)]
struct BrokerageAccountsResponse {
    accounts: Vec<BrokerageAccount>,
    has_next: bool,
    cursor: Option<String>,
    size: Option<u32>,
}

#[async_trait]
impl BrokerProvider for CoinbaseProvider {
    async fn fetch_activities(&self, since: NaiveDateTime) -> Result<Vec<ExternalActivity>, BrokerError> {
        let accounts_url = format!("{}/v2/accounts", self.endpoint);
        let accounts_response = self.client
            .get(&accounts_url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|e| BrokerError::ApiRequestFailed(format!("Failed to fetch accounts: {}", e)))?;

        let status = accounts_response.status();
        let body = accounts_response.text().await.map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?;
        if !status.is_success() {
            return Err(BrokerError::ApiRequestFailed(format!("Coinbase returned {}: {}", status, body)));
        }

        let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| BrokerError::Unknown(e.to_string()))?;

        let accounts = json["data"]
            .as_array()
            .ok_or_else(|| BrokerError::Unknown("Missing 'data' field for accounts".to_string()))?;
        
        let mut activities = vec![];
        for acc in accounts {
            let url = format!("{}/accounts/{}/transactions", self.endpoint, acc);

            let response = self.client
                .get(&url)
                .bearer_auth(&self.api_key)
                .send()
                .await
                .map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?;

            if !response.status().is_success() {
                return Err(BrokerError::ApiRequestFailed(format!("Coinbase returned {}", response.status())));
            }

            let txs: TransactionListResponse = response
                .json()
                .await
                .map_err(|e| BrokerError::Unknown(e.to_string()))?;

            for tx in txs.data {
                let created_at = DateTime::parse_from_rfc3339(&tx.created_at)
                    .map(|dt| dt.naive_utc())
                    .unwrap_or_else(|_| NaiveDateTime::from_timestamp(0, 0));

                if created_at < since {
                    continue;
                }

                let quantity: f64 = tx.amount.amount.parse().unwrap_or(0.0);
                let native_total: f64 = tx.native_amount.amount.parse().unwrap_or(0.0);

                let price = if quantity.abs() > 0.0 {
                    native_total.abs() / quantity.abs()
                } else {
                    0.0
                };

                let activity_type = match tx.tx_type.as_str() {
                    "buy" => "BUY",
                    "sell" => "SELL",
                    "send" => "SEND",
                    "receive" => "RECEIVE",
                    "transfer" => "TRANSFER",
                    _ => "OTHER", // How to handle this case?
                }.to_string();

                let comment = tx.details
                    .as_ref()
                    .and_then(|d| d.get("title").cloned())
                    .or_else(|| tx.description.clone())
                    .unwrap_or_else(|| "Coinbase API transaction".to_string());

                activities.push(ExternalActivity {
                    symbol: format!("{}-USD", tx.amount.currency),
                    activity_type,
                    quantity: quantity.abs(),
                    price,
                    timestamp: created_at,
                    currency: Some(format!("$CASH-{}", tx.native_amount.currency.clone())),
                    fee: None,
                    comment: Some(comment),
                });
            }
        }
        Ok(activities)
    }
}
