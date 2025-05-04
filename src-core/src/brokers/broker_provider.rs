use async_trait::async_trait;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use crate::models::NewActivity;
use crate::schema::activities::dsl::*;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel::dsl::max;
use log::debug;

#[derive(Debug, Error)]
pub enum BrokerError {
    #[error("Key error: {0}")]
    Key(String),
    #[error("Missing broker API data")]
    MissingApiData,
    #[error("Invalid broker API format")]
    InvalidApiData,
    #[error("Missing broker name")]
    MissingBrokerName,
    #[error("Unsupported broker: {0}")]
    UnsupportedBroker(String),
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),
    #[error("API request failed: {0}")]
    ApiRequestFailed(String),
    #[error("Invalid response: {0}")]
    InvalidApiResponse(String),
    #[error("Rate limited: {0}")]
    RateLimited(String),
    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<reqwest::Error> for BrokerError {
    fn from(e: reqwest::Error) -> Self {
        BrokerError::ApiRequestFailed(e.to_string())
    }
}
impl From<serde_json::Error> for BrokerError {
    fn from(e: serde_json::Error) -> Self {
        BrokerError::InvalidApiResponse(e.to_string())
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BrokerApiConfig {
    pub api_key: String,
    pub optional: Option<String>,
    pub account_id: Option<String>,
}

impl Default for BrokerApiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            optional: None,
            account_id: None,
        }
    }
}

#[async_trait]
pub trait BrokerProvider: Send + Sync {
    async fn fetch_activities(&self, since: NaiveDateTime) -> Result<Vec<ExternalActivity>, BrokerError>;
}

#[derive(Debug, Clone)]
pub struct ExternalActivity {
    pub symbol: String,
    pub activity_type: String,
    pub quantity: f64,
    pub price: f64,
    pub timestamp: NaiveDateTime,
    pub currency: Option<String>,
    pub fee: Option<f64>,
    pub comment: Option<String>,
}

impl ExternalActivity {
    pub fn to_new_activity(&self, acc_id: &str, ass_id: &str) -> NewActivity {
        debug!("Creating new activity");
        NewActivity {
            id: Some(uuid::Uuid::new_v4().to_string()),
            account_id: acc_id.to_string(),
            asset_id: ass_id.to_string(),
            activity_type: self.activity_type.clone(),
            activity_date: self.timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
            quantity: self.quantity,
            unit_price: self.price,
            currency: self.currency.clone().unwrap_or_else(|| "USD".to_string()),
            fee: self.fee.unwrap_or(0.0),
            is_draft: false,
            comment: self.comment.clone(),
        }
    }
}

// Get the last synced transaction from the account -> this way we don't have to pull all the account history everytime
pub fn get_last_synced_timestamp(
    conn: &mut SqliteConnection,
    account_id_val: &str,
) -> Result<NaiveDateTime, BrokerError> {
    let result = activities
        .filter(account_id.eq(account_id_val))
        .select(max(activity_date))
        .first::<Option<NaiveDateTime>>(conn)
        .map_err(|e| BrokerError::ApiRequestFailed(format!("Failed to query last activity: {}", e)))?;

    Ok(result.unwrap_or_else(|| {
        NaiveDateTime::parse_from_str("2020-01-01 00:00:00", "%Y-%m-%d %H:%M:%S").unwrap()
    }))
}
