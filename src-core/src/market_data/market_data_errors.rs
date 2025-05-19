use thiserror::Error;

use crate::errors::DatabaseError;
use yahoo_finance_api::YahooError;

#[derive(Error, Debug)]
pub enum MarketDataError {
    #[error("Database error: {0}")]
    DatabaseError(#[from] diesel::result::Error),

    #[error("Database error: {0}")]
    DatabaseConnectionError(#[from] DatabaseError),

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

    #[error("Invalid data: {0}")]
    InvalidData(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<YahooError> for MarketDataError {
    fn from(error: YahooError) -> Self {
        match error {
            YahooError::FetchFailed(e) => MarketDataError::ProviderError(e),
            YahooError::NoQuotes => MarketDataError::NotFound("No quotes found".to_string()),
            YahooError::NoResult => MarketDataError::NotFound("No data found".to_string()),
            _ => MarketDataError::Unknown(error.to_string()),
        }
    }
}
