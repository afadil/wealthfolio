use chrono::{DateTime, Utc};
use thiserror::Error;
// --- Define Result Type ---
pub type Result<T> = std::result::Result<T, CalculatorError>;

// --- Custom Error Type ---
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
    #[error("Internal error: {0}")]
    Internal(String), // For unexpected logic failures
}