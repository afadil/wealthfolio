//! Error types for the device sync crate.

use thiserror::Error;

/// Result type alias for device sync operations.
pub type Result<T> = std::result::Result<T, DeviceSyncError>;

/// Errors that can occur during device sync operations.
#[derive(Debug, Error)]
pub enum DeviceSyncError {
    /// HTTP client error
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// JSON serialization/deserialization error
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// API error response from the cloud service
    #[error("API error ({status}): {message}")]
    Api { status: u16, message: String },

    /// Invalid request (missing required data, etc.)
    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    /// Authentication error (missing or invalid token)
    #[error("Authentication error: {0}")]
    Auth(String),
}

impl DeviceSyncError {
    /// Create an API error from status and message
    pub fn api(status: u16, message: impl Into<String>) -> Self {
        Self::Api {
            status,
            message: message.into(),
        }
    }

    /// Create an invalid request error
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::InvalidRequest(message.into())
    }

    /// Create an auth error
    pub fn auth(message: impl Into<String>) -> Self {
        Self::Auth(message.into())
    }
}
