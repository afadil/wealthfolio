use diesel::result::Error as DieselError;
use std::num::ParseFloatError;
use thiserror::Error;

use crate::market_data::MarketDataError;
use crate::activities::ActivityError;
use crate::accounts::AccountError;
use crate::fx::FxError;
use crate::assets::assets_errors::AssetError;

// Create a type alias for Result using our Error type
pub type Result<T> = std::result::Result<T, Error>;

/// Root error type for the portfolio application
#[derive(Error, Debug)]
pub enum Error {
    #[error("Database operation failed: {0}")]
    Database(#[from] DatabaseError),

    #[error("Asset operation failed: {0}")]
    Asset(String),

    #[error("Currency operation failed: {0}")]
    Currency(#[from] CurrencyError),

    #[error("Input validation failed: {0}")]
    Validation(#[from] ValidationError),

    #[error("App Configuration failed: {0}")]
    Config(#[from] ConfigError),

    #[error("Market data operation failed: {0}")]
    MarketData(#[from] MarketDataError),

    #[error("Activity error: {0}")]
    Activity(#[from] ActivityError),

    #[error("Account error: {0}")]
    Account(#[from] AccountError),
}

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Failed to connect to database: {0}")]
    ConnectionFailed(#[from] diesel::result::ConnectionError),

    #[error("Failed to create database pool: {0}")]
    PoolCreationFailed(#[from] r2d2::Error),

    #[error("Database query failed: {0}")]
    QueryFailed(#[from] DieselError),

    #[error("Database migration failed: {0}")]
    MigrationFailed(String),

    #[error("Database backup failed: {0}")]
    BackupFailed(String),

    #[error("Database restore failed: {0}")]
    RestoreFailed(String),
}

#[derive(Error, Debug)]
pub enum CurrencyError {
    #[error("Failed to convert between currencies: {0}")]
    ConversionFailed(String),

    #[error("Currency '{0}' is not supported")]
    Unsupported(String),

    #[error("Invalid exchange rate: {0}")]
    InvalidRate(String),
}

#[derive(Error, Debug)]
pub enum ValidationError {
    #[error("Failed to parse number: {0}")]
    NumberParse(#[from] ParseFloatError),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Required field '{0}' is missing")]
    MissingField(String),

    #[error("Failed to parse decimal number: {0}")]
    DecimalParse(#[from] rust_decimal::Error),
}

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to load configuration: {0}")]
    IO(String),

    #[error("Invalid configuration value: {0}")]
    InvalidValue(String),

    #[error("Missing configuration key: {0}")]
    MissingKey(String),
}

// Implement From for DieselError to Error directly
impl From<DieselError> for Error {
    fn from(err: DieselError) -> Self {
        Error::Database(DatabaseError::QueryFailed(err))
    }
}

// Add From implementation for rust_decimal::Error
impl From<rust_decimal::Error> for Error {
    fn from(err: rust_decimal::Error) -> Self {
        Error::Validation(ValidationError::DecimalParse(err))
    }
}

// Add From implementation for Box<dyn std::error::Error>
impl From<Box<dyn std::error::Error>> for Error {
    fn from(err: Box<dyn std::error::Error>) -> Self {
        Error::Validation(ValidationError::InvalidInput(err.to_string()))
    }
}

// Add From implementation for Box<dyn std::error::Error + Send + Sync>
impl From<Box<dyn std::error::Error + Send + Sync>> for Error {
    fn from(err: Box<dyn std::error::Error + Send + Sync>) -> Self {
        Error::Validation(ValidationError::InvalidInput(err.to_string()))
    }
}

// Add From implementation for std::io::Error
impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::Validation(ValidationError::InvalidInput(err.to_string()))
    }
}

// Add From implementation for serde_json::Error
impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Error::Validation(ValidationError::InvalidInput(err.to_string()))
    }
}

// Add this implementation
impl From<r2d2::Error> for Error {
    fn from(e: r2d2::Error) -> Self {
        Error::Database(DatabaseError::PoolCreationFailed(e))
    }
}

// Add From implementation for FxError
impl From<FxError> for Error {
    fn from(err: FxError) -> Self {
        Error::Currency(CurrencyError::ConversionFailed(err.to_string()))
    }
}

// Add From implementation for AssetError
impl From<AssetError> for Error {
    fn from(err: AssetError) -> Self {
        Error::Asset(err.to_string())
    }
}







