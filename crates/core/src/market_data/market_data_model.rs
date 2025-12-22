//! Market data domain models.

use crate::market_data::market_data_constants::{
    DATA_SOURCE_ALPHA_VANTAGE, DATA_SOURCE_MANUAL, DATA_SOURCE_MARKET_DATA_APP,
    DATA_SOURCE_METAL_PRICE_API, DATA_SOURCE_YAHOO,
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Domain model for a quote
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub id: String,
    pub symbol: String,
    pub timestamp: DateTime<Utc>,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub adjclose: Decimal,
    pub volume: Decimal,
    pub currency: String,
    pub data_source: DataSource,
    pub created_at: DateTime<Utc>,
}

/// Summary model for quote search results
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummary {
    pub exchange: String,
    pub short_name: String,
    pub quote_type: String,
    pub symbol: String,
    pub index: String,
    pub score: f64,
    pub type_display: String,
    pub long_name: String,
}

#[derive(Debug, Clone)]
pub struct QuoteRequest {
    pub symbol: String,
    pub symbol_mapping: Option<String>,
    pub data_source: DataSource,
    pub currency: String,
}

/// Data source for market data
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "UPPERCASE")]
pub enum DataSource {
    Yahoo,
    MarketDataApp,
    AlphaVantage,
    MetalPriceApi,
    #[default]
    Manual,
}

impl DataSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            DataSource::Yahoo => DATA_SOURCE_YAHOO,
            DataSource::MarketDataApp => DATA_SOURCE_MARKET_DATA_APP,
            DataSource::AlphaVantage => DATA_SOURCE_ALPHA_VANTAGE,
            DataSource::MetalPriceApi => DATA_SOURCE_METAL_PRICE_API,
            DataSource::Manual => DATA_SOURCE_MANUAL,
        }
    }
}

impl From<DataSource> for String {
    fn from(source: DataSource) -> Self {
        source.as_str().to_string()
    }
}

impl From<&str> for DataSource {
    fn from(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            DATA_SOURCE_YAHOO => DataSource::Yahoo,
            DATA_SOURCE_MARKET_DATA_APP => DataSource::MarketDataApp,
            DATA_SOURCE_ALPHA_VANTAGE => DataSource::AlphaVantage,
            DATA_SOURCE_METAL_PRICE_API => DataSource::MetalPriceApi,
            _ => DataSource::Manual,
        }
    }
}

#[derive(Clone, Debug)]
pub struct LatestQuotePair {
    pub latest: Quote,
    pub previous: Option<Quote>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MarketDataProviderInfo {
    pub id: String,
    pub name: String,
    pub logo_filename: String,
    pub last_synced_date: Option<chrono::DateTime<chrono::Utc>>,
}

/// Domain model for market data provider settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketDataProviderSetting {
    pub id: String,
    pub name: String,
    pub description: String,
    pub url: Option<String>,
    pub priority: i32,
    pub enabled: bool,
    pub logo_filename: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_error: Option<String>,
}

/// Update model for market data provider settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMarketDataProviderSetting {
    pub priority: Option<i32>,
    pub enabled: Option<bool>,
}

// --- Quote Import Models ---

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuoteImport {
    pub symbol: String,
    pub date: String, // ISO format YYYY-MM-DD
    pub open: Option<Decimal>,
    pub high: Option<Decimal>,
    pub low: Option<Decimal>,
    pub close: Decimal, // Required field
    pub volume: Option<Decimal>,
    pub currency: String,
    pub validation_status: ImportValidationStatus,
    pub error_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub enum ImportValidationStatus {
    Valid,
    Warning(String),
    Error(String),
}
