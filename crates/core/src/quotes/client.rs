//! Market Data Client - Facade for the market-data crate.
//!
//! This module provides a clean interface between the core domain layer
//! and the market-data crate's provider system.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────────┐
//! │                         Core Domain Layer                           │
//! │                                                                     │
//! │  Asset ─────────────────────────────────────────────▶ core::Quote   │
//! │                           │                               ▲         │
//! │                           │                               │         │
//! │                           ▼                               │         │
//! │  ┌─────────────────────────────────────────────────────────────┐   │
//! │  │                    MarketDataClient                          │   │
//! │  │                                                              │   │
//! │  │  Asset ─▶ QuoteContext ─▶ ProviderRegistry ─▶ market::Quote  │   │
//! │  │                                                   │          │   │
//! │  │                                    convert ◀──────┘          │   │
//! │  └─────────────────────────────────────────────────────────────┘   │
//! └─────────────────────────────────────────────────────────────────────┘
//! ```

use std::borrow::Cow;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use log::{debug, info, warn};

use crate::assets::{Asset, ProviderProfile};
use crate::errors::Result;
use crate::quotes::constants::*;
use crate::quotes::model::{DataSource, SymbolSearchResult};
use crate::quotes::Quote;
use crate::secrets::SecretStore;

use wealthfolio_market_data::{
    mic_to_currency, mic_to_exchange_name, yahoo_exchange_to_mic, yahoo_suffix_to_mic,
    AlphaVantageProvider, AssetProfile as MarketAssetProfile, FinnhubProvider,
    MarketDataAppProvider, MetalPriceApiProvider, ProviderId, ProviderRegistry,
    Quote as MarketQuote, QuoteContext, ResolverChain, SearchResult as MarketSearchResult,
    YahooProvider,
};

/// Market data error types.
#[derive(Debug, thiserror::Error)]
pub enum MarketDataClientError {
    /// A market data operation failed.
    /// Preserves the full error semantics from the market-data crate.
    #[error("{0}")]
    MarketData(#[from] wealthfolio_market_data::errors::MarketDataError),

    #[error("Invalid data: {0}")]
    InvalidData(String),
}

impl From<MarketDataClientError> for crate::Error {
    fn from(e: MarketDataClientError) -> Self {
        use crate::quotes::MarketDataError;
        match e {
            MarketDataClientError::MarketData(external_err) => {
                // Use the From implementation to preserve error semantics
                crate::Error::MarketData(external_err.into())
            }
            MarketDataClientError::InvalidData(msg) => {
                crate::Error::MarketData(MarketDataError::InvalidData(msg))
            }
        }
    }
}

/// Provider configuration for initialization.
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    /// Provider ID (e.g., "YAHOO", "ALPHA_VANTAGE")
    pub id: String,
    /// User-configured priority (lower = higher priority)
    pub priority: i32,
}

/// Market data client - facade for fetching quotes via the market-data crate.
///
/// Handles:
/// - Provider initialization with API keys
/// - Asset → QuoteContext conversion
/// - Quote type conversion (market-data → core)
/// - Coordinating with the market-data ProviderRegistry
pub struct MarketDataClient {
    registry: ProviderRegistry,
}

impl MarketDataClient {
    /// Create a new market data client with providers initialized from secrets.
    ///
    /// # Arguments
    ///
    /// * `secret_store` - Store for retrieving API keys
    /// * `enabled_providers` - List of provider configurations with IDs and priorities
    ///
    /// # Returns
    ///
    /// A new `MarketDataClient` instance. Note that if no providers could be initialized,
    /// the client will return `NoProvidersAvailable` errors when fetching quotes.
    pub async fn new(
        secret_store: Arc<dyn SecretStore>,
        enabled_providers: Vec<ProviderConfig>,
    ) -> Result<Self> {
        use std::collections::HashMap;

        let mut providers: Vec<Arc<dyn wealthfolio_market_data::MarketDataProvider>> = Vec::new();
        let mut init_errors: Vec<String> = Vec::new();
        let mut custom_priorities: HashMap<String, i32> = HashMap::new();

        for config in &enabled_providers {
            match Self::create_provider(&config.id, &secret_store).await {
                Ok(Some(provider)) => {
                    info!("Initialized market data provider: {}", config.id);
                    custom_priorities.insert(config.id.clone(), config.priority);
                    providers.push(provider);
                }
                Ok(None) => {
                    debug!(
                        "Provider {} requires API key but none found, skipping",
                        config.id
                    );
                }
                Err(e) => {
                    let msg = format!("{}: {:?}", config.id, e);
                    warn!("Failed to initialize provider {}", msg);
                    init_errors.push(msg);
                }
            }
        }

        if providers.is_empty() {
            warn!(
                "No market data providers initialized! Enabled: {:?}, Errors: {:?}",
                enabled_providers, init_errors
            );
        } else {
            info!(
                "Market data client initialized with {} providers: {:?}",
                providers.len(),
                providers.iter().map(|p| p.id()).collect::<Vec<_>>()
            );
        }

        // Create the resolver chain for symbol resolution
        let resolver = Arc::new(ResolverChain::new());

        // Create the registry with custom priorities
        let registry = ProviderRegistry::with_priorities(providers, resolver, custom_priorities);

        Ok(Self { registry })
    }

    /// Create a provider by ID with its API key.
    async fn create_provider(
        provider_id: &str,
        secret_store: &Arc<dyn SecretStore>,
    ) -> Result<Option<Arc<dyn wealthfolio_market_data::MarketDataProvider>>> {
        match provider_id {
            DATA_SOURCE_YAHOO => {
                // Yahoo doesn't need an API key
                let provider = YahooProvider::new()
                    .await
                    .map_err(MarketDataClientError::from)?;
                Ok(Some(Arc::new(provider)))
            }
            DATA_SOURCE_MARKET_DATA_APP => {
                if let Ok(Some(key)) = secret_store.get_secret(provider_id) {
                    if !key.is_empty() {
                        let provider = MarketDataAppProvider::new(key);
                        return Ok(Some(Arc::new(provider)));
                    }
                }
                Ok(None)
            }
            DATA_SOURCE_ALPHA_VANTAGE => {
                if let Ok(Some(key)) = secret_store.get_secret(provider_id) {
                    if !key.is_empty() {
                        let provider = AlphaVantageProvider::new(key);
                        return Ok(Some(Arc::new(provider)));
                    }
                }
                Ok(None)
            }
            DATA_SOURCE_METAL_PRICE_API => {
                if let Ok(Some(key)) = secret_store.get_secret(provider_id) {
                    if !key.is_empty() {
                        let provider = MetalPriceApiProvider::new(key);
                        return Ok(Some(Arc::new(provider)));
                    }
                }
                Ok(None)
            }
            DATA_SOURCE_FINNHUB => {
                if let Ok(Some(key)) = secret_store.get_secret(provider_id) {
                    if !key.is_empty() {
                        let provider = FinnhubProvider::new(key);
                        return Ok(Some(Arc::new(provider)));
                    }
                }
                Ok(None)
            }
            _ => {
                warn!("Unknown provider ID: {}", provider_id);
                Ok(None)
            }
        }
    }

    /// Fetch historical quotes for an asset.
    ///
    /// # Arguments
    ///
    /// * `asset` - The asset to fetch quotes for
    /// * `start` - Start date (inclusive)
    /// * `end` - End date (inclusive)
    ///
    /// # Returns
    ///
    /// Vector of quotes in core format, or error if all providers fail.
    pub async fn fetch_historical_quotes(
        &self,
        asset: &Asset,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>> {
        // Convert Asset to QuoteContext
        let context = self.build_quote_context(asset)?;

        debug!(
            "Fetching quotes for {:?} from {} to {}",
            context.instrument,
            start.format("%Y-%m-%d"),
            end.format("%Y-%m-%d")
        );

        // Fetch from registry
        let market_quotes = self
            .registry
            .fetch_quotes(&context, start, end)
            .await
            .map_err(MarketDataClientError::from)?;

        // Convert to core Quote format
        let core_quotes: Vec<Quote> = market_quotes
            .into_iter()
            .map(|mq| Self::convert_quote(mq, &asset.id))
            .collect();

        debug!(
            "Fetched {} quotes for asset {}",
            core_quotes.len(),
            asset.id
        );

        Ok(core_quotes)
    }

    /// Fetch the latest quote for an asset.
    pub async fn fetch_latest_quote(&self, asset: &Asset) -> Result<Quote> {
        let context = self.build_quote_context(asset)?;

        let market_quote = self
            .registry
            .fetch_latest_quote(&context)
            .await
            .map_err(MarketDataClientError::from)?;

        Ok(Self::convert_quote(market_quote, &asset.id))
    }

    /// Build a QuoteContext from an Asset.
    fn build_quote_context(&self, asset: &Asset) -> Result<QuoteContext> {
        // Convert Asset to InstrumentId
        let instrument = asset.to_instrument_id().ok_or_else(|| {
            MarketDataClientError::InvalidData(format!(
                "Asset {} with kind {:?} cannot be converted to InstrumentId",
                asset.id, asset.kind
            ))
        })?;

        // Build provider overrides from asset.provider_overrides JSON
        let overrides = asset.provider_overrides.as_ref().and_then(|json| {
            // Parse the JSON into ProviderOverrides
            // Format: { "YAHOO": { "type": "equity_symbol", "symbol": "MSFT" } }
            wealthfolio_market_data::ProviderOverrides::from_json(json).ok()
        });

        // Currency hint: prefer asset.currency, fall back to MIC-derived currency
        // Note: For LSE stocks, mic_to_currency returns "GBp" (pence) which enables
        // proper normalization when calculating holdings values.
        let currency_hint: Option<Cow<'static, str>> = if !asset.currency.is_empty() {
            Some(Cow::Owned(asset.currency.clone()))
        } else {
            // Derive currency from exchange MIC (single source of truth)
            asset
                .exchange_mic
                .as_ref()
                .and_then(|mic| mic_to_currency(mic))
                .map(Cow::Borrowed)
        };

        // Preferred provider from asset
        let preferred_provider: Option<ProviderId> = asset
            .preferred_provider
            .as_ref()
            .map(|p| Cow::Owned(p.clone()));

        Ok(QuoteContext {
            instrument,
            overrides,
            currency_hint,
            preferred_provider,
        })
    }

    /// Convert a market-data Quote to a core Quote.
    fn convert_quote(market_quote: MarketQuote, asset_id: &str) -> Quote {
        let data_source = match market_quote.source.as_str() {
            DATA_SOURCE_YAHOO => DataSource::Yahoo,
            DATA_SOURCE_ALPHA_VANTAGE => DataSource::AlphaVantage,
            DATA_SOURCE_MARKET_DATA_APP => DataSource::MarketDataApp,
            DATA_SOURCE_METAL_PRICE_API => DataSource::MetalPriceApi,
            DATA_SOURCE_FINNHUB => DataSource::Finnhub,
            DATA_SOURCE_MANUAL => DataSource::Manual,
            _ => DataSource::Yahoo, // Default fallback
        };

        // Generate deterministic quote ID: {asset_id}_{YYYY-MM-DD}_{source}
        // This format matches types::quote_id() for consistency
        let id = format!(
            "{}_{}_{}",
            asset_id,
            market_quote.timestamp.format("%Y-%m-%d"),
            market_quote.source
        );

        Quote {
            id,
            created_at: Utc::now(),
            data_source,
            timestamp: market_quote.timestamp,
            asset_id: asset_id.to_string(),
            open: market_quote.open.unwrap_or(market_quote.close),
            high: market_quote.high.unwrap_or(market_quote.close),
            low: market_quote.low.unwrap_or(market_quote.close),
            close: market_quote.close,
            adjclose: market_quote.close, // Adjclose defaults to close
            volume: market_quote.volume.unwrap_or_default(),
            currency: market_quote.currency,
            notes: None,
        }
    }

    /// Get list of available providers.
    pub fn providers(&self) -> Vec<&str> {
        self.registry.providers().iter().map(|p| p.id()).collect()
    }

    /// Check if any providers are available.
    pub fn has_providers(&self) -> bool {
        !self.registry.providers().is_empty()
    }

    /// Get the number of available providers.
    pub fn provider_count(&self) -> usize {
        self.registry.providers().len()
    }

    /// Fetch historical quotes for multiple assets.
    ///
    /// Fetches quotes for each asset sequentially. For high-volume scenarios,
    /// consider batching or parallel execution at the caller level.
    ///
    /// # Arguments
    ///
    /// * `assets` - Assets to fetch quotes for
    /// * `start` - Start date (inclusive)
    /// * `end` - End date (inclusive)
    ///
    /// # Returns
    ///
    /// Map of asset_id -> quotes. Assets that fail to fetch are logged and omitted.
    pub async fn fetch_historical_quotes_bulk(
        &self,
        assets: &[Asset],
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> std::collections::HashMap<String, Vec<Quote>> {
        use std::collections::HashMap;

        let mut results: HashMap<String, Vec<Quote>> = HashMap::new();

        for asset in assets {
            match self.fetch_historical_quotes(asset, start, end).await {
                Ok(quotes) => {
                    if !quotes.is_empty() {
                        results.insert(asset.id.clone(), quotes);
                    }
                }
                Err(e) => {
                    warn!("Failed to fetch quotes for asset {}: {:?}", asset.id, e);
                }
            }
        }

        info!(
            "Bulk fetch completed: {} of {} assets succeeded",
            results.len(),
            assets.len()
        );

        results
    }

    /// Search for symbols matching the query.
    ///
    /// # Arguments
    ///
    /// * `query` - Search query (e.g., "AAPL", "Apple")
    ///
    /// # Returns
    ///
    /// Vector of search results from providers that support search.
    pub async fn search(&self, query: &str) -> Result<Vec<SymbolSearchResult>> {
        debug!("Searching for '{}'", query);

        let results = self
            .registry
            .search(query)
            .await
            .map_err(MarketDataClientError::from)?;

        let summaries = results
            .into_iter()
            .map(Self::convert_search_result)
            .collect();

        Ok(summaries)
    }

    /// Get asset profile for an asset.
    ///
    /// Uses the same resolver as quote fetching to build provider-specific symbols
    /// (e.g., "VFV.TO" for Yahoo when the asset's exchange_mic is XTSE).
    ///
    /// # Arguments
    ///
    /// * `asset` - The asset to get profile for
    ///
    /// # Returns
    ///
    /// Asset profile from providers that support profiles.
    pub async fn get_profile(&self, asset: &Asset) -> Result<ProviderProfile> {
        debug!("Fetching profile for asset '{}'", asset.id);

        let context = self.build_quote_context(asset)?;

        let profile = self
            .registry
            .get_profile(&context)
            .await
            .map_err(MarketDataClientError::from)?;

        Ok(Self::convert_profile(profile, &asset.symbol))
    }

    /// Convert a market-data SearchResult to core SymbolSearchResult.
    ///
    /// Enriches the result with canonical MIC codes and friendly exchange names:
    /// 1. Try mapping from Yahoo's exchange code (e.g., "NMS" -> "XNAS")
    /// 2. Try extracting MIC from symbol suffix (e.g., "SHOP.TO" -> "XTSE")
    /// 3. Look up friendly exchange name from MIC
    /// 4. Infer currency from MIC if not provided
    fn convert_search_result(result: MarketSearchResult) -> SymbolSearchResult {
        // Try to determine MIC from Yahoo's exchange code first
        let mut exchange_mic = yahoo_exchange_to_mic(&result.exchange).map(|mic| mic.to_string());

        // If no MIC from exchange code, try extracting from symbol suffix
        if exchange_mic.is_none() {
            if let Some(dot_pos) = result.symbol.rfind('.') {
                let suffix = &result.symbol[dot_pos + 1..];
                exchange_mic = yahoo_suffix_to_mic(suffix).map(String::from);
            }
        }

        // Get friendly exchange name from MIC
        let exchange_name = exchange_mic
            .as_ref()
            .and_then(|mic| mic_to_exchange_name(mic))
            .map(String::from);

        // Infer currency from MIC if not provided
        let currency = result.currency.or_else(|| {
            exchange_mic
                .as_ref()
                .and_then(|mic| mic_to_currency(mic))
                .map(String::from)
        });

        SymbolSearchResult {
            symbol: result.symbol,
            short_name: result.name.clone(),
            long_name: result.name,
            exchange: result.exchange,
            exchange_mic,
            exchange_name,
            quote_type: result.asset_type,
            type_display: String::new(),
            currency,
            data_source: result.data_source.or_else(|| Some("YAHOO".to_string())),
            is_existing: false,
            existing_asset_id: None,
            index: String::new(),
            score: result.score.unwrap_or(0.0),
        }
    }

    /// Fetch historical quotes for multiple symbols (legacy interface for sync).
    ///
    /// This method provides backward compatibility with the sync system that works
    /// with (symbol, currency) tuples. Internally creates minimal Asset objects.
    ///
    /// # Arguments
    ///
    /// * `symbols_with_currencies` - Tuples of (symbol, currency)
    /// * `start` - Start time
    /// * `end` - End time
    ///
    /// # Returns
    ///
    /// Tuple of (quotes, failed_symbols) for compatibility with sync logic.
    pub async fn fetch_quotes_by_symbols(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<(Vec<Quote>, Vec<(String, String)>)> {
        let mut all_quotes = Vec::new();
        let mut failed = Vec::new();

        for (symbol, currency) in symbols_with_currencies {
            // Create a minimal asset for the fetch
            let asset = Asset {
                id: symbol.clone(),
                symbol: symbol.clone(),
                currency: currency.clone(),
                kind: crate::assets::AssetKind::Security, // Default to security
                ..Default::default()
            };

            match self.fetch_historical_quotes(&asset, start, end).await {
                Ok(quotes) => all_quotes.extend(quotes),
                Err(e) => {
                    debug!("Failed to fetch quotes for {}: {:?}", symbol, e);
                    failed.push((symbol.clone(), currency.clone()));
                }
            }
        }

        Ok((all_quotes, failed))
    }

    /// Convert a market-data AssetProfile to core ProviderProfile.
    fn convert_profile(profile: MarketAssetProfile, symbol: &str) -> ProviderProfile {
        // Prefer sectors (JSON array with weights for ETFs) over single sector
        let sectors = profile.sectors.or_else(|| {
            profile
                .sector
                .map(|s| format!("[{{\"name\":\"{}\",\"weight\":1}}]", s))
        });

        ProviderProfile {
            id: Some(symbol.to_string()),
            isin: None,
            name: profile.name,
            asset_type: profile.quote_type, // Maps to AssetKind during enrichment
            symbol: symbol.to_string(),
            quote_symbol: Some(symbol.to_string()),
            currency: String::new(),
            // Use provider source from profile, fallback to YAHOO for backwards compatibility
            data_source: profile.source.unwrap_or_else(|| "YAHOO".to_string()),
            notes: profile.description,
            countries: profile
                .country
                .map(|c| format!("[{{\"name\":\"{}\",\"weight\":1}}]", c)),
            sectors,
            industry: profile.industry,
            categories: None,
            classes: None,
            attributes: None,
            url: profile.website,
            // Financial metrics
            market_cap: profile.market_cap,
            pe_ratio: profile.pe_ratio,
            dividend_yield: profile.dividend_yield,
            week_52_high: profile.week_52_high,
            week_52_low: profile.week_52_low,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::AssetKind;
    use chrono::TimeZone;
    use rust_decimal_macros::dec;

    // =========================================================================
    // Quote Conversion Tests
    // =========================================================================

    #[test]
    fn test_convert_quote_full_ohlcv() {
        let timestamp = Utc.with_ymd_and_hms(2024, 1, 15, 0, 0, 0).unwrap();
        let market_quote = MarketQuote::ohlcv(
            timestamp,
            dec!(100),
            dec!(105),
            dec!(95),
            dec!(102),
            dec!(1000000),
            "USD".to_string(),
            "YAHOO".to_string(),
        );

        let core_quote = MarketDataClient::convert_quote(market_quote, "AAPL");

        assert_eq!(core_quote.asset_id, "AAPL");
        assert_eq!(core_quote.id, "AAPL_2024-01-15_YAHOO");
        assert_eq!(core_quote.open, dec!(100));
        assert_eq!(core_quote.high, dec!(105));
        assert_eq!(core_quote.low, dec!(95));
        assert_eq!(core_quote.close, dec!(102));
        assert_eq!(core_quote.adjclose, dec!(102)); // Defaults to close
        assert_eq!(core_quote.volume, dec!(1000000));
        assert_eq!(core_quote.currency, "USD");
        assert!(matches!(core_quote.data_source, DataSource::Yahoo));
    }

    #[test]
    fn test_convert_quote_minimal_close_only() {
        let timestamp = Utc.with_ymd_and_hms(2024, 6, 20, 0, 0, 0).unwrap();
        let market_quote = MarketQuote::new(
            timestamp,
            dec!(150.50),
            "CAD".to_string(),
            "ALPHA_VANTAGE".to_string(),
        );

        let core_quote = MarketDataClient::convert_quote(market_quote, "SHOP.TO");

        assert_eq!(core_quote.asset_id, "SHOP.TO");
        assert_eq!(core_quote.id, "SHOP.TO_2024-06-20_ALPHA_VANTAGE");
        // OHLC should all be close when not provided
        assert_eq!(core_quote.open, dec!(150.50));
        assert_eq!(core_quote.high, dec!(150.50));
        assert_eq!(core_quote.low, dec!(150.50));
        assert_eq!(core_quote.close, dec!(150.50));
        assert_eq!(core_quote.volume, dec!(0));
        assert!(matches!(core_quote.data_source, DataSource::AlphaVantage));
    }

    #[test]
    fn test_convert_quote_all_data_sources() {
        let timestamp = Utc::now();

        let test_cases = [
            ("YAHOO", DataSource::Yahoo),
            ("ALPHA_VANTAGE", DataSource::AlphaVantage),
            ("MARKETDATA_APP", DataSource::MarketDataApp),
            ("METAL_PRICE_API", DataSource::MetalPriceApi),
            ("FINNHUB", DataSource::Finnhub),
            ("MANUAL", DataSource::Manual),
            ("UNKNOWN_SOURCE", DataSource::Yahoo), // Fallback
        ];

        for (source_str, expected_source) in test_cases {
            let market_quote = MarketQuote::new(
                timestamp,
                dec!(100),
                "USD".to_string(),
                source_str.to_string(),
            );

            let core_quote = MarketDataClient::convert_quote(market_quote, "TEST");
            assert!(
                std::mem::discriminant(&core_quote.data_source)
                    == std::mem::discriminant(&expected_source),
                "Source '{}' should map to {:?}",
                source_str,
                expected_source
            );
        }
    }

    #[test]
    fn test_convert_quote_special_characters_in_asset_id() {
        let timestamp = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
        let market_quote = MarketQuote::new(
            timestamp,
            dec!(1.25),
            "USD".to_string(),
            "YAHOO".to_string(),
        );

        // Test FX pair format
        let core_quote = MarketDataClient::convert_quote(market_quote.clone(), "EUR/USD");
        assert_eq!(core_quote.asset_id, "EUR/USD");
        assert_eq!(core_quote.id, "EUR/USD_2024-01-01_YAHOO");

        // Test crypto format
        let core_quote = MarketDataClient::convert_quote(market_quote, "BTC-USD");
        assert_eq!(core_quote.asset_id, "BTC-USD");
        assert_eq!(core_quote.id, "BTC-USD_2024-01-01_YAHOO");
    }

    // =========================================================================
    // Build Quote Context Tests
    // =========================================================================

    fn create_test_asset(kind: AssetKind, symbol: &str, currency: &str) -> Asset {
        Asset {
            id: symbol.to_string(),
            kind,
            symbol: symbol.to_string(),
            name: Some(format!("Test {}", symbol)),
            currency: currency.to_string(),
            exchange_mic: Some("XNAS".to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn test_build_quote_context_security() {
        // Create a minimal client for testing (we can't easily create a full one)
        // So we test the logic indirectly through the Asset's to_instrument_id
        let asset = create_test_asset(AssetKind::Security, "AAPL", "USD");

        let instrument = asset.to_instrument_id();
        assert!(instrument.is_some());

        match instrument.unwrap() {
            wealthfolio_market_data::InstrumentId::Equity { ticker, mic } => {
                assert_eq!(ticker.as_ref(), "AAPL");
                assert_eq!(mic.as_deref(), Some("XNAS"));
            }
            _ => panic!("Expected Equity instrument"),
        }
    }

    #[test]
    fn test_build_quote_context_crypto() {
        let asset = create_test_asset(AssetKind::Crypto, "BTC", "USD");

        let instrument = asset.to_instrument_id();
        assert!(instrument.is_some());

        match instrument.unwrap() {
            wealthfolio_market_data::InstrumentId::Crypto { base, quote } => {
                assert_eq!(base.as_ref(), "BTC");
                assert_eq!(quote.as_ref(), "USD");
            }
            _ => panic!("Expected Crypto instrument"),
        }
    }

    #[test]
    fn test_build_quote_context_fx() {
        let mut asset = create_test_asset(AssetKind::FxRate, "EUR", "USD");
        asset.exchange_mic = None;

        let instrument = asset.to_instrument_id();
        assert!(instrument.is_some());

        match instrument.unwrap() {
            wealthfolio_market_data::InstrumentId::Fx { base, quote } => {
                assert_eq!(base.as_ref(), "EUR");
                assert_eq!(quote.as_ref(), "USD");
            }
            _ => panic!("Expected Fx instrument"),
        }
    }

    #[test]
    fn test_build_quote_context_unsupported_asset_kinds() {
        let unsupported_kinds = [
            AssetKind::Cash,
            AssetKind::Property,
            AssetKind::Vehicle,
            AssetKind::Collectible,
            AssetKind::PhysicalPrecious,
            AssetKind::Liability,
            AssetKind::Other,
            AssetKind::PrivateEquity,
        ];

        for kind in unsupported_kinds {
            let kind_debug = format!("{:?}", kind);
            let asset = create_test_asset(kind, "TEST", "USD");
            let instrument = asset.to_instrument_id();
            assert!(
                instrument.is_none(),
                "Asset kind {} should not be convertible to InstrumentId",
                kind_debug
            );
        }
    }

    // =========================================================================
    // Edge Case Tests
    // =========================================================================

    #[test]
    fn test_convert_quote_zero_values() {
        let timestamp = Utc::now();
        let market_quote = MarketQuote::ohlcv(
            timestamp,
            dec!(0),
            dec!(0),
            dec!(0),
            dec!(0),
            dec!(0),
            "USD".to_string(),
            "YAHOO".to_string(),
        );

        let core_quote = MarketDataClient::convert_quote(market_quote, "TEST");

        assert_eq!(core_quote.open, dec!(0));
        assert_eq!(core_quote.high, dec!(0));
        assert_eq!(core_quote.low, dec!(0));
        assert_eq!(core_quote.close, dec!(0));
        assert_eq!(core_quote.volume, dec!(0));
    }

    #[test]
    fn test_convert_quote_large_values() {
        let timestamp = Utc::now();
        let large_price = dec!(999999999.99);
        let large_volume = dec!(99999999999999);

        let market_quote = MarketQuote::ohlcv(
            timestamp,
            large_price,
            large_price,
            large_price,
            large_price,
            large_volume,
            "USD".to_string(),
            "YAHOO".to_string(),
        );

        let core_quote = MarketDataClient::convert_quote(market_quote, "BRK.A");

        assert_eq!(core_quote.close, large_price);
        assert_eq!(core_quote.volume, large_volume);
    }

    #[test]
    fn test_convert_quote_negative_values() {
        // Some instruments can have negative prices (e.g., oil futures in 2020)
        let timestamp = Utc::now();
        let market_quote = MarketQuote::ohlcv(
            timestamp,
            dec!(-37.63),
            dec!(-10.00),
            dec!(-40.32),
            dec!(-37.63),
            dec!(1000000),
            "USD".to_string(),
            "YAHOO".to_string(),
        );

        let core_quote = MarketDataClient::convert_quote(market_quote, "CL=F");

        assert_eq!(core_quote.close, dec!(-37.63));
        assert_eq!(core_quote.low, dec!(-40.32));
    }

    #[test]
    fn test_convert_quote_high_precision_decimals() {
        let timestamp = Utc::now();
        let precise_price = dec!(0.00001234); // Crypto can have high precision

        let market_quote = MarketQuote::new(
            timestamp,
            precise_price,
            "USD".to_string(),
            "YAHOO".to_string(),
        );

        let core_quote = MarketDataClient::convert_quote(market_quote, "SHIB-USD");

        assert_eq!(core_quote.close, precise_price);
    }
}
