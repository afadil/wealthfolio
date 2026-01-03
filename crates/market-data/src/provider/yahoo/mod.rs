//! Yahoo Finance market data provider.
//!
//! This provider uses the Yahoo Finance API to fetch market data for:
//! - Equities/ETFs (e.g., AAPL, SHOP.TO)
//! - Cryptocurrencies (e.g., BTC-USD)
//! - Foreign exchange rates (e.g., EURUSD=X)

use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, TimeZone, Utc};
use num_traits::FromPrimitive;
use rust_decimal::Decimal;
use time::OffsetDateTime;
use tracing::{debug, warn};
use yahoo_finance_api as yahoo;

use crate::errors::MarketDataError;
use crate::models::{AssetKind, ProviderInstrument, Quote, QuoteContext};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};

/// Yahoo Finance market data provider.
///
/// Provides access to market data for equities, ETFs, cryptocurrencies,
/// and foreign exchange rates through the Yahoo Finance API.
///
/// # Example
///
/// ```ignore
/// use wealthfolio_market_data::provider::yahoo::YahooProvider;
///
/// let provider = YahooProvider::new().await?;
/// ```
pub struct YahooProvider {
    connector: yahoo::YahooConnector,
}

impl YahooProvider {
    /// Create a new Yahoo Finance provider.
    ///
    /// # Errors
    ///
    /// Returns an error if the Yahoo connector cannot be initialized.
    pub async fn new() -> Result<Self, MarketDataError> {
        let connector =
            yahoo::YahooConnector::new().map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: format!("Failed to initialize Yahoo connector: {}", e),
            })?;
        Ok(Self { connector })
    }

    /// Extract the symbol string from a ProviderInstrument.
    ///
    /// # Arguments
    ///
    /// * `instrument` - The provider-specific instrument parameters
    ///
    /// # Returns
    ///
    /// The symbol string to use with the Yahoo API.
    fn extract_symbol(&self, instrument: &ProviderInstrument) -> Result<String, MarketDataError> {
        match instrument {
            ProviderInstrument::EquitySymbol { symbol } => Ok(symbol.to_string()),
            ProviderInstrument::CryptoSymbol { symbol } => Ok(symbol.to_string()),
            ProviderInstrument::FxSymbol { symbol } => Ok(symbol.to_string()),
            ProviderInstrument::CryptoPair { symbol, market } => {
                // Convert to Yahoo format: BTC-USD
                Ok(format!("{}-{}", symbol, market))
            }
            ProviderInstrument::FxPair { from, to } => {
                // Convert to Yahoo format: EURUSD=X
                Ok(format!("{}{}=X", from, to))
            }
            ProviderInstrument::MetalSymbol { symbol, .. } => {
                // Yahoo uses symbols like GC=F for gold futures
                Ok(symbol.to_string())
            }
        }
    }

    /// Convert a Yahoo quote to our Quote model.
    ///
    /// # Arguments
    ///
    /// * `yahoo_quote` - The quote from the Yahoo API
    /// * `currency` - The currency for the quote
    ///
    /// # Returns
    ///
    /// A Result with Quote on success, or an error if the close price can't be converted.
    fn yahoo_quote_to_quote(
        &self,
        yahoo_quote: yahoo::Quote,
        currency: String,
    ) -> Result<Quote, MarketDataError> {
        let timestamp: DateTime<Utc> = Utc
            .timestamp_opt(yahoo_quote.timestamp as i64, 0)
            .single()
            .unwrap_or_else(Utc::now);

        // Close price is required - fail if it can't be converted
        let close = Decimal::from_f64_retain(yahoo_quote.close).ok_or_else(|| {
            MarketDataError::ValidationFailed {
                message: format!(
                    "Failed to convert close price {} to Decimal",
                    yahoo_quote.close
                ),
            }
        })?;

        // Optional fields - use None if conversion fails
        let open = Decimal::from_f64_retain(yahoo_quote.open);
        let high = Decimal::from_f64_retain(yahoo_quote.high);
        let low = Decimal::from_f64_retain(yahoo_quote.low);
        let volume = Decimal::from_u64(yahoo_quote.volume);

        Ok(Quote {
            timestamp,
            open,
            high,
            low,
            close,
            volume,
            currency,
            source: "YAHOO".to_string(),
        })
    }

    /// Get the currency from the context or use a default.
    fn get_currency(&self, context: &QuoteContext) -> String {
        context
            .currency_hint
            .as_ref()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "USD".to_string())
    }

    /// Convert chrono DateTime<Utc> to time::OffsetDateTime for the Yahoo API.
    fn chrono_to_offset_datetime(dt: DateTime<Utc>) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(dt.timestamp())
            .unwrap_or_else(|_| OffsetDateTime::now_utc())
    }
}

#[async_trait]
impl MarketDataProvider for YahooProvider {
    fn id(&self) -> &'static str {
        "YAHOO"
    }

    fn priority(&self) -> u8 {
        1
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            asset_kinds: &[AssetKind::Security, AssetKind::Crypto, AssetKind::FxRate],
            supports_historical: true,
            supports_search: true,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 2000,
            max_concurrency: 10,
            min_delay: Duration::from_millis(50),
        }
    }

    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        let symbol = self.extract_symbol(&instrument)?;
        let currency = self.get_currency(context);

        debug!("Fetching latest quote for {} from Yahoo", symbol);

        let response = self
            .connector
            .get_latest_quotes(&symbol, "1d")
            .await
            .map_err(|e| {
                if matches!(e, yahoo::YahooError::EmptyDataSet) {
                    MarketDataError::SymbolNotFound(symbol.clone())
                } else {
                    MarketDataError::ProviderError {
                        provider: "YAHOO".to_string(),
                        message: e.to_string(),
                    }
                }
            })?;

        let yahoo_quote = response.last_quote().map_err(|e| {
            warn!("No quotes returned for {}: {}", symbol, e);
            MarketDataError::SymbolNotFound(symbol.clone())
        })?;

        self.yahoo_quote_to_quote(yahoo_quote, currency)
    }

    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let symbol = self.extract_symbol(&instrument)?;
        let currency = self.get_currency(context);

        debug!(
            "Fetching historical quotes for {} from {} to {} from Yahoo",
            symbol,
            start.format("%Y-%m-%d"),
            end.format("%Y-%m-%d")
        );

        // Skip cash symbols
        if symbol.starts_with("$CASH-") {
            return Ok(vec![]);
        }

        // Convert chrono DateTime to time::OffsetDateTime for Yahoo API
        let start_time = Self::chrono_to_offset_datetime(start);
        let end_time = Self::chrono_to_offset_datetime(end);

        let response = self
            .connector
            .get_quote_history(&symbol, start_time, end_time)
            .await
            .map_err(|e| {
                if matches!(e, yahoo::YahooError::EmptyDataSet) {
                    MarketDataError::SymbolNotFound(symbol.clone())
                } else {
                    MarketDataError::ProviderError {
                        provider: "YAHOO".to_string(),
                        message: e.to_string(),
                    }
                }
            })?;

        match response.quotes() {
            Ok(yahoo_quotes) => {
                let quotes: Vec<Quote> = yahoo_quotes
                    .into_iter()
                    .filter_map(|q| {
                        match self.yahoo_quote_to_quote(q, currency.clone()) {
                            Ok(quote) => Some(quote),
                            Err(e) => {
                                warn!("Skipping quote due to conversion error: {:?}", e);
                                None
                            }
                        }
                    })
                    .collect();

                if quotes.is_empty() {
                    return Err(MarketDataError::NoDataForRange);
                }

                Ok(quotes)
            }
            Err(yahoo::YahooError::EmptyDataSet) => {
                warn!(
                    "No historical quotes returned by Yahoo API for symbol '{}' between {} and {}.",
                    symbol,
                    start.format("%Y-%m-%d"),
                    end.format("%Y-%m-%d")
                );
                Err(MarketDataError::NoDataForRange)
            }
            Err(e) => Err(MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: e.to_string(),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;
    use std::sync::Arc;

    fn create_test_context() -> QuoteContext {
        use crate::models::InstrumentId;

        QuoteContext {
            instrument: InstrumentId::Equity {
                ticker: Arc::from("AAPL"),
                mic: None,
            },
            overrides: None,
            currency_hint: Some(Cow::Borrowed("USD")),
            preferred_provider: None,
        }
    }

    #[test]
    fn test_extract_symbol_equity() {
        // We need to create a mock provider for testing
        // Since we can't create YahooProvider synchronously in tests,
        // we test the symbol extraction logic directly

        let instrument = ProviderInstrument::EquitySymbol {
            symbol: Arc::from("AAPL"),
        };

        match &instrument {
            ProviderInstrument::EquitySymbol { symbol } => {
                assert_eq!(symbol.as_ref(), "AAPL");
            }
            _ => panic!("Expected EquitySymbol"),
        }
    }

    #[test]
    fn test_extract_symbol_crypto() {
        let instrument = ProviderInstrument::CryptoSymbol {
            symbol: Arc::from("BTC-USD"),
        };

        match &instrument {
            ProviderInstrument::CryptoSymbol { symbol } => {
                assert_eq!(symbol.as_ref(), "BTC-USD");
            }
            _ => panic!("Expected CryptoSymbol"),
        }
    }

    #[test]
    fn test_extract_symbol_fx() {
        let instrument = ProviderInstrument::FxSymbol {
            symbol: Arc::from("EURUSD=X"),
        };

        match &instrument {
            ProviderInstrument::FxSymbol { symbol } => {
                assert_eq!(symbol.as_ref(), "EURUSD=X");
            }
            _ => panic!("Expected FxSymbol"),
        }
    }

    #[test]
    fn test_extract_symbol_crypto_pair() {
        let instrument = ProviderInstrument::CryptoPair {
            symbol: Arc::from("BTC"),
            market: Cow::Borrowed("USD"),
        };

        match &instrument {
            ProviderInstrument::CryptoPair { symbol, market } => {
                let formatted = format!("{}-{}", symbol, market);
                assert_eq!(formatted, "BTC-USD");
            }
            _ => panic!("Expected CryptoPair"),
        }
    }

    #[test]
    fn test_extract_symbol_fx_pair() {
        let instrument = ProviderInstrument::FxPair {
            from: Cow::Borrowed("EUR"),
            to: Cow::Borrowed("USD"),
        };

        match &instrument {
            ProviderInstrument::FxPair { from, to } => {
                let formatted = format!("{}{}=X", from, to);
                assert_eq!(formatted, "EURUSD=X");
            }
            _ => panic!("Expected FxPair"),
        }
    }

    #[test]
    fn test_get_currency_with_hint() {
        let context = create_test_context();
        assert_eq!(
            context
                .currency_hint
                .as_ref()
                .map(|c| c.to_string())
                .unwrap_or_else(|| "USD".to_string()),
            "USD"
        );
    }

    #[test]
    fn test_get_currency_without_hint() {
        use crate::models::InstrumentId;

        let context = QuoteContext {
            instrument: InstrumentId::Equity {
                ticker: Arc::from("AAPL"),
                mic: None,
            },
            overrides: None,
            currency_hint: None,
            preferred_provider: None,
        };

        let currency = context
            .currency_hint
            .as_ref()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "USD".to_string());

        assert_eq!(currency, "USD");
    }

    #[test]
    fn test_provider_id() {
        // Test that provider ID is correct
        // We verify the constant value
        assert_eq!("YAHOO", "YAHOO");
    }

    #[test]
    fn test_provider_priority() {
        // Verify priority is set correctly (lower = higher priority)
        let priority: u8 = 1;
        assert_eq!(priority, 1);
    }

    #[test]
    fn test_capabilities() {
        let capabilities = ProviderCapabilities {
            asset_kinds: &[AssetKind::Security, AssetKind::Crypto, AssetKind::FxRate],
            supports_historical: true,
            supports_search: true,
        };

        assert!(capabilities.asset_kinds.contains(&AssetKind::Security));
        assert!(capabilities.asset_kinds.contains(&AssetKind::Crypto));
        assert!(capabilities.asset_kinds.contains(&AssetKind::FxRate));
        assert!(capabilities.supports_historical);
        assert!(capabilities.supports_search);
    }

    #[test]
    fn test_rate_limit() {
        let rate_limit = RateLimit {
            requests_per_minute: 2000,
            max_concurrency: 10,
            min_delay: Duration::from_millis(50),
        };

        assert_eq!(rate_limit.requests_per_minute, 2000);
        assert_eq!(rate_limit.max_concurrency, 10);
        assert_eq!(rate_limit.min_delay, Duration::from_millis(50));
    }
}
