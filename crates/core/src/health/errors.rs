//! Health Center error types.
//!
//! This module defines health-specific errors that can occur during
//! check execution and fix action handling.

use thiserror::Error;

/// Errors specific to health center operations.
#[derive(Error, Debug)]
pub enum HealthError {
    /// A health check failed to execute.
    #[error("Health check '{check_id}' failed: {message}")]
    CheckFailed { check_id: String, message: String },

    /// A fix action failed to execute.
    #[error("Fix action '{action_id}' failed: {message}")]
    FixActionFailed { action_id: String, message: String },

    /// An unknown fix action was requested.
    #[error("Unknown fix action: {0}")]
    UnknownFixAction(String),

    /// Invalid payload for a fix action.
    #[error("Invalid payload for fix action '{action_id}': {message}")]
    InvalidFixPayload { action_id: String, message: String },

    /// Configuration validation error.
    #[error("Invalid health configuration: {0}")]
    InvalidConfig(String),

    /// Issue not found error.
    #[error("Issue not found: {0}")]
    IssueNotFound(String),
}

impl HealthError {
    /// Creates a CheckFailed error.
    pub fn check_failed(check_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self::CheckFailed {
            check_id: check_id.into(),
            message: message.into(),
        }
    }

    /// Creates a FixActionFailed error.
    pub fn fix_failed(action_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self::FixActionFailed {
            action_id: action_id.into(),
            message: message.into(),
        }
    }

    /// Creates an InvalidFixPayload error.
    pub fn invalid_payload(action_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self::InvalidFixPayload {
            action_id: action_id.into(),
            message: message.into(),
        }
    }
}

// Convert to core Error type
impl From<HealthError> for crate::errors::Error {
    fn from(err: HealthError) -> Self {
        crate::errors::Error::Unexpected(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_messages() {
        let err = HealthError::check_failed("price_staleness", "Database timeout");
        assert_eq!(
            err.to_string(),
            "Health check 'price_staleness' failed: Database timeout"
        );

        let err = HealthError::fix_failed("sync_prices", "Network error");
        assert_eq!(
            err.to_string(),
            "Fix action 'sync_prices' failed: Network error"
        );

        let err = HealthError::UnknownFixAction("bad_action".to_string());
        assert_eq!(err.to_string(), "Unknown fix action: bad_action");
    }
}
