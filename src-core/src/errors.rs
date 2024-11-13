use bigdecimal::ParseBigDecimalError;
use diesel::result::Error as DieselError;
use std::num::ParseFloatError;
use thiserror::Error;

// Create a type alias for Result using our Error type
pub type Result<T> = std::result::Result<T, Error>;

/// Root error type for the portfolio application
#[derive(Error, Debug)]
pub enum Error {
    #[error("Database operation failed: {0}")]
    Database(#[from] DatabaseError),

    #[error("Asset operation failed: {0}")]
    Asset(#[from] AssetError),

    #[error("Currency operation failed: {0}")]
    Currency(#[from] CurrencyError),

    #[error("Input validation failed: {0}")]
    Validation(#[from] ValidationError),

    #[error("App Configuration failed: {0}")]
    Config(#[from] ConfigError),
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
pub enum AssetError {
    #[error("Asset '{0}' not found")]
    NotFound(String),

    #[error("Invalid asset data: {0}")]
    InvalidData(String),

    #[error("Asset '{0}' already exists")]
    AlreadyExists(String),
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
    DecimalParse(#[from] ParseBigDecimalError),
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

// Add From implementation for ParseBigDecimalError
impl From<ParseBigDecimalError> for Error {
    fn from(err: ParseBigDecimalError) -> Self {
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
