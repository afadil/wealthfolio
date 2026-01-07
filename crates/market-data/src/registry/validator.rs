//! Quote data validation.
//!
//! Validates quote data from providers to ensure data quality:
//! - OHLC invariants (high >= low, open/close between high/low)
//! - Non-negative values
//! - Reasonable value ranges
//! - Future: staleness checks

use log::warn;
use rust_decimal::Decimal;

use crate::errors::MarketDataError;
use crate::models::{InstrumentId, Quote};

/// Validation severity levels.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValidationSeverity {
    /// Hard failure - reject quote, try next provider.
    Hard,
    /// Soft warning - accept quote but log warning.
    Soft,
}

/// Result of quote validation.
#[derive(Clone, Debug)]
pub struct ValidationResult {
    pub valid: bool,
    pub severity: Option<ValidationSeverity>,
    pub message: Option<String>,
}

impl ValidationResult {
    pub fn ok() -> Self {
        Self {
            valid: true,
            severity: None,
            message: None,
        }
    }

    pub fn hard_fail(message: impl Into<String>) -> Self {
        Self {
            valid: false,
            severity: Some(ValidationSeverity::Hard),
            message: Some(message.into()),
        }
    }

    pub fn soft_warn(message: impl Into<String>) -> Self {
        Self {
            valid: true, // Still accepted
            severity: Some(ValidationSeverity::Soft),
            message: Some(message.into()),
        }
    }
}

/// Validation result details.
#[derive(Clone, Debug)]
pub struct ValidationIssue {
    /// Severity of the issue.
    pub severity: ValidationSeverity,
    /// Description of the issue.
    pub message: String,
}

/// Quote validator configuration.
#[derive(Clone, Debug)]
pub struct ValidatorConfig {
    /// Whether to reject quotes with negative prices.
    pub reject_negative_prices: bool,
    /// Whether to reject quotes where high < low.
    pub reject_invalid_ohlc: bool,
    /// Maximum allowed price value (for sanity check).
    pub max_price: Option<Decimal>,
    /// Whether to warn on zero volume.
    pub warn_on_zero_volume: bool,
    /// Whether to warn on missing OHLC data.
    pub warn_on_missing_ohlc: bool,
}

impl Default for ValidatorConfig {
    fn default() -> Self {
        Self {
            reject_negative_prices: true,
            reject_invalid_ohlc: true,
            max_price: Some(Decimal::from(1_000_000_000i64)), // 1 billion as sanity check
            warn_on_zero_volume: true,
            warn_on_missing_ohlc: false, // OHLC is optional per spec
        }
    }
}

/// Quote data validator.
///
/// Validates quote data to ensure quality and consistency.
/// Configuration allows for different validation strictness levels.
pub struct QuoteValidator {
    config: ValidatorConfig,
}

impl QuoteValidator {
    /// Create a new validator with default configuration.
    pub fn new() -> Self {
        Self {
            config: ValidatorConfig::default(),
        }
    }

    /// Create a validator with custom configuration.
    pub fn with_config(config: ValidatorConfig) -> Self {
        Self { config }
    }

    /// Validate a quote.
    ///
    /// Returns Ok(()) if the quote is valid, or Err with details if invalid.
    /// Warnings are logged but do not cause rejection.
    pub fn validate(&self, quote: &Quote) -> Result<(), MarketDataError> {
        let mut issues: Vec<ValidationIssue> = Vec::new();

        // Validate close price (required)
        self.validate_close_price(quote, &mut issues);

        // Validate OHLC invariants
        self.validate_ohlc_invariants(quote, &mut issues);

        // Validate price range
        self.validate_price_range(quote, &mut issues);

        // Validate volume
        self.validate_volume(quote, &mut issues);

        // Check for any errors
        let errors: Vec<_> = issues
            .iter()
            .filter(|i| i.severity == ValidationSeverity::Hard)
            .collect();

        if !errors.is_empty() {
            let messages: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
            return Err(MarketDataError::ValidationFailed {
                message: messages.join("; "),
            });
        }

        // Log warnings
        for issue in issues.iter().filter(|i| i.severity == ValidationSeverity::Soft) {
            warn!("Quote validation warning for {:?}: {}", quote.timestamp, issue.message);
        }

        Ok(())
    }

    /// Validate all quotes in a batch.
    ///
    /// Returns a tuple of (valid_quotes, invalid_quotes_with_errors).
    pub fn validate_batch(&self, quotes: Vec<Quote>) -> (Vec<Quote>, Vec<(Quote, MarketDataError)>) {
        let mut valid = Vec::with_capacity(quotes.len());
        let mut invalid = Vec::new();

        for quote in quotes {
            match self.validate(&quote) {
                Ok(()) => valid.push(quote),
                Err(e) => invalid.push((quote, e)),
            }
        }

        (valid, invalid)
    }

    /// Validate close price is non-negative.
    fn validate_close_price(&self, quote: &Quote, issues: &mut Vec<ValidationIssue>) {
        if self.config.reject_negative_prices && quote.close < Decimal::ZERO {
            issues.push(ValidationIssue {
                severity: ValidationSeverity::Hard,
                message: format!("Negative close price: {}", quote.close),
            });
        }
        // Note: Decimal cannot represent NaN or Infinity, so those checks are not needed.
        // Invalid values would fail during parsing before reaching the validator.
    }

    /// Validate OHLC invariants.
    ///
    /// - High must be >= Low
    /// - Open must be between Low and High
    /// - Close must be between Low and High
    fn validate_ohlc_invariants(&self, quote: &Quote, issues: &mut Vec<ValidationIssue>) {
        let (open, high, low) = match (quote.open, quote.high, quote.low) {
            (Some(o), Some(h), Some(l)) => (o, h, l),
            (None, None, None) => {
                // No OHLC data - just close, which is valid
                if self.config.warn_on_missing_ohlc {
                    issues.push(ValidationIssue {
                        severity: ValidationSeverity::Soft,
                        message: "Missing OHLC data (only close provided)".to_string(),
                    });
                }
                return;
            }
            _ => {
                // Partial OHLC data - warn but validate what we have
                if self.config.warn_on_missing_ohlc {
                    issues.push(ValidationIssue {
                        severity: ValidationSeverity::Soft,
                        message: "Partial OHLC data provided".to_string(),
                    });
                }
                // Continue with validation of available fields
                let high = quote.high.unwrap_or(quote.close);
                let low = quote.low.unwrap_or(quote.close);
                let open = quote.open.unwrap_or(quote.close);
                (open, high, low)
            }
        };

        // High >= Low
        if self.config.reject_invalid_ohlc && high < low {
            issues.push(ValidationIssue {
                severity: ValidationSeverity::Hard,
                message: format!("High ({}) is less than Low ({})", high, low),
            });
        }

        // Open between Low and High
        if self.config.reject_invalid_ohlc && (open < low || open > high) {
            issues.push(ValidationIssue {
                severity: ValidationSeverity::Soft,
                message: format!(
                    "Open ({}) is outside High/Low range ({}-{})",
                    open, low, high
                ),
            });
        }

        // Close between Low and High
        if self.config.reject_invalid_ohlc && (quote.close < low || quote.close > high) {
            issues.push(ValidationIssue {
                severity: ValidationSeverity::Soft,
                message: format!(
                    "Close ({}) is outside High/Low range ({}-{})",
                    quote.close, low, high
                ),
            });
        }

        // Validate individual prices are non-negative
        if self.config.reject_negative_prices {
            if high < Decimal::ZERO {
                issues.push(ValidationIssue {
                    severity: ValidationSeverity::Hard,
                    message: format!("Negative high price: {}", high),
                });
            }
            if low < Decimal::ZERO {
                issues.push(ValidationIssue {
                    severity: ValidationSeverity::Hard,
                    message: format!("Negative low price: {}", low),
                });
            }
            if open < Decimal::ZERO {
                issues.push(ValidationIssue {
                    severity: ValidationSeverity::Hard,
                    message: format!("Negative open price: {}", open),
                });
            }
        }
    }

    /// Validate prices are within reasonable range.
    fn validate_price_range(&self, quote: &Quote, issues: &mut Vec<ValidationIssue>) {
        if let Some(max_price) = self.config.max_price {
            if quote.close > max_price {
                issues.push(ValidationIssue {
                    severity: ValidationSeverity::Soft,
                    message: format!(
                        "Close price ({}) exceeds max threshold ({})",
                        quote.close, max_price
                    ),
                });
            }

            if let Some(high) = quote.high {
                if high > max_price {
                    issues.push(ValidationIssue {
                        severity: ValidationSeverity::Soft,
                        message: format!(
                            "High price ({}) exceeds max threshold ({})",
                            high, max_price
                        ),
                    });
                }
            }
        }
    }

    /// Validate volume data.
    fn validate_volume(&self, quote: &Quote, issues: &mut Vec<ValidationIssue>) {
        if let Some(volume) = quote.volume {
            if volume < Decimal::ZERO {
                issues.push(ValidationIssue {
                    severity: ValidationSeverity::Hard,
                    message: format!("Negative volume: {}", volume),
                });
            }

            if self.config.warn_on_zero_volume && volume == Decimal::ZERO {
                issues.push(ValidationIssue {
                    severity: ValidationSeverity::Soft,
                    message: "Zero volume".to_string(),
                });
            }
        }
    }

    /// Validate a quote with severity levels.
    pub fn validate_with_severity(
        &self,
        quote: &Quote,
        _context: &InstrumentId,
    ) -> ValidationResult {
        // Hard validations (reject quote)
        if self.config.reject_negative_prices && quote.close < Decimal::ZERO {
            return ValidationResult::hard_fail("Negative close price");
        }

        if let Some(max) = self.config.max_price {
            if quote.close > max {
                return ValidationResult::hard_fail(format!(
                    "Price {} exceeds sanity limit {}",
                    quote.close, max
                ));
            }
        }

        if self.config.reject_invalid_ohlc {
            if let (Some(high), Some(low)) = (quote.high, quote.low) {
                if high < low {
                    return ValidationResult::hard_fail("High < Low in OHLC");
                }
            }
        }

        // Soft validations (warn but accept)
        if self.config.warn_on_zero_volume {
            if quote.volume == Some(Decimal::ZERO) {
                return ValidationResult::soft_warn("Zero volume (market may be closed)");
            }
        }

        ValidationResult::ok()
    }
}

impl Default for QuoteValidator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use rust_decimal_macros::dec;

    fn make_quote(close: Decimal) -> Quote {
        Quote {
            timestamp: Utc::now(),
            open: Some(dec!(100)),
            high: Some(dec!(105)),
            low: Some(dec!(95)),
            close,
            volume: Some(dec!(1000)),
            currency: "USD".to_string(),
            source: "TEST".to_string(),
        }
    }

    fn make_quote_ohlc(open: Decimal, high: Decimal, low: Decimal, close: Decimal) -> Quote {
        Quote {
            timestamp: Utc::now(),
            open: Some(open),
            high: Some(high),
            low: Some(low),
            close,
            volume: Some(dec!(1000)),
            currency: "USD".to_string(),
            source: "TEST".to_string(),
        }
    }

    #[test]
    fn test_valid_quote() {
        let validator = QuoteValidator::new();
        let quote = make_quote(dec!(100));

        assert!(validator.validate(&quote).is_ok());
    }

    #[test]
    fn test_negative_close_price_rejected() {
        let validator = QuoteValidator::new();
        let quote = make_quote(dec!(-10));

        let result = validator.validate(&quote);
        assert!(result.is_err());

        if let Err(MarketDataError::ValidationFailed { message }) = result {
            assert!(message.contains("Negative close price"));
        }
    }

    #[test]
    fn test_high_less_than_low_rejected() {
        let validator = QuoteValidator::new();
        let quote = make_quote_ohlc(dec!(100), dec!(90), dec!(95), dec!(100)); // high < low

        let result = validator.validate(&quote);
        assert!(result.is_err());

        if let Err(MarketDataError::ValidationFailed { message }) = result {
            assert!(message.contains("High") && message.contains("less than Low"));
        }
    }

    #[test]
    fn test_valid_ohlc() {
        let validator = QuoteValidator::new();
        let quote = make_quote_ohlc(dec!(100), dec!(110), dec!(95), dec!(105));

        assert!(validator.validate(&quote).is_ok());
    }

    #[test]
    fn test_close_only_quote_valid() {
        let validator = QuoteValidator::new();
        let quote = Quote {
            timestamp: Utc::now(),
            open: None,
            high: None,
            low: None,
            close: dec!(100),
            volume: None,
            currency: "USD".to_string(),
            source: "TEST".to_string(),
        };

        assert!(validator.validate(&quote).is_ok());
    }

    // Note: Decimal cannot represent NaN or Infinity, so those tests are removed.
    // Invalid values would fail during parsing before reaching the validator.

    #[test]
    fn test_negative_volume_rejected() {
        let validator = QuoteValidator::new();
        let mut quote = make_quote(dec!(100));
        quote.volume = Some(dec!(-1000));

        let result = validator.validate(&quote);
        assert!(result.is_err());

        if let Err(MarketDataError::ValidationFailed { message }) = result {
            assert!(message.contains("Negative volume"));
        }
    }

    #[test]
    fn test_extreme_price_warning() {
        let validator = QuoteValidator::with_config(ValidatorConfig {
            max_price: Some(dec!(1000)),
            ..Default::default()
        });

        let quote = make_quote(dec!(5000));

        // Should pass but with warning (warnings don't cause rejection)
        assert!(validator.validate(&quote).is_ok());
    }

    #[test]
    fn test_custom_config_allows_negative() {
        let validator = QuoteValidator::with_config(ValidatorConfig {
            reject_negative_prices: false,
            ..Default::default()
        });

        let quote = make_quote(dec!(-10));
        assert!(validator.validate(&quote).is_ok());
    }

    #[test]
    fn test_batch_validation() {
        let validator = QuoteValidator::new();

        let quotes = vec![
            make_quote(dec!(100)),  // valid
            make_quote(dec!(-10)),  // invalid
            make_quote(dec!(200)),  // valid
        ];

        let (valid, invalid) = validator.validate_batch(quotes);

        assert_eq!(valid.len(), 2);
        assert_eq!(invalid.len(), 1);
    }

    #[test]
    fn test_partial_ohlc_validation() {
        let validator = QuoteValidator::with_config(ValidatorConfig {
            warn_on_missing_ohlc: true,
            ..Default::default()
        });

        let quote = Quote {
            timestamp: Utc::now(),
            open: Some(dec!(100)),
            high: Some(dec!(110)),
            low: None, // Missing
            close: dec!(105),
            volume: Some(dec!(1000)),
            currency: "USD".to_string(),
            source: "TEST".to_string(),
        };

        // Should pass with warnings
        assert!(validator.validate(&quote).is_ok());
    }
}
