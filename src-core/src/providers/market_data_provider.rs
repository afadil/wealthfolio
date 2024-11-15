use crate::models::{NewAsset, Quote, QuoteSummary};
use async_trait::async_trait;
use std::time::SystemTime;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MarketDataError {
    #[error("Provider error: {0}")]
    ProviderError(String),
    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),
    #[error("Parsing error: {0}")]
    ParsingError(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Rate limit exceeded")]
    RateLimitExceeded,
    #[error("Unknown error: {0}")]
    Unknown(String),
}

#[derive(Debug)]
pub enum MarketDataProviderType {
    Yahoo,
    Manual,
}

#[async_trait]
pub trait MarketDataProvider: Send + Sync {
    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError>;
    async fn get_symbol_profile(&self, symbol: &str) -> Result<NewAsset, MarketDataError>;
    async fn get_latest_quote(&self, symbol: &str) -> Result<Quote, MarketDataError>;
    async fn get_stock_history(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
    ) -> Result<Vec<Quote>, MarketDataError>;
    async fn get_exchange_rate(&self, from: &str, to: &str) -> Result<f64, MarketDataError>;
}
