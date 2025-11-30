//! VN Market error types

use thiserror::Error;

/// Errors that can occur when fetching Vietnamese market data
#[derive(Error, Debug)]
pub enum VnMarketError {
    /// HTTP request failed
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    /// Invalid symbol provided
    #[error("Invalid symbol: {0}")]
    InvalidSymbol(String),

    /// No data available for the requested symbol/date
    #[error("No data available for {symbol} on {date}")]
    NoData { symbol: String, date: String },

    /// Rate limited by the API
    #[error("Rate limited, retry after {0} seconds")]
    RateLimited(u64),

    /// Failed to parse API response
    #[error("Parse error: {0}")]
    ParseError(String),

    /// API returned an error
    #[error("API error: {0}")]
    ApiError(String),

    /// Database error
    #[error("Database error: {0}")]
    DatabaseError(String),

    /// Fund not found in listing
    #[error("Fund not found: {0}")]
    FundNotFound(String),

    /// Invalid date format or range
    #[error("Invalid date: {0}")]
    InvalidDate(String),
}

impl From<VnMarketError> for crate::market_data::market_data_errors::MarketDataError {
    fn from(err: VnMarketError) -> Self {
        crate::market_data::market_data_errors::MarketDataError::ProviderError(err.to_string())
    }
}
