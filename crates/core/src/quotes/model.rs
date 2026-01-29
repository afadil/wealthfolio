//! Quote domain models.
//!
//! This module contains the core data structures for representing market quotes,
//! quote summaries (search results), and data source information.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

// =============================================================================
// Constants
// =============================================================================

/// Data source identifiers
pub const DATA_SOURCE_YAHOO: &str = "YAHOO";
pub const DATA_SOURCE_MANUAL: &str = "MANUAL";
pub const DATA_SOURCE_MARKET_DATA_APP: &str = "MARKETDATA_APP";
pub const DATA_SOURCE_ALPHA_VANTAGE: &str = "ALPHA_VANTAGE";
pub const DATA_SOURCE_METAL_PRICE_API: &str = "METAL_PRICE_API";
pub const DATA_SOURCE_FINNHUB: &str = "FINNHUB";

// =============================================================================
// Data Source
// =============================================================================

/// Represents the source of market data.
///
/// Different providers have different capabilities, coverage, and reliability.
/// The data source is tracked with each quote to support:
/// - Provider-specific handling and formatting
/// - Fallback logic when a provider fails
/// - User visibility into data origin
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "UPPERCASE")]
pub enum DataSource {
    /// Yahoo Finance - comprehensive global coverage
    Yahoo,
    /// MarketData.app - US stocks with real-time data
    MarketDataApp,
    /// Alpha Vantage - stocks, crypto, and forex
    AlphaVantage,
    /// Metal Price API - precious metals pricing
    MetalPriceApi,
    /// Finnhub - global stock data with real-time quotes
    Finnhub,
    /// Manual entry by user
    #[default]
    Manual,
}

impl DataSource {
    /// Returns the string identifier for this data source.
    pub fn as_str(&self) -> &'static str {
        match self {
            DataSource::Yahoo => DATA_SOURCE_YAHOO,
            DataSource::MarketDataApp => DATA_SOURCE_MARKET_DATA_APP,
            DataSource::AlphaVantage => DATA_SOURCE_ALPHA_VANTAGE,
            DataSource::MetalPriceApi => DATA_SOURCE_METAL_PRICE_API,
            DataSource::Finnhub => DATA_SOURCE_FINNHUB,
            DataSource::Manual => DATA_SOURCE_MANUAL,
        }
    }
}

impl From<DataSource> for String {
    fn from(source: DataSource) -> Self {
        source.as_str().to_string()
    }
}

impl From<&str> for DataSource {
    fn from(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            DATA_SOURCE_YAHOO => DataSource::Yahoo,
            DATA_SOURCE_MARKET_DATA_APP => DataSource::MarketDataApp,
            DATA_SOURCE_ALPHA_VANTAGE => DataSource::AlphaVantage,
            DATA_SOURCE_METAL_PRICE_API => DataSource::MetalPriceApi,
            DATA_SOURCE_FINNHUB => DataSource::Finnhub,
            _ => DataSource::Manual,
        }
    }
}

// =============================================================================
// Quote
// =============================================================================

/// A market quote representing price data for a financial instrument at a point in time.
///
/// This is the core data structure for storing historical and real-time price data.
/// Each quote contains OHLCV (Open, High, Low, Close, Volume) data along with
/// metadata about when and where the data came from.
///
/// # Fields
///
/// * `id` - Unique identifier for the quote (typically `{asset_id}_{date}_{source}`)
/// * `asset_id` - Canonical asset identifier (e.g., "SEC:AAPL:XNAS", "CRYPTO:BTC:USD")
/// * `timestamp` - The date/time this quote represents
/// * `open`, `high`, `low`, `close` - Standard OHLC price data
/// * `adjclose` - Split and dividend adjusted closing price
/// * `volume` - Trading volume for the period
/// * `currency` - The currency of the price data (e.g., "USD", "EUR")
/// * `data_source` - Where this quote data came from
/// * `created_at` - When this record was created in the database
/// * `notes` - Optional user notes (for manual entries)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub id: String,
    pub asset_id: String,
    pub timestamp: DateTime<Utc>,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub adjclose: Decimal,
    pub volume: Decimal,
    pub currency: String,
    pub data_source: DataSource,
    pub created_at: DateTime<Utc>,
    pub notes: Option<String>,
}

// =============================================================================
// Symbol Search Result
// =============================================================================

/// Result from a symbol/ticker search operation.
///
/// This is returned from symbol search operations and provides basic
/// identifying information about a financial instrument. Enhanced with
/// canonical exchange MIC codes and existing asset merging.
///
/// # Fields
///
/// * `symbol` - The ticker symbol (e.g., "AAPL", "SHOP.TO")
/// * `short_name` - Short display name (e.g., "Apple Inc.")
/// * `long_name` - Full legal name
/// * `exchange` - Exchange code from provider (e.g., "NASDAQ", "TOR")
/// * `exchange_mic` - Canonical MIC code (e.g., "XNAS", "XTSE")
/// * `exchange_name` - Friendly exchange name (e.g., "NASDAQ", "TSX")
/// * `quote_type` - Type of instrument (e.g., "EQUITY", "ETF", "CRYPTOCURRENCY")
/// * `type_display` - Human-readable type display
/// * `currency` - Trading currency (e.g., "USD", "CAD")
/// * `data_source` - Data source provider (e.g., "YAHOO", "MANUAL")
/// * `is_existing` - True if this asset already exists in user's database
/// * `existing_asset_id` - The ID if asset exists (e.g., "SEC:AAPL:XNAS")
/// * `index` - Index membership if applicable
/// * `score` - Relevance score from search
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SymbolSearchResult {
    pub symbol: String,
    pub short_name: String,
    pub long_name: String,
    pub exchange: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exchange_mic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exchange_name: Option<String>,
    pub quote_type: String,
    pub type_display: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_source: Option<String>,
    #[serde(default)]
    pub is_existing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_asset_id: Option<String>,
    pub index: String,
    pub score: f64,
}

// =============================================================================
// Latest Quote Pair
// =============================================================================

/// A pair of quotes representing the latest and previous trading day quotes.
///
/// This is useful for calculating daily changes and displaying current vs previous values.
///
/// # Fields
///
/// * `latest` - The most recent quote for the symbol
/// * `previous` - The quote from the previous trading day (if available)
#[derive(Clone, Debug)]
pub struct LatestQuotePair {
    pub latest: Quote,
    pub previous: Option<Quote>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_data_source_from_str() {
        assert_eq!(DataSource::from("YAHOO"), DataSource::Yahoo);
        assert_eq!(DataSource::from("yahoo"), DataSource::Yahoo);
        assert_eq!(
            DataSource::from("MARKETDATA_APP"),
            DataSource::MarketDataApp
        );
        assert_eq!(DataSource::from("ALPHA_VANTAGE"), DataSource::AlphaVantage);
        assert_eq!(
            DataSource::from("METAL_PRICE_API"),
            DataSource::MetalPriceApi
        );
        assert_eq!(DataSource::from("FINNHUB"), DataSource::Finnhub);
        assert_eq!(DataSource::from("finnhub"), DataSource::Finnhub);
        assert_eq!(DataSource::from("MANUAL"), DataSource::Manual);
        assert_eq!(DataSource::from("unknown"), DataSource::Manual);
    }

    #[test]
    fn test_data_source_as_str() {
        assert_eq!(DataSource::Yahoo.as_str(), "YAHOO");
        assert_eq!(DataSource::MarketDataApp.as_str(), "MARKETDATA_APP");
        assert_eq!(DataSource::AlphaVantage.as_str(), "ALPHA_VANTAGE");
        assert_eq!(DataSource::MetalPriceApi.as_str(), "METAL_PRICE_API");
        assert_eq!(DataSource::Finnhub.as_str(), "FINNHUB");
        assert_eq!(DataSource::Manual.as_str(), "MANUAL");
    }

    #[test]
    fn test_data_source_default() {
        assert_eq!(DataSource::default(), DataSource::Manual);
    }
}
