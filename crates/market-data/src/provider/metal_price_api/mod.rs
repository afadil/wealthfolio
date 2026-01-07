//! Metal Price API provider for precious metals market data.
//!
//! This provider fetches real-time precious metal prices from the Metal Price API.
//! It supports the following metals:
//! - XAU (Gold)
//! - XAG (Silver)
//! - XPT (Platinum)
//! - XPD (Palladium)
//! - XRH (Rhodium)
//! - XRU (Ruthenium)
//! - XIR (Iridium)
//! - XOS (Osmium)
//!
//! Note: The free tier of this API does not support historical data.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::errors::MarketDataError;
use crate::models::{Coverage, InstrumentKind, ProviderInstrument, Quote, QuoteContext};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};

/// Supported metal symbols
const SUPPORTED_METALS: &[&str] = &["XAU", "XAG", "XPT", "XPD", "XRH", "XRU", "XIR", "XOS"];

/// Provider ID constant
const PROVIDER_ID: &str = "METAL_PRICE_API";

/// API response from Metal Price API
#[derive(Debug, Deserialize)]
struct MetalPriceResponse {
    /// Whether the request was successful
    success: bool,
    /// Base currency used in the request
    #[allow(dead_code)]
    base: String,
    /// Unix timestamp of the quote
    #[allow(dead_code)]
    timestamp: i64,
    /// Rates for requested metals (1 base_currency = rate troy ounces)
    rates: HashMap<String, f64>,
}

/// Metal Price API provider for precious metals market data.
///
/// # Example
///
/// ```ignore
/// use wealthfolio_market_data::provider::metal_price_api::MetalPriceApiProvider;
///
/// let provider = MetalPriceApiProvider::new("your_api_key".to_string());
/// ```
pub struct MetalPriceApiProvider {
    client: Client,
    api_key: String,
}

/// Default HTTP request timeout
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

impl MetalPriceApiProvider {
    /// Create a new Metal Price API provider with the given API key.
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { client, api_key }
    }

    /// Check if the given symbol is a supported metal.
    fn is_supported_metal(symbol: &str) -> bool {
        SUPPORTED_METALS.contains(&symbol)
    }
}

#[async_trait]
impl MarketDataProvider for MetalPriceApiProvider {
    fn id(&self) -> &'static str {
        PROVIDER_ID
    }

    fn priority(&self) -> u8 {
        4
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            instrument_kinds: &[InstrumentKind::Metal],
            coverage: Coverage::metals_usd_only(),
            supports_latest: true,
            supports_historical: false, // CRITICAL: Metal Price API only supports latest quotes
            supports_search: false,
            supports_profile: false,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 100,
            max_concurrency: 5,
            min_delay: Duration::from_millis(100),
        }
    }

    async fn get_latest_quote(
        &self,
        _context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        // Extract symbol and quote currency from the instrument
        let (symbol, quote_currency) = match &instrument {
            ProviderInstrument::MetalSymbol { symbol, quote } => {
                (symbol.to_string(), quote.to_string())
            }
            _ => {
                return Err(MarketDataError::UnsupportedAssetType(format!(
                    "{:?}",
                    instrument
                )))
            }
        };

        // Validate that this is a supported metal symbol
        if !Self::is_supported_metal(&symbol) {
            return Err(MarketDataError::SymbolNotFound(symbol));
        }

        // Build the API URL
        let url = format!(
            "https://api.metalpriceapi.com/v1/latest?api_key={}&base={}&currencies={}",
            self.api_key, quote_currency, symbol
        );

        // Make the API request
        let response =
            self.client
                .get(&url)
                .send()
                .await
                .map_err(|e| MarketDataError::ProviderError {
                    provider: PROVIDER_ID.to_string(),
                    message: e.to_string(),
                })?;

        // Parse the response
        let metal_resp: MetalPriceResponse =
            response
                .json()
                .await
                .map_err(|e| MarketDataError::ProviderError {
                    provider: PROVIDER_ID.to_string(),
                    message: e.to_string(),
                })?;

        // Check if the API request was successful
        if !metal_resp.success {
            return Err(MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: "API request failed".to_string(),
            });
        }

        // Get the rate for the requested symbol
        let rate = metal_resp
            .rates
            .get(&symbol)
            .ok_or_else(|| MarketDataError::SymbolNotFound(symbol.clone()))?;

        // API returns: 1 base_currency = rate troy ounces of metal
        // Price per troy ounce = 1 / rate
        if *rate == 0.0 {
            return Err(MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: "Invalid rate (zero)".to_string(),
            });
        }

        let price =
            Decimal::try_from(1.0 / rate).map_err(|_| MarketDataError::ValidationFailed {
                message: "Failed to convert rate to decimal".to_string(),
            })?;

        let now = Utc::now();

        Ok(Quote::new(
            now,
            price,
            quote_currency,
            PROVIDER_ID.to_string(),
        ))
    }

    async fn get_historical_quotes(
        &self,
        _context: &QuoteContext,
        _instrument: ProviderInstrument,
        _start: DateTime<Utc>,
        _end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        // Metal Price API free tier doesn't support historical data
        Err(MarketDataError::NotSupported {
            operation: "historical_quotes".to_string(),
            provider: PROVIDER_ID.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_supported_metal() {
        assert!(MetalPriceApiProvider::is_supported_metal("XAU"));
        assert!(MetalPriceApiProvider::is_supported_metal("XAG"));
        assert!(MetalPriceApiProvider::is_supported_metal("XPT"));
        assert!(MetalPriceApiProvider::is_supported_metal("XPD"));
        assert!(MetalPriceApiProvider::is_supported_metal("XRH"));
        assert!(MetalPriceApiProvider::is_supported_metal("XRU"));
        assert!(MetalPriceApiProvider::is_supported_metal("XIR"));
        assert!(MetalPriceApiProvider::is_supported_metal("XOS"));
        assert!(!MetalPriceApiProvider::is_supported_metal("AAPL"));
        assert!(!MetalPriceApiProvider::is_supported_metal("BTC"));
    }

    #[test]
    fn test_provider_id() {
        let provider = MetalPriceApiProvider::new("test_key".to_string());
        assert_eq!(provider.id(), "METAL_PRICE_API");
    }

    #[test]
    fn test_provider_priority() {
        let provider = MetalPriceApiProvider::new("test_key".to_string());
        assert_eq!(provider.priority(), 4);
    }

    #[test]
    fn test_provider_capabilities() {
        let provider = MetalPriceApiProvider::new("test_key".to_string());
        let caps = provider.capabilities();
        assert_eq!(caps.instrument_kinds, &[InstrumentKind::Metal]);
        assert!(caps.supports_latest);
        assert!(!caps.supports_historical);
        assert!(!caps.supports_search);
        assert!(!caps.supports_profile);
    }

    #[test]
    fn test_rate_limit() {
        let provider = MetalPriceApiProvider::new("test_key".to_string());
        let rate_limit = provider.rate_limit();
        assert_eq!(rate_limit.requests_per_minute, 100);
        assert_eq!(rate_limit.max_concurrency, 5);
        assert_eq!(rate_limit.min_delay, Duration::from_millis(100));
    }
}
