use diesel::result::Error as DieselError;
use thiserror::Error;

/// Custom error type for account-related operations
#[derive(Debug, Error)]
pub enum AccountError {
    #[error("Database error: {0}")]
    DatabaseError(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Invalid data: {0}")]
    InvalidData(String),
}

impl From<DieselError> for AccountError {
    fn from(err: DieselError) -> Self {
        match err {
            DieselError::NotFound => AccountError::NotFound("Record not found".to_string()),
            _ => AccountError::DatabaseError(err.to_string()),
        }
    }
}

/// Result type for account operations
pub type Result<T> = std::result::Result<T, AccountError>; 