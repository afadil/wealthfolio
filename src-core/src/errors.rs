use chrono::{DateTime, NaiveDate, ParseError as ChronoParseError, Utc};
use diesel::result::Error as DieselError;
use std::num::ParseFloatError;
use thiserror::Error;

use crate::activities::ActivityError;
use crate::fx::FxError;
use crate::market_data::MarketDataError;

// Create a type alias for Result using our Error type
pub type Result<T> = std::result::Result<T, Error>;

/// Root error type for the portfolio application
#[derive(Error, Debug)]
pub enum Error {
    #[error("Database operation failed: {0}")]
    Database(#[from] DatabaseError),

    #[error("Asset operation failed: {0}")]
    Asset(String),

    #[error("Failed to convert between currencies: {0}")]
    CurrencyConversionFailed(String),
    #[error("Currency '{0}' is not supported")]
    UnsupportedCurrency(String),
    #[error("Invalid exchange rate: {0}")]
    InvalidExchangeRate(String),

    #[error("Input validation failed: {0}")]
    Validation(#[from] ValidationError),

    #[error("Failed to load configuration: {0}")]
    ConfigIO(String),
    #[error("Invalid configuration value: {0}")]
    InvalidConfigValue(String),
    #[error("Missing configuration key: {0}")]
    MissingConfigKey(String),

    #[error("Market data operation failed: {0}")]
    MarketData(#[from] MarketDataError),

    #[error("Activity error: {0}")]
    Activity(#[from] ActivityError),

    #[error("Repository error: {0}")]
    Repository(String),

    #[error("Holdings calculation failed: {0}")]
    Calculation(#[from] CalculatorError),

    #[error("Unexpected error: {0}")]
    Unexpected(String),

    #[error("Fx error: {0}")]
    Fx(#[from] FxError),
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

    #[error("Internal error: {0}")]
    Internal(String), // For unexpected logic failures
}

#[derive(Error, Debug)]
pub enum CalculatorError {
    #[error("Invalid activity data: {0}")]
    InvalidActivity(String),
    #[error("Insufficient shares for asset {asset_id} in account {account_id} on date {date}")]
    InsufficientShares {
        asset_id: String,
        account_id: String,
        date: DateTime<Utc>,
    },

    #[error("Currency mismatch for position {position_id} ({}): Activity {activity_id} has currency {}. Requires currency conversion activity first.",
        position_currency, activity_currency
    )]
    CurrencyMismatch {
        position_id: String,
        position_currency: String,
        activity_id: String,
        activity_currency: String,
    },
    #[error("FX rate {0}->{1} not found in pre-fetched cache for date {2}")]
    MissingFxRate(String, String, NaiveDate),
    #[error("Position not found for asset {asset_id} in account {account_id} during operation")]
    PositionNotFound {
        asset_id: String,
        account_id: String,
    },
    #[error("Lot not found during operation (this should not happen): Lot ID {lot_id}")]
    LotNotFound { lot_id: String },
    #[error("Unsupported activity type: {0}")]
    UnsupportedActivityType(String),
    #[error("Calculation failed: {0}")]
    Calculation(String),
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

    #[error("Failed to parse date/time: {0}")]
    DateTimeParse(#[from] ChronoParseError),
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

// Add From implementation for diesel::ConnectionError
impl From<diesel::ConnectionError> for Error {
    fn from(err: diesel::ConnectionError) -> Self {
        Error::Database(DatabaseError::ConnectionFailed(err))
    }
}

// Add From implementation for FxError
// impl From<FxError> for Error {
//     fn from(err: FxError) -> Self {
//         Error::Currency(CurrencyError::ConversionFailed(err.to_string()))
//     }
// }

// Add From implementation for AssetError
// impl From<AssetError> for Error {
//     fn from(err: AssetError) -> Self {
//         Error::Asset(err.to_string())
//     }
// }

// Add From implementation for chrono::ParseError
impl From<ChronoParseError> for Error {
    fn from(err: ChronoParseError) -> Self {
        Error::Validation(ValidationError::DateTimeParse(err))
    }
}

// Convert Error enum to String, leveraging the Display impl from thiserror
impl From<Error> for String {
    fn from(err: Error) -> Self {
        err.to_string()
    }
}
