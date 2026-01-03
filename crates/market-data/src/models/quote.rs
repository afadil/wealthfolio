use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::instrument::InstrumentId;
use super::provider_params::ProviderOverrides;
use super::types::{Currency, ProviderId};

/// Request context for quote fetching
#[derive(Clone, Debug)]
pub struct QuoteContext {
    /// Canonical instrument
    pub instrument: InstrumentId,

    /// Pre-resolved provider overrides (from Asset.provider_overrides)
    pub overrides: Option<ProviderOverrides>,

    /// Currency hint
    pub currency_hint: Option<Currency>,

    /// Preferred provider (from Asset.preferred_provider)
    pub preferred_provider: Option<ProviderId>,
}

/// Market data quote
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Quote {
    /// Timestamp of the quote
    pub timestamp: DateTime<Utc>,

    /// Opening price (optional for intraday)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open: Option<Decimal>,

    /// High price (optional for intraday)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub high: Option<Decimal>,

    /// Low price (optional for intraday)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub low: Option<Decimal>,

    /// Closing/current price (required)
    pub close: Decimal,

    /// Trading volume (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<Decimal>,

    /// Quote currency
    pub currency: String,

    /// Source of the quote (MANUAL, YAHOO, ALPHA_VANTAGE, etc.)
    pub source: String,
}

impl Quote {
    /// Create a new quote with minimal required fields
    pub fn new(timestamp: DateTime<Utc>, close: Decimal, currency: String, source: String) -> Self {
        Self {
            timestamp,
            open: None,
            high: None,
            low: None,
            close,
            volume: None,
            currency,
            source,
        }
    }

    /// Create a full OHLCV quote
    pub fn ohlcv(
        timestamp: DateTime<Utc>,
        open: Decimal,
        high: Decimal,
        low: Decimal,
        close: Decimal,
        volume: Decimal,
        currency: String,
        source: String,
    ) -> Self {
        Self {
            timestamp,
            open: Some(open),
            high: Some(high),
            low: Some(low),
            close,
            volume: Some(volume),
            currency,
            source,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_quote_new() {
        let quote = Quote::new(
            Utc::now(),
            dec!(150.25),
            "USD".to_string(),
            "YAHOO".to_string(),
        );
        assert_eq!(quote.close, dec!(150.25));
        assert_eq!(quote.currency, "USD");
        assert!(quote.open.is_none());
    }

    #[test]
    fn test_quote_ohlcv() {
        let quote = Quote::ohlcv(
            Utc::now(),
            dec!(148.00),
            dec!(152.00),
            dec!(147.50),
            dec!(150.25),
            dec!(1000000),
            "USD".to_string(),
            "YAHOO".to_string(),
        );
        assert_eq!(quote.open, Some(dec!(148.00)));
        assert_eq!(quote.high, Some(dec!(152.00)));
        assert_eq!(quote.low, Some(dec!(147.50)));
        assert_eq!(quote.close, dec!(150.25));
        assert_eq!(quote.volume, Some(dec!(1000000)));
    }
}
