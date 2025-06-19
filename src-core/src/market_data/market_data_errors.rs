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
    NotFound(String), // Generic not found

    // New variant: Specific not found for a symbol
    #[error("No data found for symbol: {0}")]
    NoDataFoundForSymbol(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    // New variant: No providers available
    #[error("No providers available to fulfill the request.")]
    NoProvidersAvailable,

    // New variant: Operation not supported by provider/registry
    #[error("Operation not supported: {0}")]
    OperationNotSupported(String),

    #[error("Invalid data: {0}")]
    InvalidData(String),

    #[error("Configuration error: {0}")]
    ConfigurationError(String), // For issues like bad provider config

    #[error("Unknown error: {0}")]
    Unknown(String),

    #[error("Provider exhausted: {0}")]
    ProviderExhausted(String),

    #[error("No data found")] // General no data, distinct from specific symbol not found
    NoData,

    #[error("API key storage error: {0}")]
    ApiKeyStorageError(String),
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
