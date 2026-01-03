//! Error types and retry classification for the market data crate.
//!
//! This module provides:
//! - [`MarketDataError`]: The main error enum for all market data operations
//! - [`RetryClass`]: Classification for determining retry behavior

mod retry;

pub use retry::RetryClass;

use thiserror::Error;

/// Errors that can occur during market data operations.
///
/// Each variant is classified into a [`RetryClass`] via the [`retry_class`](Self::retry_class)
/// method, which determines how the provider registry should handle the error.
#[derive(Error, Debug)]
pub enum MarketDataError {
    /// The requested symbol was not found by the provider.
    /// This is a terminal error - retrying won't help.
    #[error("Symbol not found: {0}")]
    SymbolNotFound(String),

    /// The asset type is not supported by any provider.
    /// For example, trying to fetch market data for a manual-only asset.
    #[error("Unsupported asset type: {0}")]
    UnsupportedAssetType(String),

    /// No data available for the requested date range.
    /// The symbol exists but has no quotes in the specified period.
    #[error("No data for date range")]
    NoDataForRange,

    /// The provider rate limited the request (HTTP 429).
    /// Should retry with exponential backoff.
    #[error("Rate limited: {provider}")]
    RateLimited {
        /// The provider that rate limited the request
        provider: String,
    },

    /// The request to the provider timed out.
    /// Should retry with exponential backoff.
    #[error("Timeout: {provider}")]
    Timeout {
        /// The provider that timed out
        provider: String,
    },

    /// A provider-specific error occurred.
    /// Try the next provider in the chain.
    #[error("Provider error: {provider} - {message}")]
    ProviderError {
        /// The provider that returned the error
        provider: String,
        /// The error message from the provider
        message: String,
    },

    /// Symbol resolution failed for a specific provider.
    /// The provider doesn't know how to handle this instrument.
    /// Try the next provider in the chain.
    #[error("Resolution failed for provider: {provider}")]
    ResolutionFailed {
        /// The provider that failed to resolve the symbol
        provider: String,
    },

    /// The circuit breaker is open for this provider.
    /// Skip this provider until the circuit closes.
    #[error("Circuit open: {provider}")]
    CircuitOpen {
        /// The provider with an open circuit
        provider: String,
    },

    /// Data validation failed.
    /// The provider returned data that failed validation checks.
    #[error("Validation failed: {message}")]
    ValidationFailed {
        /// Description of the validation failure
        message: String,
    },

    /// No providers are available to handle the request.
    /// All providers are either circuit-broken or don't support the asset type.
    #[error("No providers available")]
    NoProvidersAvailable,

    /// All providers were tried and all failed.
    /// This is a terminal error after exhausting all options.
    #[error("All providers failed")]
    AllProvidersFailed,

    /// A network error occurred while communicating with a provider.
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
}

impl MarketDataError {
    /// Returns the retry classification for this error.
    ///
    /// This classification determines how the provider registry should handle the error:
    ///
    /// - [`RetryClass::Never`]: Don't retry, the error is terminal
    /// - [`RetryClass::WithBackoff`]: Retry with exponential backoff
    /// - [`RetryClass::NextProvider`]: Try the next provider in the chain
    /// - [`RetryClass::CircuitOpen`]: Provider circuit is open, skip it
    ///
    /// # Examples
    ///
    /// ```
    /// use wealthfolio_market_data::errors::{MarketDataError, RetryClass};
    ///
    /// let error = MarketDataError::RateLimited { provider: "YAHOO".to_string() };
    /// assert_eq!(error.retry_class(), RetryClass::WithBackoff);
    ///
    /// let error = MarketDataError::SymbolNotFound("INVALID".to_string());
    /// assert_eq!(error.retry_class(), RetryClass::Never);
    /// ```
    pub fn retry_class(&self) -> RetryClass {
        match self {
            // Terminal errors - never retry
            Self::SymbolNotFound(_)
            | Self::UnsupportedAssetType(_)
            | Self::NoDataForRange
            | Self::ValidationFailed { .. } => RetryClass::Never,

            // Transient errors - retry with backoff
            Self::RateLimited { .. } | Self::Timeout { .. } => RetryClass::WithBackoff,

            // Provider-specific failures - try next provider
            Self::ProviderError { .. } | Self::ResolutionFailed { .. } => RetryClass::NextProvider,

            // Circuit breaker open
            Self::CircuitOpen { .. } => RetryClass::CircuitOpen,

            // Exhausted all options - terminal
            Self::NoProvidersAvailable | Self::AllProvidersFailed | Self::Network(_) => {
                RetryClass::Never
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_symbol_not_found_never_retries() {
        let error = MarketDataError::SymbolNotFound("INVALID".to_string());
        assert_eq!(error.retry_class(), RetryClass::Never);
    }

    #[test]
    fn test_unsupported_asset_type_never_retries() {
        let error = MarketDataError::UnsupportedAssetType("Property".to_string());
        assert_eq!(error.retry_class(), RetryClass::Never);
    }

    #[test]
    fn test_no_data_for_range_never_retries() {
        let error = MarketDataError::NoDataForRange;
        assert_eq!(error.retry_class(), RetryClass::Never);
    }

    #[test]
    fn test_validation_failed_never_retries() {
        let error = MarketDataError::ValidationFailed {
            message: "OHLC invariant violated".to_string(),
        };
        assert_eq!(error.retry_class(), RetryClass::Never);
    }

    #[test]
    fn test_rate_limited_retries_with_backoff() {
        let error = MarketDataError::RateLimited {
            provider: "YAHOO".to_string(),
        };
        assert_eq!(error.retry_class(), RetryClass::WithBackoff);
    }

    #[test]
    fn test_timeout_retries_with_backoff() {
        let error = MarketDataError::Timeout {
            provider: "ALPHA_VANTAGE".to_string(),
        };
        assert_eq!(error.retry_class(), RetryClass::WithBackoff);
    }

    #[test]
    fn test_provider_error_tries_next_provider() {
        let error = MarketDataError::ProviderError {
            provider: "YAHOO".to_string(),
            message: "Internal server error".to_string(),
        };
        assert_eq!(error.retry_class(), RetryClass::NextProvider);
    }

    #[test]
    fn test_resolution_failed_tries_next_provider() {
        let error = MarketDataError::ResolutionFailed {
            provider: "YAHOO".to_string(),
        };
        assert_eq!(error.retry_class(), RetryClass::NextProvider);
    }

    #[test]
    fn test_circuit_open_returns_circuit_open() {
        let error = MarketDataError::CircuitOpen {
            provider: "YAHOO".to_string(),
        };
        assert_eq!(error.retry_class(), RetryClass::CircuitOpen);
    }

    #[test]
    fn test_no_providers_available_never_retries() {
        let error = MarketDataError::NoProvidersAvailable;
        assert_eq!(error.retry_class(), RetryClass::Never);
    }

    #[test]
    fn test_all_providers_failed_never_retries() {
        let error = MarketDataError::AllProvidersFailed;
        assert_eq!(error.retry_class(), RetryClass::Never);
    }

    #[test]
    fn test_error_display() {
        let error = MarketDataError::SymbolNotFound("INVALID".to_string());
        assert_eq!(format!("{}", error), "Symbol not found: INVALID");

        let error = MarketDataError::RateLimited {
            provider: "YAHOO".to_string(),
        };
        assert_eq!(format!("{}", error), "Rate limited: YAHOO");

        let error = MarketDataError::ProviderError {
            provider: "ALPHA_VANTAGE".to_string(),
            message: "API key invalid".to_string(),
        };
        assert_eq!(
            format!("{}", error),
            "Provider error: ALPHA_VANTAGE - API key invalid"
        );
    }
}
