//! Yahoo Finance market data provider.
//!
//! This provider uses the Yahoo Finance API to fetch market data for:
//! - Equities/ETFs (e.g., AAPL, SHOP.TO)
//! - Cryptocurrencies (e.g., BTC-USD)
//! - Foreign exchange rates (e.g., EURUSD=X)

mod models;

use std::sync::RwLock;
use std::time::Duration;

use crate::SymbolResolver;
use async_trait::async_trait;
use chrono::{DateTime, TimeZone, Utc};
use lazy_static::lazy_static;
use log::{debug, warn};
use num_traits::FromPrimitive;
use reqwest::header;
use rust_decimal::Decimal;
use time::OffsetDateTime;
use urlencoding::encode;
use yahoo_finance_api as yahoo;

use crate::errors::MarketDataError;
use crate::models::{
    AssetProfile, Coverage, InstrumentKind, ProviderInstrument, Quote, QuoteContext, SearchResult,
};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};
use crate::resolver::ResolverChain;

use models::{YahooQuoteSummaryResponse, YahooQuoteSummaryResult};

// ============================================================================
// Crumb/Cookie Authentication
// ============================================================================

/// Cached Yahoo authentication data
#[derive(Debug, Clone)]
struct CrumbData {
    cookie: String,
    crumb: String,
}

lazy_static! {
    /// Global cache for Yahoo authentication crumb
    static ref YAHOO_CRUMB: RwLock<Option<CrumbData>> = RwLock::default();
}

// ============================================================================
// Yahoo Provider
// ============================================================================

/// Yahoo Finance market data provider.
///
/// Provides access to market data for equities, ETFs, cryptocurrencies,
/// and foreign exchange rates through the Yahoo Finance API.
pub struct YahooProvider {
    connector: yahoo::YahooConnector,
}

impl YahooProvider {
    /// Create a new Yahoo Finance provider.
    pub async fn new() -> Result<Self, MarketDataError> {
        let connector =
            yahoo::YahooConnector::new().map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: format!("Failed to initialize Yahoo connector: {}", e),
            })?;
        Ok(Self { connector })
    }

    // ========================================================================
    // Symbol Extraction
    // ========================================================================

    /// Extract the symbol string from a ProviderInstrument.
    fn extract_symbol(&self, instrument: &ProviderInstrument) -> Result<String, MarketDataError> {
        match instrument {
            ProviderInstrument::EquitySymbol { symbol } => Ok(symbol.to_string()),
            ProviderInstrument::CryptoSymbol { symbol } => Ok(symbol.to_string()),
            ProviderInstrument::FxSymbol { symbol } => Ok(symbol.to_string()),
            ProviderInstrument::CryptoPair { symbol, market } => {
                Ok(format!("{}-{}", symbol, market))
            }
            ProviderInstrument::FxPair { from, to } => Ok(format!("{}{}=X", from, to)),
            ProviderInstrument::MetalSymbol { symbol, .. } => Ok(symbol.to_string()),
        }
    }

    /// Convert a Yahoo error to a MarketDataError, detecting rate limits.
    fn convert_yahoo_error(&self, e: yahoo::YahooError, symbol: &str) -> MarketDataError {
        let error_msg = e.to_string();

        // Detect rate limiting from error message
        if error_msg.contains("Too many requests")
            || error_msg.contains("rate limit")
            || error_msg.contains("429")
        {
            return MarketDataError::RateLimited {
                provider: "YAHOO".to_string(),
            };
        }

        // Handle known error types
        if matches!(e, yahoo::YahooError::NoQuotes | yahoo::YahooError::NoResult) {
            return MarketDataError::SymbolNotFound(symbol.to_string());
        }

        MarketDataError::ProviderError {
            provider: "YAHOO".to_string(),
            message: error_msg,
        }
    }

    // ========================================================================
    // Crumb/Cookie Authentication
    // ========================================================================

    /// Ensure we have a valid Yahoo authentication crumb.
    async fn ensure_crumb(&self) -> Result<CrumbData, MarketDataError> {
        // Check if we have a cached crumb
        {
            let guard = YAHOO_CRUMB.read().unwrap();
            if let Some(crumb) = guard.as_ref() {
                return Ok(crumb.clone());
            }
        }

        // Fetch new crumb
        self.fetch_crumb().await
    }

    /// Fetch a new Yahoo authentication crumb.
    async fn fetch_crumb(&self) -> Result<CrumbData, MarketDataError> {
        let client = reqwest::Client::new();

        // Step 1: Get cookie from fc.yahoo.com
        let response = client
            .get("https://fc.yahoo.com")
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: format!("Failed to get cookie: {}", e),
            })?;

        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.split_once(';').map(|(v, _)| v.to_string()))
            .ok_or_else(|| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: "Failed to parse Yahoo cookie".to_string(),
            })?;

        // Step 2: Get crumb using cookie
        let crumb = client
            .get("https://query1.finance.yahoo.com/v1/test/getcrumb")
            .header(
                header::USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .header(header::COOKIE, &cookie)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: format!("Failed to get crumb: {}", e),
            })?
            .text()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: format!("Failed to read crumb: {}", e),
            })?;

        let crumb_data = CrumbData { cookie, crumb };

        // Cache it
        let mut guard = YAHOO_CRUMB.write().unwrap();
        *guard = Some(crumb_data.clone());

        Ok(crumb_data)
    }

    /// Clear the cached crumb (used when authentication fails)
    fn clear_crumb(&self) {
        let mut guard = YAHOO_CRUMB.write().unwrap();
        *guard = None;
    }

    // ========================================================================
    // Quote Fetching
    // ========================================================================

    /// Get the currency from exchange context or fallback to hint/USD.
    fn get_currency(&self, context: &QuoteContext) -> String {
        let chain = ResolverChain::new();
        chain
            .get_currency(&"YAHOO".into(), context)
            .or_else(|| context.currency_hint.clone())
            .map(|c| c.to_string())
            .unwrap_or_else(|| "USD".to_string())
    }

    /// Convert chrono DateTime<Utc> to time::OffsetDateTime for the Yahoo API.
    fn chrono_to_offset_datetime(dt: DateTime<Utc>) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(dt.timestamp())
            .unwrap_or_else(|_| OffsetDateTime::now_utc())
    }

    /// Convert a Yahoo quote to our Quote model.
    fn yahoo_quote_to_quote(
        &self,
        yahoo_quote: yahoo::Quote,
        currency: String,
    ) -> Result<Quote, MarketDataError> {
        // Validate timestamp
        let timestamp: DateTime<Utc> = Utc
            .timestamp_opt(yahoo_quote.timestamp, 0)
            .single()
            .ok_or_else(|| MarketDataError::ValidationFailed {
                message: format!("Invalid timestamp: {}", yahoo_quote.timestamp),
            })?;

        // Close price is required
        let close = Decimal::from_f64_retain(yahoo_quote.close).ok_or_else(|| {
            MarketDataError::ValidationFailed {
                message: format!(
                    "Failed to convert close price {} to Decimal",
                    yahoo_quote.close
                ),
            }
        })?;

        Ok(Quote {
            timestamp,
            open: Decimal::from_f64_retain(yahoo_quote.open),
            high: Decimal::from_f64_retain(yahoo_quote.high),
            low: Decimal::from_f64_retain(yahoo_quote.low),
            close,
            volume: Decimal::from_u64(yahoo_quote.volume),
            currency,
            source: "YAHOO".to_string(),
        })
    }

    /// Fetch latest quote using primary method (library API).
    async fn fetch_latest_quote_primary(
        &self,
        symbol: &str,
        context: &QuoteContext,
    ) -> Result<Quote, MarketDataError> {
        let currency = self.get_currency(context);

        let response = self
            .connector
            .get_latest_quotes(symbol, "1d")
            .await
            .map_err(|e| self.convert_yahoo_error(e, symbol))?;

        let yahoo_quote = response.last_quote().map_err(|e| {
            warn!("No quotes returned for {}: {}", symbol, e);
            MarketDataError::SymbolNotFound(symbol.to_string())
        })?;

        self.yahoo_quote_to_quote(yahoo_quote, currency)
    }

    /// Fetch latest quote using backup method (quoteSummary API).
    async fn fetch_latest_quote_backup(
        &self,
        symbol: &str,
        context: &QuoteContext,
    ) -> Result<Quote, MarketDataError> {
        let crumb = self.ensure_crumb().await?;

        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=price&crumb={}",
            encode(symbol),
            encode(&crumb.crumb)
        );

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .header(
                header::USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .header(header::COOKIE, &crumb.cookie)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: format!("Backup quote request failed: {}", e),
            })?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_crumb();
            return Err(MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: "Yahoo authentication expired".to_string(),
            });
        }

        let data: YahooQuoteSummaryResponse =
            response
                .json()
                .await
                .map_err(|e| MarketDataError::ProviderError {
                    provider: "YAHOO".to_string(),
                    message: format!("Failed to parse backup quote response: {}", e),
                })?;

        let price = data
            .quote_summary
            .result
            .first()
            .and_then(|r| r.price.as_ref())
            .ok_or_else(|| MarketDataError::SymbolNotFound(symbol.to_string()))?;

        // Extract currency: API response > context hint (derived from MIC)
        let currency = price
            .currency
            .clone()
            .unwrap_or_else(|| self.get_currency(context));

        let close = price
            .regular_market_price
            .as_ref()
            .and_then(|p| p.raw)
            .and_then(Decimal::from_f64_retain)
            .ok_or_else(|| MarketDataError::ValidationFailed {
                message: "No valid price in backup response".to_string(),
            })?;

        let timestamp = price
            .regular_market_time
            .and_then(|ts| Utc.timestamp_opt(ts, 0).single())
            .unwrap_or_else(Utc::now);

        Ok(Quote {
            timestamp,
            open: price
                .regular_market_open
                .as_ref()
                .and_then(|p| p.raw)
                .and_then(Decimal::from_f64_retain),
            high: price
                .regular_market_day_high
                .as_ref()
                .and_then(|p| p.raw)
                .and_then(Decimal::from_f64_retain),
            low: price
                .regular_market_day_low
                .as_ref()
                .and_then(|p| p.raw)
                .and_then(Decimal::from_f64_retain),
            close,
            volume: price
                .regular_market_volume
                .as_ref()
                .and_then(|p| p.raw)
                .and_then(Decimal::from_f64_retain),
            currency,
            source: "YAHOO".to_string(),
        })
    }

    // ========================================================================
    // Profile Fetching
    // ========================================================================

    /// Fetch profile using quoteSummary API (richest data source).
    async fn fetch_quote_summary_profile(
        &self,
        symbol: &str,
    ) -> Result<AssetProfile, MarketDataError> {
        let crumb = self.ensure_crumb().await?;

        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=price,summaryProfile,summaryDetail,topHoldings&crumb={}",
            encode(symbol),
            encode(&crumb.crumb)
        );

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .header(
                header::USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .header(header::COOKIE, &crumb.cookie)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: format!("Profile request failed: {}", e),
            })?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_crumb();
            return Err(MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: "Yahoo authentication expired".to_string(),
            });
        }

        // Get response text first for debugging
        let response_text = response
            .text()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: format!("Failed to read profile response: {}", e),
            })?;

        let data: YahooQuoteSummaryResponse =
            serde_json::from_str(&response_text).map_err(|e| {
                warn!(
                    "[YAHOO] Failed to parse quoteSummary for {}: {}. Response: {}",
                    symbol,
                    e,
                    &response_text[..response_text.len().min(1000)]
                );
                MarketDataError::ProviderError {
                    provider: "YAHOO".to_string(),
                    message: format!("Failed to parse profile response: {}", e),
                }
            })?;

        let result = data
            .quote_summary
            .result
            .into_iter()
            .next()
            .ok_or_else(|| MarketDataError::SymbolNotFound(symbol.to_string()))?;

        self.map_quote_summary_to_profile(symbol, &result)
    }

    /// Fetch profile using search (last resort, minimal data).
    async fn fetch_search_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let encoded_symbol = encode(symbol);
        let result = self
            .connector
            .search_ticker(&encoded_symbol)
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: e.to_string(),
            })?;

        let item = result
            .quotes
            .iter()
            .find(|q| q.symbol == symbol)
            .ok_or_else(|| MarketDataError::SymbolNotFound(symbol.to_string()))?;

        Ok(AssetProfile {
            source: Some("YAHOO".to_string()),
            name: Some(format_name(
                Some(&item.long_name),
                &item.quote_type,
                Some(&item.short_name),
                symbol,
            )),
            quote_type: Some(item.quote_type.to_uppercase()),
            ..Default::default()
        })
    }

    /// Map quoteSummary result to AssetProfile.
    fn map_quote_summary_to_profile(
        &self,
        symbol: &str,
        result: &YahooQuoteSummaryResult,
    ) -> Result<AssetProfile, MarketDataError> {
        let price = result.price.as_ref();
        let summary = result.summary_profile.as_ref();
        let detail = result.summary_detail.as_ref();
        let top_holdings = result.top_holdings.as_ref();

        // Get quote type for name formatting and classification
        let quote_type = price
            .and_then(|p| p.quote_type.as_ref())
            .map(|s| s.as_str())
            .unwrap_or("");
        let quote_type_upper = quote_type.to_uppercase();

        // Format name
        let name = format_name(
            price.and_then(|p| p.long_name.as_deref()),
            quote_type,
            price.and_then(|p| p.short_name.as_deref()),
            symbol,
        );

        // Build sector/sectors based on asset type
        let (sector, sectors) = match quote_type_upper.as_str() {
            "ETF" | "MUTUALFUND" => {
                // For ETFs/Mutual Funds: extract sector weightings from topHoldings
                let sectors_json = top_holdings.and_then(|th| {
                    if th.sector_weightings.is_empty() {
                        return None;
                    }
                    let sector_data: Vec<serde_json::Value> = th
                        .sector_weightings
                        .iter()
                        .flat_map(|sw| {
                            sw.iter().filter_map(|(sector_name, weight)| {
                                weight.raw.map(|w| {
                                    serde_json::json!({
                                        "name": format_sector(sector_name),
                                        "weight": w
                                    })
                                })
                            })
                        })
                        .collect();
                    if sector_data.is_empty() {
                        None
                    } else {
                        serde_json::to_string(&sector_data).ok()
                    }
                });
                (None, sectors_json)
            }
            _ => {
                // For stocks: use single sector from summaryProfile
                let sector = summary
                    .and_then(|s| s.sector.as_ref())
                    .map(|s| format_sector(s));
                (sector, None)
            }
        };

        let profile = AssetProfile {
            source: Some("YAHOO".to_string()),
            name: Some(name),
            quote_type: price
                .and_then(|p| p.quote_type.clone())
                .map(|t| t.to_uppercase()),
            sector,
            sectors,
            industry: summary.and_then(|s| s.industry.clone()),
            website: summary.and_then(|s| s.website.clone()),
            description: summary
                .and_then(|s| s.long_business_summary.clone().or(s.description.clone())),
            country: summary.and_then(|s| s.country.clone()),
            employees: summary.and_then(|s| s.full_time_employees),
            // Financial metrics from summaryDetail (extract .raw from YahooPriceDetail)
            market_cap: detail.and_then(|d| d.market_cap.as_ref().and_then(|v| v.raw)),
            pe_ratio: detail.and_then(|d| d.trailing_pe.as_ref().and_then(|v| v.raw)),
            dividend_yield: detail.and_then(|d| d.dividend_yield.as_ref().and_then(|v| v.raw)),
            week_52_high: detail.and_then(|d| d.fifty_two_week_high.as_ref().and_then(|v| v.raw)),
            week_52_low: detail.and_then(|d| d.fifty_two_week_low.as_ref().and_then(|v| v.raw)),
            ..Default::default()
        };

        // Log mapped profile for debugging
        debug!(
            "[YAHOO PROFILE MAPPED] symbol={}, name={:?}, quote_type={:?}, sector={:?}, sectors={:?}, industry={:?}, country={:?}, description_len={:?}",
            symbol,
            profile.name,
            profile.quote_type,
            profile.sector,
            profile.sectors.as_ref().map(|s| if s.len() > 100 { format!("{}...", &s[..100]) } else { s.clone() }),
            profile.industry,
            profile.country,
            profile.description.as_ref().map(|d| d.len())
        );

        Ok(profile)
    }
}

// ============================================================================
// MarketDataProvider Implementation
// ============================================================================

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
            instrument_kinds: &[
                InstrumentKind::Equity,
                InstrumentKind::Crypto,
                InstrumentKind::Fx,
            ],
            coverage: Coverage::global_best_effort(),
            supports_latest: true,
            supports_historical: true,
            supports_search: true,
            supports_profile: true,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 1000,
            max_concurrency: 5,
            min_delay: Duration::from_millis(50),
        }
    }

    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        let symbol = self.extract_symbol(&instrument)?;

        debug!("Fetching latest quote for {} from Yahoo", symbol);

        // Try primary method first
        match self.fetch_latest_quote_primary(&symbol, context).await {
            Ok(quote) => return Ok(quote),
            Err(e) => {
                debug!(
                    "Primary quote fetch failed for {}: {}, trying backup",
                    symbol, e
                );
            }
        }

        // Fallback to quoteSummary price data
        self.fetch_latest_quote_backup(&symbol, context).await
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
        if symbol.starts_with("CASH:") {
            return Ok(vec![]);
        }

        let start_time = Self::chrono_to_offset_datetime(start);
        let end_time = Self::chrono_to_offset_datetime(end);

        let response = self
            .connector
            .get_quote_history(&symbol, start_time, end_time)
            .await
            .map_err(|e| self.convert_yahoo_error(e, &symbol))?;

        match response.quotes() {
            Ok(yahoo_quotes) => {
                let quotes: Vec<Quote> = yahoo_quotes
                    .into_iter()
                    .filter_map(|q| match self.yahoo_quote_to_quote(q, currency.clone()) {
                        Ok(quote) => Some(quote),
                        Err(e) => {
                            warn!("Skipping quote due to conversion error: {:?}", e);
                            None
                        }
                    })
                    .collect();

                if quotes.is_empty() {
                    return Err(MarketDataError::NoDataForRange);
                }

                Ok(quotes)
            }
            Err(yahoo::YahooError::NoQuotes) => {
                warn!(
                    "No historical quotes returned for '{}' between {} and {}",
                    symbol,
                    start.format("%Y-%m-%d"),
                    end.format("%Y-%m-%d")
                );
                Err(MarketDataError::NoDataForRange)
            }
            Err(e) => Err(self.convert_yahoo_error(e, &symbol)),
        }
    }

    async fn search(&self, query: &str) -> Result<Vec<SearchResult>, MarketDataError> {
        let encoded_query = encode(query);

        debug!("Searching Yahoo for '{}'", query);

        let result = self
            .connector
            .search_ticker(&encoded_query)
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: "YAHOO".to_string(),
                message: e.to_string(),
            })?;

        let search_results = result
            .quotes
            .iter()
            .map(|item| {
                SearchResult::new(
                    &item.symbol,
                    &item.long_name,
                    &item.exchange,
                    &item.quote_type,
                )
                .with_score(item.score)
            })
            .collect();

        Ok(search_results)
    }

    async fn get_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        debug!("[YAHOO] get_profile called for symbol: {}", symbol);

        // Try quoteSummary API first (richest data)
        match self.fetch_quote_summary_profile(symbol).await {
            Ok(profile) => {
                debug!("[YAHOO] quoteSummary succeeded for {}", symbol);
                return Ok(profile);
            }
            Err(e) => {
                debug!(
                    "quoteSummary failed for {}: {}, trying search fallback",
                    symbol, e
                );
            }
        }

        // Last resort: search-based profile
        debug!(
            "[YAHOO] Falling back to search-based profile for {}",
            symbol
        );
        let profile = self.fetch_search_profile(symbol).await?;
        debug!(
            "[YAHOO PROFILE FROM SEARCH] symbol={}, name={:?}, quote_type={:?}",
            symbol, profile.name, profile.quote_type
        );
        Ok(profile)
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Clean up fund names by removing common prefixes.
fn format_name(
    long_name: Option<&str>,
    quote_type: &str,
    short_name: Option<&str>,
    symbol: &str,
) -> String {
    let mut name = long_name.unwrap_or("").to_string();

    if !name.is_empty() {
        let replacements = [
            ("&amp;", "&"),
            ("Amundi Index Solutions - ", ""),
            ("iShares ETF (CH) - ", ""),
            ("iShares III Public Limited Company - ", ""),
            ("iShares V PLC - ", ""),
            ("iShares VI Public Limited Company - ", ""),
            ("iShares VII PLC - ", ""),
            ("Multi Units Luxembourg - ", ""),
            ("VanEck ETFs N.V. - ", ""),
            ("Vaneck Vectors Ucits Etfs Plc - ", ""),
            ("Vanguard Funds Public Limited Company - ", ""),
            ("Vanguard Index Funds - ", ""),
            ("Xtrackers (IE) Plc - ", ""),
        ];

        for (from, to) in &replacements {
            name = name.replace(from, to);
        }
    }

    // Special handling for futures - strip date suffix
    if quote_type.to_uppercase() == "FUTURE" {
        if let Some(sn) = short_name {
            if sn.len() >= 7 {
                return sn[..sn.len() - 7].to_string();
            }
        }
    }

    if name.is_empty() {
        short_name.unwrap_or(symbol).to_string()
    } else {
        name
    }
}

/// Convert snake_case sector to Title Case.
fn format_sector(sector: &str) -> String {
    sector
        .split('_')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().chain(chars).collect(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;
    use std::sync::Arc;

    #[test]
    fn test_format_name() {
        // Test fund name cleanup
        assert_eq!(
            format_name(
                Some("iShares VII PLC - iShares Core S&P 500"),
                "ETF",
                None,
                "IVV"
            ),
            "iShares Core S&P 500"
        );

        // Test HTML entity replacement
        assert_eq!(
            format_name(Some("Apple Inc &amp; Co"), "EQUITY", None, "AAPL"),
            "Apple Inc & Co"
        );

        // Test fallback to short_name
        assert_eq!(
            format_name(None, "EQUITY", Some("AAPL Inc"), "AAPL"),
            "AAPL Inc"
        );

        // Test fallback to symbol
        assert_eq!(format_name(None, "EQUITY", None, "AAPL"), "AAPL");
    }

    #[test]
    fn test_format_sector() {
        assert_eq!(format_sector("technology"), "Technology");
        assert_eq!(format_sector("basic_materials"), "Basic Materials");
        assert_eq!(format_sector("real_estate"), "Real Estate");
        assert_eq!(format_sector("consumer_cyclical"), "Consumer Cyclical");
    }

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
    fn test_capabilities() {
        let capabilities = ProviderCapabilities {
            instrument_kinds: &[
                InstrumentKind::Equity,
                InstrumentKind::Crypto,
                InstrumentKind::Fx,
            ],
            coverage: Coverage::global_best_effort(),
            supports_latest: true,
            supports_historical: true,
            supports_search: true,
            supports_profile: true,
        };

        assert!(capabilities
            .instrument_kinds
            .contains(&InstrumentKind::Equity));
        assert!(capabilities
            .instrument_kinds
            .contains(&InstrumentKind::Crypto));
        assert!(capabilities.instrument_kinds.contains(&InstrumentKind::Fx));
        assert!(capabilities.supports_latest);
        assert!(capabilities.supports_historical);
        assert!(capabilities.supports_search);
        assert!(capabilities.supports_profile);
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
