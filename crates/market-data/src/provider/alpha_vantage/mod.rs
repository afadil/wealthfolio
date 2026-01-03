//! Alpha Vantage market data provider implementation.
//!
//! This module provides market data from Alpha Vantage API:
//! - Equities via TIME_SERIES_DAILY endpoint
//! - FX rates via FX_DAILY endpoint
//! - Cryptocurrencies via DIGITAL_CURRENCY_DAILY endpoint
//!
//! Note: Alpha Vantage free tier is limited to 5 API calls per minute.

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Deserialize;
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;
use tracing::{debug, warn};

use crate::errors::MarketDataError;
use crate::models::{AssetKind, ProviderInstrument, Quote, QuoteContext};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};

const BASE_URL: &str = "https://www.alphavantage.co/query";
const PROVIDER_ID: &str = "ALPHA_VANTAGE";

/// Alpha Vantage market data provider.
///
/// Supports equities, FX rates, and cryptocurrencies.
/// Free tier is limited to 5 API calls per minute.
pub struct AlphaVantageProvider {
    client: Client,
    api_key: String,
}

// ============================================================================
// Response structures for Alpha Vantage API
// ============================================================================

/// TIME_SERIES_DAILY response for equities
#[derive(Debug, Deserialize)]
struct TimeSeriesResponse {
    #[serde(rename = "Time Series (Daily)")]
    time_series: Option<HashMap<String, DailyQuote>>,
    #[serde(rename = "Error Message")]
    error_message: Option<String>,
    #[serde(rename = "Note")]
    note: Option<String>,
    #[serde(rename = "Information")]
    information: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DailyQuote {
    #[serde(rename = "1. open")]
    open: String,
    #[serde(rename = "2. high")]
    high: String,
    #[serde(rename = "3. low")]
    low: String,
    #[serde(rename = "4. close")]
    close: String,
    #[serde(rename = "5. volume")]
    volume: String,
}

/// FX_DAILY response for forex pairs
#[derive(Debug, Deserialize)]
struct FxDailyResponse {
    #[serde(rename = "Time Series FX (Daily)")]
    time_series: Option<HashMap<String, FxDailyQuote>>,
    #[serde(rename = "Error Message")]
    error_message: Option<String>,
    #[serde(rename = "Note")]
    note: Option<String>,
    #[serde(rename = "Information")]
    information: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FxDailyQuote {
    #[serde(rename = "1. open")]
    open: String,
    #[serde(rename = "2. high")]
    high: String,
    #[serde(rename = "3. low")]
    low: String,
    #[serde(rename = "4. close")]
    close: String,
}

/// DIGITAL_CURRENCY_DAILY response for cryptocurrencies
#[derive(Debug, Deserialize)]
struct CryptoDailyResponse {
    #[serde(rename = "Time Series (Digital Currency Daily)")]
    time_series: Option<HashMap<String, CryptoDailyQuote>>,
    #[serde(rename = "Error Message")]
    error_message: Option<String>,
    #[serde(rename = "Note")]
    note: Option<String>,
    #[serde(rename = "Information")]
    information: Option<String>,
}

/// Crypto daily quote with dynamic field names based on market currency.
/// We use a custom deserializer to handle the dynamic field names.
#[derive(Debug, Deserialize)]
struct CryptoDailyQuote {
    // The fields are dynamically named based on market currency
    // e.g., "1a. open (USD)", "4a. close (USD)"
    // We'll use serde flatten with a HashMap to capture all fields
    #[serde(flatten)]
    fields: HashMap<String, serde_json::Value>,
}

impl CryptoDailyQuote {
    /// Extract the close price from the dynamic fields.
    /// Looks for "4a. close (XXX)" or "4b. close (XXX)" patterns.
    fn get_close(&self) -> Option<Decimal> {
        // Try to find close price in USD first, then any other currency
        for (key, value) in &self.fields {
            if key.starts_with("4a. close") || key.starts_with("4b. close") {
                if let Some(s) = value.as_str() {
                    return Decimal::from_str(s).ok();
                }
            }
        }
        None
    }

    fn get_open(&self) -> Option<Decimal> {
        for (key, value) in &self.fields {
            if key.starts_with("1a. open") || key.starts_with("1b. open") {
                if let Some(s) = value.as_str() {
                    return Decimal::from_str(s).ok();
                }
            }
        }
        None
    }

    fn get_high(&self) -> Option<Decimal> {
        for (key, value) in &self.fields {
            if key.starts_with("2a. high") || key.starts_with("2b. high") {
                if let Some(s) = value.as_str() {
                    return Decimal::from_str(s).ok();
                }
            }
        }
        None
    }

    fn get_low(&self) -> Option<Decimal> {
        for (key, value) in &self.fields {
            if key.starts_with("3a. low") || key.starts_with("3b. low") {
                if let Some(s) = value.as_str() {
                    return Decimal::from_str(s).ok();
                }
            }
        }
        None
    }

    fn get_volume(&self) -> Option<Decimal> {
        for (key, value) in &self.fields {
            if key.starts_with("5. volume") {
                if let Some(s) = value.as_str() {
                    return Decimal::from_str(s).ok();
                }
            }
        }
        None
    }
}

// ============================================================================
// AlphaVantageProvider implementation
// ============================================================================

impl AlphaVantageProvider {
    /// Create a new Alpha Vantage provider with the given API key.
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
            api_key,
        }
    }

    /// Make a request to the Alpha Vantage API.
    async fn fetch(&self, params: &[(&str, &str)]) -> Result<String, MarketDataError> {
        let mut all_params: Vec<(&str, &str)> = params.to_vec();
        all_params.push(("apikey", &self.api_key));

        let url = reqwest::Url::parse_with_params(BASE_URL, &all_params).map_err(|e| {
            MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to build URL: {}", e),
            }
        })?;

        debug!(
            "Alpha Vantage request: {}",
            url.as_str().replace(&self.api_key, "***")
        );

        let response = self.client.get(url).send().await.map_err(|e| {
            if e.is_timeout() {
                MarketDataError::Timeout {
                    provider: PROVIDER_ID.to_string(),
                }
            } else {
                MarketDataError::ProviderError {
                    provider: PROVIDER_ID.to_string(),
                    message: e.to_string(),
                }
            }
        })?;

        let status = response.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(MarketDataError::RateLimited {
                provider: PROVIDER_ID.to_string(),
            });
        }

        if !status.is_success() {
            return Err(MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("HTTP {}", status),
            });
        }

        response
            .text()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: e.to_string(),
            })
    }

    /// Check for API-level errors in the response.
    fn check_api_error(
        error_message: &Option<String>,
        note: &Option<String>,
        information: &Option<String>,
    ) -> Result<(), MarketDataError> {
        if let Some(ref msg) = error_message {
            // Check if it's a "not found" type error
            if msg.contains("Invalid API call") || msg.contains("not found") {
                return Err(MarketDataError::SymbolNotFound(msg.clone()));
            }
            return Err(MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: msg.clone(),
            });
        }

        // "Note" usually indicates rate limiting
        if let Some(ref msg) = note {
            if msg.contains("API call frequency") || msg.contains("rate limit") {
                return Err(MarketDataError::RateLimited {
                    provider: PROVIDER_ID.to_string(),
                });
            }
            warn!("Alpha Vantage note: {}", msg);
        }

        // "Information" can indicate various issues
        if let Some(ref msg) = information {
            if msg.contains("API call frequency") || msg.contains("rate limit") {
                return Err(MarketDataError::RateLimited {
                    provider: PROVIDER_ID.to_string(),
                });
            }
            warn!("Alpha Vantage info: {}", msg);
        }

        Ok(())
    }

    /// Parse a date string in YYYY-MM-DD format to DateTime<Utc>.
    fn parse_date(date_str: &str) -> Option<DateTime<Utc>> {
        NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
            .ok()
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .and_then(|dt| Utc.from_local_datetime(&dt).single())
    }

    /// Parse a decimal value from a string.
    fn parse_decimal(s: &str) -> Option<Decimal> {
        Decimal::from_str(s).ok()
    }

    /// Fetch equity quotes using TIME_SERIES_DAILY endpoint.
    async fn fetch_equity_quotes(
        &self,
        symbol: &str,
        currency: &str,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let params = [
            ("function", "TIME_SERIES_DAILY"),
            ("symbol", symbol),
            ("outputsize", "full"),
        ];

        let text = self.fetch(&params).await?;
        let response: TimeSeriesResponse =
            serde_json::from_str(&text).map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to parse response: {}", e),
            })?;

        Self::check_api_error(
            &response.error_message,
            &response.note,
            &response.information,
        )?;

        let time_series = response.time_series.ok_or_else(|| {
            MarketDataError::SymbolNotFound(format!("No data for symbol: {}", symbol))
        })?;

        let mut quotes: Vec<Quote> = time_series
            .into_iter()
            .filter_map(|(date_str, daily)| {
                let timestamp = Self::parse_date(&date_str)?;
                let open = Self::parse_decimal(&daily.open)?;
                let high = Self::parse_decimal(&daily.high)?;
                let low = Self::parse_decimal(&daily.low)?;
                let close = Self::parse_decimal(&daily.close)?;
                let volume = Self::parse_decimal(&daily.volume)?;

                Some(Quote::ohlcv(
                    timestamp,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    currency.to_string(),
                    PROVIDER_ID.to_string(),
                ))
            })
            .collect();

        // Sort by timestamp ascending
        quotes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        debug!(
            "Alpha Vantage: fetched {} equity quotes for {}",
            quotes.len(),
            symbol
        );

        Ok(quotes)
    }

    /// Fetch FX quotes using FX_DAILY endpoint.
    async fn fetch_fx_quotes(&self, from: &str, to: &str) -> Result<Vec<Quote>, MarketDataError> {
        let params = [
            ("function", "FX_DAILY"),
            ("from_symbol", from),
            ("to_symbol", to),
            ("outputsize", "full"),
        ];

        let text = self.fetch(&params).await?;
        let response: FxDailyResponse =
            serde_json::from_str(&text).map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to parse response: {}", e),
            })?;

        Self::check_api_error(
            &response.error_message,
            &response.note,
            &response.information,
        )?;

        let time_series = response.time_series.ok_or_else(|| {
            MarketDataError::SymbolNotFound(format!("No data for FX pair: {}/{}", from, to))
        })?;

        let mut quotes: Vec<Quote> = time_series
            .into_iter()
            .filter_map(|(date_str, daily)| {
                let timestamp = Self::parse_date(&date_str)?;
                let open = Self::parse_decimal(&daily.open)?;
                let high = Self::parse_decimal(&daily.high)?;
                let low = Self::parse_decimal(&daily.low)?;
                let close = Self::parse_decimal(&daily.close)?;

                Some(Quote {
                    timestamp,
                    open: Some(open),
                    high: Some(high),
                    low: Some(low),
                    close,
                    volume: None, // FX doesn't have volume
                    currency: to.to_string(),
                    source: PROVIDER_ID.to_string(),
                })
            })
            .collect();

        // Sort by timestamp ascending
        quotes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        debug!(
            "Alpha Vantage: fetched {} FX quotes for {}/{}",
            quotes.len(),
            from,
            to
        );

        Ok(quotes)
    }

    /// Fetch crypto quotes using DIGITAL_CURRENCY_DAILY endpoint.
    async fn fetch_crypto_quotes(
        &self,
        symbol: &str,
        market: &str,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let params = [
            ("function", "DIGITAL_CURRENCY_DAILY"),
            ("symbol", symbol),
            ("market", market),
        ];

        let text = self.fetch(&params).await?;
        let response: CryptoDailyResponse =
            serde_json::from_str(&text).map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to parse response: {}", e),
            })?;

        Self::check_api_error(
            &response.error_message,
            &response.note,
            &response.information,
        )?;

        let time_series = response.time_series.ok_or_else(|| {
            MarketDataError::SymbolNotFound(format!("No data for crypto: {}/{}", symbol, market))
        })?;

        let mut quotes: Vec<Quote> = time_series
            .into_iter()
            .filter_map(|(date_str, daily)| {
                let timestamp = Self::parse_date(&date_str)?;
                let close = daily.get_close()?;

                Some(Quote {
                    timestamp,
                    open: daily.get_open(),
                    high: daily.get_high(),
                    low: daily.get_low(),
                    close,
                    volume: daily.get_volume(),
                    currency: market.to_string(),
                    source: PROVIDER_ID.to_string(),
                })
            })
            .collect();

        // Sort by timestamp ascending
        quotes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        debug!(
            "Alpha Vantage: fetched {} crypto quotes for {}/{}",
            quotes.len(),
            symbol,
            market
        );

        Ok(quotes)
    }

    /// Filter quotes by date range.
    fn filter_by_date_range(
        quotes: Vec<Quote>,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Vec<Quote> {
        quotes
            .into_iter()
            .filter(|q| q.timestamp >= start && q.timestamp <= end)
            .collect()
    }
}

// ============================================================================
// MarketDataProvider trait implementation
// ============================================================================

#[async_trait]
impl MarketDataProvider for AlphaVantageProvider {
    fn id(&self) -> &'static str {
        PROVIDER_ID
    }

    fn priority(&self) -> u8 {
        // Lower priority than Yahoo due to rate limits
        3
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            asset_kinds: &[AssetKind::Security, AssetKind::Crypto, AssetKind::FxRate],
            supports_historical: true,
            supports_search: true, // SYMBOL_SEARCH endpoint exists
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 5,             // Free tier is very limited
            max_concurrency: 1,                 // Sequential requests only
            min_delay: Duration::from_secs(12), // ~5 requests per minute
        }
    }

    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        // Fetch historical quotes and return the most recent one
        let quotes = match instrument {
            ProviderInstrument::EquitySymbol { ref symbol } => {
                let currency = context
                    .currency_hint
                    .as_ref()
                    .map(|c| c.as_ref())
                    .unwrap_or("USD");
                self.fetch_equity_quotes(symbol, currency).await?
            }
            ProviderInstrument::FxPair { ref from, ref to } => {
                self.fetch_fx_quotes(from, to).await?
            }
            ProviderInstrument::CryptoPair {
                ref symbol,
                ref market,
            } => self.fetch_crypto_quotes(symbol, market).await?,
            ProviderInstrument::FxSymbol { ref symbol } => {
                // Try to parse FX symbol format (e.g., "EURUSD" -> EUR/USD)
                if symbol.len() == 6 {
                    let from = &symbol[..3];
                    let to = &symbol[3..];
                    self.fetch_fx_quotes(from, to).await?
                } else {
                    return Err(MarketDataError::UnsupportedAssetType(format!(
                        "Cannot parse FX symbol: {}",
                        symbol
                    )));
                }
            }
            ProviderInstrument::CryptoSymbol { ref symbol } => {
                // Try to parse crypto symbol format (e.g., "BTC-USD" -> BTC/USD)
                if let Some((base, quote)) = symbol.split_once('-') {
                    self.fetch_crypto_quotes(base, quote).await?
                } else {
                    // Default to USD market
                    self.fetch_crypto_quotes(symbol, "USD").await?
                }
            }
            ProviderInstrument::MetalSymbol { .. } => {
                return Err(MarketDataError::UnsupportedAssetType(
                    "Alpha Vantage does not support metals".to_string(),
                ));
            }
        };

        // Return the most recent quote
        quotes
            .into_iter()
            .last()
            .ok_or(MarketDataError::NoDataForRange)
    }

    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let quotes = match instrument {
            ProviderInstrument::EquitySymbol { ref symbol } => {
                let currency = context
                    .currency_hint
                    .as_ref()
                    .map(|c| c.as_ref())
                    .unwrap_or("USD");
                self.fetch_equity_quotes(symbol, currency).await?
            }
            ProviderInstrument::FxPair { ref from, ref to } => {
                self.fetch_fx_quotes(from, to).await?
            }
            ProviderInstrument::CryptoPair {
                ref symbol,
                ref market,
            } => self.fetch_crypto_quotes(symbol, market).await?,
            ProviderInstrument::FxSymbol { ref symbol } => {
                // Try to parse FX symbol format (e.g., "EURUSD" -> EUR/USD)
                if symbol.len() == 6 {
                    let from = &symbol[..3];
                    let to = &symbol[3..];
                    self.fetch_fx_quotes(from, to).await?
                } else {
                    return Err(MarketDataError::UnsupportedAssetType(format!(
                        "Cannot parse FX symbol: {}",
                        symbol
                    )));
                }
            }
            ProviderInstrument::CryptoSymbol { ref symbol } => {
                // Try to parse crypto symbol format (e.g., "BTC-USD" -> BTC/USD)
                if let Some((base, quote)) = symbol.split_once('-') {
                    self.fetch_crypto_quotes(base, quote).await?
                } else {
                    // Default to USD market
                    self.fetch_crypto_quotes(symbol, "USD").await?
                }
            }
            ProviderInstrument::MetalSymbol { .. } => {
                return Err(MarketDataError::UnsupportedAssetType(
                    "Alpha Vantage does not support metals".to_string(),
                ));
            }
        };

        // Filter by date range
        let filtered = Self::filter_by_date_range(quotes, start, end);

        if filtered.is_empty() {
            return Err(MarketDataError::NoDataForRange);
        }

        Ok(filtered)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_date() {
        let date = AlphaVantageProvider::parse_date("2024-01-15");
        assert!(date.is_some());
        let dt = date.unwrap();
        assert_eq!(dt.date_naive().to_string(), "2024-01-15");
    }

    #[test]
    fn test_parse_date_invalid() {
        assert!(AlphaVantageProvider::parse_date("invalid").is_none());
        assert!(AlphaVantageProvider::parse_date("01-15-2024").is_none());
    }

    #[test]
    fn test_parse_decimal() {
        let d = AlphaVantageProvider::parse_decimal("150.25");
        assert!(d.is_some());
        assert_eq!(d.unwrap().to_string(), "150.25");
    }

    #[test]
    fn test_parse_decimal_invalid() {
        assert!(AlphaVantageProvider::parse_decimal("invalid").is_none());
    }

    #[test]
    fn test_provider_id() {
        let provider = AlphaVantageProvider::new("test_key".to_string());
        assert_eq!(provider.id(), "ALPHA_VANTAGE");
    }

    #[test]
    fn test_provider_priority() {
        let provider = AlphaVantageProvider::new("test_key".to_string());
        assert_eq!(provider.priority(), 3);
    }

    #[test]
    fn test_provider_capabilities() {
        let provider = AlphaVantageProvider::new("test_key".to_string());
        let caps = provider.capabilities();
        assert!(caps.asset_kinds.contains(&AssetKind::Security));
        assert!(caps.asset_kinds.contains(&AssetKind::Crypto));
        assert!(caps.asset_kinds.contains(&AssetKind::FxRate));
        assert!(caps.supports_historical);
        assert!(caps.supports_search);
    }

    #[test]
    fn test_rate_limit() {
        let provider = AlphaVantageProvider::new("test_key".to_string());
        let limit = provider.rate_limit();
        assert_eq!(limit.requests_per_minute, 5);
        assert_eq!(limit.max_concurrency, 1);
        assert_eq!(limit.min_delay, Duration::from_secs(12));
    }

    #[test]
    fn test_filter_by_date_range() {
        use rust_decimal_macros::dec;

        let quotes = vec![
            Quote::new(
                Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap(),
                dec!(100),
                "USD".to_string(),
                PROVIDER_ID.to_string(),
            ),
            Quote::new(
                Utc.with_ymd_and_hms(2024, 1, 15, 0, 0, 0).unwrap(),
                dec!(105),
                "USD".to_string(),
                PROVIDER_ID.to_string(),
            ),
            Quote::new(
                Utc.with_ymd_and_hms(2024, 1, 31, 0, 0, 0).unwrap(),
                dec!(110),
                "USD".to_string(),
                PROVIDER_ID.to_string(),
            ),
        ];

        let start = Utc.with_ymd_and_hms(2024, 1, 10, 0, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2024, 1, 20, 0, 0, 0).unwrap();

        let filtered = AlphaVantageProvider::filter_by_date_range(quotes, start, end);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].close, dec!(105));
    }

    #[test]
    fn test_crypto_daily_quote_parsing() {
        let mut fields = HashMap::new();
        fields.insert(
            "1a. open (USD)".to_string(),
            serde_json::Value::String("45000.00".to_string()),
        );
        fields.insert(
            "2a. high (USD)".to_string(),
            serde_json::Value::String("46000.00".to_string()),
        );
        fields.insert(
            "3a. low (USD)".to_string(),
            serde_json::Value::String("44000.00".to_string()),
        );
        fields.insert(
            "4a. close (USD)".to_string(),
            serde_json::Value::String("45500.00".to_string()),
        );
        fields.insert(
            "5. volume".to_string(),
            serde_json::Value::String("1000000".to_string()),
        );

        let quote = CryptoDailyQuote { fields };

        assert_eq!(quote.get_open().unwrap().to_string(), "45000.00");
        assert_eq!(quote.get_high().unwrap().to_string(), "46000.00");
        assert_eq!(quote.get_low().unwrap().to_string(), "44000.00");
        assert_eq!(quote.get_close().unwrap().to_string(), "45500.00");
        assert_eq!(quote.get_volume().unwrap().to_string(), "1000000");
    }
}
