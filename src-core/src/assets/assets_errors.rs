use diesel::result::Error as DieselError;
use thiserror::Error;
use crate::db::DatabaseError;

/// Custom error type for asset-related operations
#[derive(Debug, Error)]
pub enum AssetError {
    #[error("Database error: {0}")]
    DatabaseError(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Invalid data: {0}")]
    InvalidData(String),
    #[error("Market data error: {0}")]
    MarketDataError(String),
    #[error("Sync error: {0}")]
    SyncError(String),
}

impl From<DieselError> for AssetError {
    fn from(err: DieselError) -> Self {
        match err {
            DieselError::NotFound => AssetError::NotFound("Record not found".to_string()),
            _ => AssetError::DatabaseError(err.to_string()),
        }
    }
}

impl From<DatabaseError> for AssetError {
    fn from(err: DatabaseError) -> Self {
        match err {
            DatabaseError::ConnectionFailed(e) => AssetError::DatabaseError(format!("Connection failed: {}", e)),
            DatabaseError::PoolCreationFailed(e) => AssetError::DatabaseError(format!("Pool creation failed: {}", e)),
            DatabaseError::QueryFailed(e) => match e {
                DieselError::NotFound => AssetError::NotFound("Record not found".to_string()),
                _ => AssetError::DatabaseError(format!("Query failed: {}", e)),
            },
            DatabaseError::MigrationFailed(e) => AssetError::DatabaseError(format!("Migration failed: {}", e)),
            DatabaseError::BackupFailed(e) => AssetError::DatabaseError(format!("Backup failed: {}", e)),
            DatabaseError::RestoreFailed(e) => AssetError::DatabaseError(format!("Restore failed: {}", e)),
        }
    }
}

/// Result type for asset operations
pub type Result<T> = std::result::Result<T, AssetError>; 