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
use log::{debug, warn};
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Deserialize;
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;

use crate::errors::MarketDataError;
use crate::models::{AssetProfile, Coverage, InstrumentKind, ProviderInstrument, Quote, QuoteContext};
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

/// OVERVIEW response for company fundamentals
/// Only includes fields that map to AssetProfile; API returns many more fields.
#[derive(Debug, Deserialize)]
struct CompanyOverviewResponse {
    // Company identification
    #[serde(rename = "Symbol")]
    symbol: Option<String>,
    #[serde(rename = "AssetType")]
    asset_type: Option<String>,
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "Description")]
    description: Option<String>,
    #[serde(rename = "Country")]
    country: Option<String>,
    #[serde(rename = "Sector")]
    sector: Option<String>,
    #[serde(rename = "Industry")]
    industry: Option<String>,

    // Market data
    #[serde(rename = "MarketCapitalization")]
    market_capitalization: Option<String>,

    // Valuation ratios
    #[serde(rename = "PERatio")]
    pe_ratio: Option<String>,
    #[serde(rename = "TrailingPE")]
    trailing_pe: Option<String>,

    // Dividend data
    #[serde(rename = "DividendYield")]
    dividend_yield: Option<String>,

    // Technical indicators
    #[serde(rename = "52WeekHigh")]
    week_52_high: Option<String>,
    #[serde(rename = "52WeekLow")]
    week_52_low: Option<String>,

    // Error handling
    #[serde(rename = "Error Message")]
    error_message: Option<String>,
    #[serde(rename = "Note")]
    note: Option<String>,
    #[serde(rename = "Information")]
    information: Option<String>,
    // Note: API provides many more fields (CIK, Exchange, Currency, EPS, Beta, etc.)
    // that are not currently mapped to AssetProfile
}

/// ETF_PROFILE response for ETF fundamentals
/// Provides sector weightings and holdings data for ETFs
#[derive(Debug, Deserialize)]
#[allow(dead_code)] // Some fields reserved for future use
struct EtfProfileResponse {
    // Note: Alpha Vantage ETF_PROFILE returns sectors as an array
    #[serde(default)]
    sectors: Vec<EtfSectorWeight>,

    // Holdings data (not currently used but available)
    #[serde(default)]
    holdings: Vec<EtfHolding>,

    // Fund metadata
    net_assets: Option<String>,
    net_expense_ratio: Option<String>,
    dividend_yield: Option<String>,

    // Error handling
    #[serde(rename = "Error Message")]
    error_message: Option<String>,
    #[serde(rename = "Note")]
    note: Option<String>,
    #[serde(rename = "Information")]
    information: Option<String>,
}

/// Sector weight entry from ETF_PROFILE
#[derive(Debug, Deserialize)]
struct EtfSectorWeight {
    sector: String,
    weight: String, // e.g., "51.1%" or "0.511"
}

/// Holding entry from ETF_PROFILE (for future use)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct EtfHolding {
    #[serde(default)]
    symbol: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    weight: Option<String>,
}

impl EtfProfileResponse {
    /// Check if the response indicates an error or no data
    fn has_error(&self) -> bool {
        self.error_message.is_some()
            || self.information.as_ref().map_or(false, |i| i.contains("demo"))
            || self.sectors.is_empty()
    }

    /// Parse weight string (handles both "51.1%" and "0.511" formats)
    fn parse_weight(s: &str) -> Option<f64> {
        let trimmed = s.trim();
        if trimmed.ends_with('%') {
            // Convert percentage to decimal: "51.1%" -> 0.511
            trimmed.trim_end_matches('%').parse::<f64>().ok().map(|v| v / 100.0)
        } else {
            trimmed.parse::<f64>().ok()
        }
    }

    /// Convert sector weights to JSON array format
    fn sectors_to_json(&self) -> Option<String> {
        if self.sectors.is_empty() {
            return None;
        }

        let sector_data: Vec<serde_json::Value> = self
            .sectors
            .iter()
            .filter_map(|sw| {
                let weight = Self::parse_weight(&sw.weight)?;
                Some(serde_json::json!({
                    "name": sw.sector,
                    "weight": weight
                }))
            })
            .collect();

        if sector_data.is_empty() {
            None
        } else {
            serde_json::to_string(&sector_data).ok()
        }
    }

    /// Convert to AssetProfile
    fn to_asset_profile(&self, _symbol: &str) -> AssetProfile {
        AssetProfile {
            source: Some(PROVIDER_ID.to_string()),
            name: None, // ETF_PROFILE doesn't include name
            quote_type: Some("ETF".to_string()),
            sector: None, // ETFs have multiple sectors
            sectors: self.sectors_to_json(),
            industry: None,
            website: None,
            description: None,
            country: None, // ETF_PROFILE doesn't include country
            employees: None,
            logo_url: None,
            market_cap: None,
            pe_ratio: None,
            dividend_yield: self.dividend_yield.as_ref()
                .and_then(|s| Self::parse_weight(s)),
            week_52_high: None,
            week_52_low: None,
        }
    }
}

impl CompanyOverviewResponse {
    /// Parse a string field as f64, handling "None" and "-" values
    fn parse_f64(s: &Option<String>) -> Option<f64> {
        s.as_ref()
            .filter(|v| !v.is_empty() && *v != "None" && *v != "-" && *v != "0")
            .and_then(|v| v.parse::<f64>().ok())
    }

    /// Check if the response indicates an error
    fn has_error(&self) -> bool {
        self.error_message.is_some()
            || self.information.as_ref().map_or(false, |i| i.contains("demo"))
    }

    /// Convert to AssetProfile
    fn to_asset_profile(&self) -> AssetProfile {
        // Normalize Alpha Vantage asset types to standard format
        // Alpha Vantage returns: "Common Stock", "ETF", "Mutual Fund", etc.
        let quote_type = self.asset_type.as_ref().map(|t| {
            match t.to_uppercase().as_str() {
                "COMMON STOCK" => "EQUITY".to_string(),
                "MUTUAL FUND" => "MUTUALFUND".to_string(),
                other => other.to_string(),
            }
        });

        AssetProfile {
            source: Some(PROVIDER_ID.to_string()),
            name: self.name.clone(),
            quote_type,
            sector: self.sector.clone(),
            sectors: None, // Alpha Vantage doesn't provide weighted sectors
            industry: self.industry.clone(),
            website: None, // Alpha Vantage doesn't provide website
            description: self.description.clone(),
            country: self.country.clone(),
            employees: None, // Alpha Vantage doesn't provide employee count
            logo_url: None,
            market_cap: Self::parse_f64(&self.market_capitalization),
            pe_ratio: Self::parse_f64(&self.pe_ratio)
                .or_else(|| Self::parse_f64(&self.trailing_pe)),
            dividend_yield: Self::parse_f64(&self.dividend_yield),
            week_52_high: Self::parse_f64(&self.week_52_high),
            week_52_low: Self::parse_f64(&self.week_52_low),
        }
    }
}

// ============================================================================
// AlphaVantageProvider implementation
// ============================================================================

impl AlphaVantageProvider {
    /// Create a new Alpha Vantage provider with the given API key.
    ///
    /// # Errors
    ///
    /// Returns an error if the HTTP client cannot be created.
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { client, api_key }
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
            ("outputsize", "compact"), // TIME_SERIES_DAILY: 'full' is premium-only
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
            ("outputsize", "full"), // FX_DAILY supports full on free tier
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

    /// Fetch company overview using OVERVIEW endpoint.
    async fn fetch_company_overview(
        &self,
        symbol: &str,
    ) -> Result<AssetProfile, MarketDataError> {
        let params = [("function", "OVERVIEW"), ("symbol", symbol)];

        let text = self.fetch(&params).await?;

        // First try to parse as a valid response
        let response: CompanyOverviewResponse =
            serde_json::from_str(&text).map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to parse company overview response: {}", e),
            })?;

        // Check for API-level errors
        Self::check_api_error(
            &response.error_message,
            &response.note,
            &response.information,
        )?;

        // Check if we got actual data (symbol should be present)
        if response.symbol.is_none() || response.has_error() {
            return Err(MarketDataError::SymbolNotFound(format!(
                "No company overview data for symbol: {}",
                symbol
            )));
        }

        debug!(
            "Alpha Vantage: fetched company overview for {}",
            symbol
        );

        Ok(response.to_asset_profile())
    }

    /// Fetch ETF profile using ETF_PROFILE endpoint.
    /// Returns sector weightings and holdings data for ETFs.
    async fn fetch_etf_profile(
        &self,
        symbol: &str,
    ) -> Result<AssetProfile, MarketDataError> {
        let params = [("function", "ETF_PROFILE"), ("symbol", symbol)];

        let text = self.fetch(&params).await?;

        // Try to parse as ETF profile response
        let response: EtfProfileResponse =
            serde_json::from_str(&text).map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to parse ETF profile response: {}", e),
            })?;

        // Check for API-level errors
        Self::check_api_error(
            &response.error_message,
            &response.note,
            &response.information,
        )?;

        // Check if we got actual data
        if response.has_error() {
            return Err(MarketDataError::SymbolNotFound(format!(
                "No ETF profile data for symbol: {}",
                symbol
            )));
        }

        debug!(
            "Alpha Vantage: fetched ETF profile for {} with {} sectors",
            symbol,
            response.sectors.len()
        );

        Ok(response.to_asset_profile(symbol))
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
            instrument_kinds: &[InstrumentKind::Equity, InstrumentKind::Crypto, InstrumentKind::Fx],
            // Use best_effort to accept instruments without MIC codes
            coverage: Coverage::global_best_effort(),
            supports_latest: true,
            supports_historical: true,
            supports_search: false,
            supports_profile: true, // Via OVERVIEW endpoint for equities
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

    async fn get_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        debug!("Fetching profile for {} from Alpha Vantage", symbol);

        // First, try OVERVIEW endpoint for basic company/fund info
        let mut profile = self.fetch_company_overview(symbol).await?;

        // If it's an ETF, also fetch ETF_PROFILE for sector weightings
        if let Some(ref quote_type) = profile.quote_type {
            if quote_type == "ETF" || quote_type == "MUTUALFUND" {
                match self.fetch_etf_profile(symbol).await {
                    Ok(etf_profile) => {
                        // Merge ETF-specific data (sector weightings)
                        if etf_profile.sectors.is_some() {
                            profile.sectors = etf_profile.sectors;
                            profile.sector = None; // Clear single sector when we have weighted sectors
                        }
                        // Merge dividend yield if available from ETF profile
                        if etf_profile.dividend_yield.is_some() {
                            profile.dividend_yield = etf_profile.dividend_yield;
                        }
                        debug!(
                            "Alpha Vantage: merged ETF profile data for {}",
                            symbol
                        );
                    }
                    Err(e) => {
                        // ETF_PROFILE failed, continue with OVERVIEW data only
                        warn!(
                            "Alpha Vantage: ETF_PROFILE failed for {}, using OVERVIEW only: {}",
                            symbol, e
                        );
                    }
                }
            }
        }

        Ok(profile)
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
        assert!(caps.instrument_kinds.contains(&InstrumentKind::Equity));
        assert!(caps.instrument_kinds.contains(&InstrumentKind::Crypto));
        assert!(caps.instrument_kinds.contains(&InstrumentKind::Fx));
        assert!(caps.supports_latest);
        assert!(caps.supports_historical);
        assert!(!caps.supports_search);
        assert!(caps.supports_profile); // Now supports profile via OVERVIEW endpoint
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

    #[test]
    fn test_company_overview_parsing() {
        // Note: API returns more fields (CIK, Exchange, Currency) but we only parse what's needed
        let json = r#"{
            "Symbol": "IBM",
            "AssetType": "Common Stock",
            "Name": "International Business Machines Corporation",
            "Description": "International Business Machines Corporation provides integrated solutions.",
            "Country": "USA",
            "Sector": "TECHNOLOGY",
            "Industry": "COMPUTER & OFFICE EQUIPMENT",
            "MarketCapitalization": "191234567890",
            "PERatio": "22.5",
            "DividendYield": "0.0455",
            "52WeekHigh": "199.18",
            "52WeekLow": "128.06"
        }"#;

        let response: CompanyOverviewResponse = serde_json::from_str(json).unwrap();
        let profile = response.to_asset_profile();

        assert_eq!(profile.source, Some("ALPHA_VANTAGE".to_string()));
        assert_eq!(
            profile.name,
            Some("International Business Machines Corporation".to_string())
        );
        assert_eq!(profile.sector, Some("TECHNOLOGY".to_string()));
        assert_eq!(
            profile.industry,
            Some("COMPUTER & OFFICE EQUIPMENT".to_string())
        );
        assert_eq!(profile.country, Some("USA".to_string()));
        assert_eq!(profile.market_cap, Some(191234567890.0));
        assert_eq!(profile.pe_ratio, Some(22.5));
        assert_eq!(profile.dividend_yield, Some(0.0455));
        assert_eq!(profile.week_52_high, Some(199.18));
        assert_eq!(profile.week_52_low, Some(128.06));
    }

    #[test]
    fn test_company_overview_with_none_values() {
        let json = r#"{
            "Symbol": "TEST",
            "AssetType": "ETF",
            "Name": "Test ETF",
            "Sector": "None",
            "Industry": "-",
            "PERatio": "None",
            "DividendYield": "0"
        }"#;

        let response: CompanyOverviewResponse = serde_json::from_str(json).unwrap();
        let profile = response.to_asset_profile();

        assert_eq!(profile.name, Some("Test ETF".to_string()));
        // "None" and "-" and "0" values should be parsed as None
        assert_eq!(profile.sector, Some("None".to_string())); // Raw string preserved
        assert_eq!(profile.pe_ratio, None); // Parsed as None
        assert_eq!(profile.dividend_yield, None); // "0" treated as None
    }

    #[test]
    fn test_company_overview_parse_f64() {
        assert_eq!(CompanyOverviewResponse::parse_f64(&Some("123.45".to_string())), Some(123.45));
        assert_eq!(CompanyOverviewResponse::parse_f64(&Some("None".to_string())), None);
        assert_eq!(CompanyOverviewResponse::parse_f64(&Some("-".to_string())), None);
        assert_eq!(CompanyOverviewResponse::parse_f64(&Some("0".to_string())), None);
        assert_eq!(CompanyOverviewResponse::parse_f64(&Some("".to_string())), None);
        assert_eq!(CompanyOverviewResponse::parse_f64(&None), None);
    }

    #[test]
    fn test_etf_profile_parsing() {
        let json = r#"{
            "sectors": [
                {"sector": "Information Technology", "weight": "51.1%"},
                {"sector": "Communication Services", "weight": "16.3%"},
                {"sector": "Consumer Discretionary", "weight": "12.3%"},
                {"sector": "Healthcare", "weight": "5.3%"}
            ],
            "holdings": [],
            "dividend_yield": "0.46%"
        }"#;

        let response: EtfProfileResponse = serde_json::from_str(json).unwrap();
        let profile = response.to_asset_profile("QQQ");

        assert_eq!(profile.source, Some("ALPHA_VANTAGE".to_string()));
        assert_eq!(profile.quote_type, Some("ETF".to_string()));
        assert!(profile.sectors.is_some());

        // Verify sectors JSON is properly formatted
        let sectors_json = profile.sectors.unwrap();
        let sectors: Vec<serde_json::Value> = serde_json::from_str(&sectors_json).unwrap();
        assert_eq!(sectors.len(), 4);
        assert_eq!(sectors[0]["name"], "Information Technology");
        assert!((sectors[0]["weight"].as_f64().unwrap() - 0.511).abs() < 0.001);

        // Verify dividend yield is parsed from percentage
        assert!((profile.dividend_yield.unwrap() - 0.0046).abs() < 0.0001);
    }

    #[test]
    fn test_etf_profile_parse_weight() {
        // Test percentage format
        assert!((EtfProfileResponse::parse_weight("51.1%").unwrap() - 0.511).abs() < 0.001);
        assert!((EtfProfileResponse::parse_weight("0.46%").unwrap() - 0.0046).abs() < 0.0001);

        // Test decimal format
        assert!((EtfProfileResponse::parse_weight("0.511").unwrap() - 0.511).abs() < 0.001);

        // Test edge cases
        assert!(EtfProfileResponse::parse_weight("invalid").is_none());
    }
}
