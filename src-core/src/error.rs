use r2d2;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PortfolioError {
    #[error("Database error: {0}")]
    DatabaseError(#[from] diesel::result::Error),
    #[error("Connection error: {0}")]
    ConnectionError(r2d2::Error),
    #[error("Currency conversion error: {0}")]
    CurrencyConversionError(String),
    #[error("Asset not found: {0}")]
    AssetNotFoundError(String),
    #[error("Invalid data: {0}")]
    InvalidDataError(String),
    #[error("Parse error: {0}")]
    ParseError(String),
}

impl From<r2d2::Error> for PortfolioError {
    fn from(err: r2d2::Error) -> Self {
        PortfolioError::ConnectionError(err)
    }
}

pub type Result<T> = std::result::Result<T, PortfolioError>;
