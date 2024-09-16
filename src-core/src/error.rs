use thiserror::Error;

#[derive(Error, Debug)]
pub enum PortfolioError {
    #[error("Database error: {0}")]
    DatabaseError(#[from] diesel::result::Error),
    #[error("Currency conversion error: {0}")]
    CurrencyConversionError(String),
    #[error("Asset not found: {0}")]
    AssetNotFoundError(String),
    #[error("Invalid data: {0}")]
    InvalidDataError(String),
}

pub type Result<T> = std::result::Result<T, PortfolioError>;
