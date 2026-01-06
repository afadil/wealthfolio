use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::market_data_provider::MarketDataProvider;
use crate::market_data::providers::models::AssetProfile;
use crate::market_data::{AssetProfiler, MarketDataError, Quote as ModelQuote, QuoteSummary};
use async_trait::async_trait;
use chrono::{NaiveDate, Utc};
use reqwest::Client;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::HashMap;
use std::time::SystemTime;

const BASE_URL: &str = "https://www.alphavantage.co/query";

pub struct AlphaVantageProvider {
    client: Client,
    token: String,
}

impl AlphaVantageProvider {
    pub fn new(token: String) -> Self {
        let client = Client::new();
        AlphaVantageProvider { client, token }
    }

    /// Check if a symbol is an FX pair
    /// Supports multiple formats:
    /// - "USD/CAD" (canonical format)
    /// - "USDCAD=X" (Yahoo format)
    /// - "USDCAD" (simple concatenation)
    fn is_fx_symbol(symbol: &str) -> bool {
        // Format: USD/CAD (canonical)
        if symbol.contains('/')
            && symbol.len() == 7
            && symbol.chars().filter(|&c| c == '/').count() == 1
        {
            return true;
        }

        // Format: USDCAD=X (Yahoo FX format)
        if symbol.len() == 8 && symbol.ends_with("=X") {
            let base = &symbol[..6];
            return base.chars().all(|c| c.is_ascii_uppercase());
        }

        // Format: USDCAD (6 uppercase letters, both parts are valid currency codes)
        if symbol.len() == 6 && symbol.chars().all(|c| c.is_ascii_uppercase()) {
            return true;
        }

        false
    }

    /// Parse an FX symbol into (from_currency, to_currency)
    /// Supports multiple formats:
    /// - "USD/CAD" -> ("USD", "CAD")
    /// - "USDCAD=X" -> ("USD", "CAD")
    /// - "USDCAD" -> ("USD", "CAD")
    fn parse_fx_symbol(symbol: &str) -> Option<(String, String)> {
        // Format: USD/CAD
        if let Some((from, to)) = symbol.split_once('/') {
            if from.len() == 3 && to.len() == 3 {
                return Some((from.to_string(), to.to_string()));
            }
        }

        // Format: USDCAD=X (Yahoo format)
        if symbol.len() == 8 && symbol.ends_with("=X") {
            let base = &symbol[..6];
            if base.chars().all(|c| c.is_ascii_uppercase()) {
                return Some((base[..3].to_string(), base[3..6].to_string()));
            }
        }

        // Format: USDCAD (6 chars)
        if symbol.len() == 6 && symbol.chars().all(|c| c.is_ascii_uppercase()) {
            return Some((symbol[..3].to_string(), symbol[3..6].to_string()));
        }

        None
    }

    async fn fetch_data(
        &self,
        function: &str,
        params: Vec<(&str, &str)>,
    ) -> Result<String, MarketDataError> {
        let mut query_params = params;
        query_params.push(("function", function));
        query_params.push(("apikey", &self.token));

        let url = reqwest::Url::parse_with_params(BASE_URL, &query_params)
            .map_err(|e| MarketDataError::ProviderError(format!("Failed to build URL: {}", e)))?;

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(MarketDataError::ProviderError(format!(
                "AlphaVantage API error: {}",
                error_body
            )));
        }

        let text = response
            .text()
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;

        // Check for rate limit or API key errors in the response
        // Alpha Vantage uses both "Note" and "Information" fields for various messages
        if text.contains("\"Note\"") || text.contains("\"Information\"") {
            // Rate limit messages contain these phrases
            if text.contains("API call frequency")
                || text.contains("rate limit")
                || text.contains("25 requests per day")
                || text.contains("calls per minute")
            {
                log::warn!("AlphaVantage rate limit hit: {}", text);
                return Err(MarketDataError::ProviderError(
                    "Alpha Vantage rate limit exceeded (25 requests/day for free tier). Please wait and try again tomorrow.".to_string(),
                ));
            }
            // Log the full message for debugging
            log::warn!("AlphaVantage returned Note/Information message: {}", text);
            return Err(MarketDataError::ProviderError(format!(
                "Alpha Vantage API message: {}",
                text.chars().take(200).collect::<String>()
            )));
        }

        // Check for error messages
        if text.contains("\"Error Message\"") {
            log::error!("AlphaVantage API error: {}", text);
            return Err(MarketDataError::ProviderError(format!(
                "Alpha Vantage API error: {}",
                text.chars().take(200).collect::<String>()
            )));
        }

        Ok(text)
    }

    async fn get_latest_fx_quote(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<ModelQuote, MarketDataError> {
        let (from_currency, to_currency) = Self::parse_fx_symbol(symbol).ok_or_else(|| {
            MarketDataError::ProviderError(format!("Invalid FX symbol format: {}", symbol))
        })?;

        log::info!(
            "AlphaVantage: Fetching FX rate for {}/{} (symbol: {})",
            from_currency,
            to_currency,
            symbol
        );

        let params = vec![
            ("from_symbol", from_currency.as_str()),
            ("to_symbol", to_currency.as_str()),
            ("outputsize", "compact"),
        ];
        let response_text = self.fetch_data("FX_DAILY", params).await?;
        let response_json: FxTimeSeries = serde_json::from_str(&response_text).map_err(|e| {
            MarketDataError::ProviderError(format!("Failed to parse FX quote: {}", e))
        })?;

        let (date, quote) = response_json.time_series.iter().next().ok_or_else(|| {
            MarketDataError::ProviderError("No FX time series data found".to_string())
        })?;

        let quote_timestamp = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| MarketDataError::ProviderError("Invalid date format".to_string()))?
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(Utc)
            .unwrap();

        let model_quote = ModelQuote {
            id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), symbol),
            created_at: Utc::now(),
            data_source: DataSource::AlphaVantage,
            timestamp: quote_timestamp,
            symbol: symbol.to_string(),
            open: quote.open.parse::<Decimal>().unwrap_or_default(),
            high: quote.high.parse::<Decimal>().unwrap_or_default(),
            low: quote.low.parse::<Decimal>().unwrap_or_default(),
            volume: Decimal::ZERO, // FX quotes don't have volume
            close: quote.close.parse::<Decimal>().unwrap_or_default(),
            adjclose: quote.close.parse::<Decimal>().unwrap_or_default(),
            currency: fallback_currency,
            notes: None,
        };
        Ok(model_quote)
    }

    async fn get_historical_fx_quotes(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        let (from_currency, to_currency) = Self::parse_fx_symbol(symbol).ok_or_else(|| {
            MarketDataError::ProviderError(format!("Invalid FX symbol format: {}", symbol))
        })?;

        log::info!(
            "AlphaVantage: Fetching historical FX rates for {}/{} (symbol: {})",
            from_currency,
            to_currency,
            symbol
        );

        // Use "compact" for free tier (returns last 100 data points)
        // "full" requires premium subscription
        let params = vec![
            ("from_symbol", from_currency.as_str()),
            ("to_symbol", to_currency.as_str()),
            ("outputsize", "compact"),
        ];
        let response_text = self.fetch_data("FX_DAILY", params).await?;

        log::debug!(
            "AlphaVantage FX_DAILY response (first 500 chars): {}",
            &response_text.chars().take(500).collect::<String>()
        );

        let response_json: FxTimeSeries = serde_json::from_str(&response_text).map_err(|e| {
            log::error!(
                "AlphaVantage: Failed to parse FX response for {}: {}. Response: {}",
                symbol,
                e,
                &response_text.chars().take(1000).collect::<String>()
            );
            MarketDataError::ProviderError(format!("Failed to parse FX historical quotes: {}", e))
        })?;

        let quotes = response_json
            .time_series
            .into_iter()
            .map(|(date, quote)| {
                let quote_timestamp = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
                    .unwrap()
                    .and_hms_opt(0, 0, 0)
                    .unwrap()
                    .and_local_timezone(Utc)
                    .unwrap();

                ModelQuote {
                    id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), symbol),
                    created_at: Utc::now(),
                    data_source: DataSource::AlphaVantage,
                    timestamp: quote_timestamp,
                    symbol: symbol.to_string(),
                    open: quote.open.parse::<Decimal>().unwrap_or_default(),
                    high: quote.high.parse::<Decimal>().unwrap_or_default(),
                    low: quote.low.parse::<Decimal>().unwrap_or_default(),
                    volume: Decimal::ZERO, // FX quotes don't have volume
                    close: quote.close.parse::<Decimal>().unwrap_or_default(),
                    adjclose: quote.close.parse::<Decimal>().unwrap_or_default(),
                    currency: fallback_currency.clone(),
                    notes: None,
                }
            })
            .collect();

        Ok(quotes)
    }
}

#[derive(Debug, Deserialize)]
struct AlphaVantageQuote {
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

#[derive(Debug, Deserialize)]
struct TimeSeriesDaily {
    #[serde(rename = "Time Series (Daily)")]
    time_series: HashMap<String, AlphaVantageQuote>,
}

// FX-specific response structures
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

#[derive(Debug, Deserialize)]
struct FxTimeSeries {
    #[serde(rename = "Time Series FX (Daily)")]
    time_series: HashMap<String, FxDailyQuote>,
}

#[async_trait]
impl MarketDataProvider for AlphaVantageProvider {
    fn name(&self) -> &'static str {
        "ALPHA_VANTAGE"
    }

    fn priority(&self) -> u8 {
        3
    }

    async fn get_latest_quote(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<ModelQuote, MarketDataError> {
        // Check if this is an FX symbol
        if Self::is_fx_symbol(symbol) {
            return self.get_latest_fx_quote(symbol, fallback_currency).await;
        }

        let params = vec![("symbol", symbol), ("outputsize", "compact")];
        let response_text = self.fetch_data("TIME_SERIES_DAILY", params).await?;
        let response_json: TimeSeriesDaily = serde_json::from_str(&response_text).map_err(|e| {
            MarketDataError::ProviderError(format!("Failed to parse latest quote: {}", e))
        })?;

        let (date, quote) = response_json.time_series.iter().next().ok_or_else(|| {
            MarketDataError::ProviderError("No time series data found".to_string())
        })?;

        let quote_timestamp = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| MarketDataError::ProviderError("Invalid date format".to_string()))?
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(Utc)
            .unwrap();

        let model_quote = ModelQuote {
            id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), symbol),
            created_at: Utc::now(),
            data_source: DataSource::AlphaVantage,
            timestamp: quote_timestamp,
            symbol: symbol.to_string(),
            open: quote.open.parse::<Decimal>().unwrap_or_default(),
            high: quote.high.parse::<Decimal>().unwrap_or_default(),
            low: quote.low.parse::<Decimal>().unwrap_or_default(),
            volume: quote.volume.parse::<Decimal>().unwrap_or_default(),
            close: quote.close.parse::<Decimal>().unwrap_or_default(),
            adjclose: quote.close.parse::<Decimal>().unwrap_or_default(),
            currency: fallback_currency,
            notes: None,
        };
        Ok(model_quote)
    }

    async fn get_historical_quotes(
        &self,
        symbol: &str,
        _start: SystemTime,
        _end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        log::debug!(
            "AlphaVantage: get_historical_quotes called for symbol='{}', is_fx={}",
            symbol,
            Self::is_fx_symbol(symbol)
        );

        // Check if this is an FX symbol
        if Self::is_fx_symbol(symbol) {
            return self
                .get_historical_fx_quotes(symbol, fallback_currency)
                .await;
        }

        // Use "compact" for free tier (returns last 100 data points)
        // "full" requires premium subscription
        let params = vec![("symbol", symbol), ("outputsize", "compact")];
        let response_text = self.fetch_data("TIME_SERIES_DAILY", params).await?;
        let response_json: TimeSeriesDaily = serde_json::from_str(&response_text).map_err(|e| {
            MarketDataError::ProviderError(format!("Failed to parse historical quotes: {}", e))
        })?;

        let quotes = response_json
            .time_series
            .into_iter()
            .map(|(date, quote)| {
                let quote_timestamp = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
                    .unwrap()
                    .and_hms_opt(0, 0, 0)
                    .unwrap()
                    .and_local_timezone(Utc)
                    .unwrap();

                ModelQuote {
                    id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), symbol),
                    created_at: Utc::now(),
                    data_source: DataSource::AlphaVantage,
                    timestamp: quote_timestamp,
                    symbol: symbol.to_string(),
                    open: quote.open.parse::<Decimal>().unwrap_or_default(),
                    high: quote.high.parse::<Decimal>().unwrap_or_default(),
                    low: quote.low.parse::<Decimal>().unwrap_or_default(),
                    volume: quote.volume.parse::<Decimal>().unwrap_or_default(),
                    close: quote.close.parse::<Decimal>().unwrap_or_default(),
                    adjclose: quote.close.parse::<Decimal>().unwrap_or_default(),
                    currency: fallback_currency.clone(),
                    notes: None,
                }
            })
            .collect();

        Ok(quotes)
    }

    async fn get_historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        // Alpha Vantage free tier: 1 request per second, 25 requests per day
        // Process sequentially with delays to avoid rate limiting
        let mut all_quotes = Vec::new();
        let mut failed_symbols: Vec<(String, String)> = Vec::new();
        let mut errors_for_logging: Vec<(String, String)> = Vec::new();

        for (i, (symbol, currency)) in symbols_with_currencies.iter().enumerate() {
            // Add delay before EVERY request to respect 1 req/sec limit
            // This ensures proper spacing even across different batches/calls
            // (batches are grouped by start_date, so multiple bulk calls may happen)
            if i > 0 {
                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
            } else {
                // Small delay even for first request to handle back-to-back batch calls
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }

            match self
                .get_historical_quotes(symbol, start, end, currency.clone())
                .await
            {
                Ok(quotes) => {
                    log::info!(
                        "AlphaVantage: Successfully fetched {} quotes for {}",
                        quotes.len(),
                        symbol
                    );
                    all_quotes.extend(quotes);
                }
                Err(e) => {
                    failed_symbols.push((symbol.clone(), currency.clone()));
                    errors_for_logging.push((symbol.clone(), e.to_string()));
                }
            }
        }

        if !errors_for_logging.is_empty() {
            log::warn!(
                "Failed to fetch history for {} symbols from AlphaVantage: {:?}",
                errors_for_logging.len(),
                errors_for_logging
            );
        }

        Ok((all_quotes, failed_symbols))
    }
}

#[derive(Debug, Deserialize)]
struct SymbolSearchResponse {
    #[serde(rename = "bestMatches")]
    best_matches: Vec<SearchMatch>,
}

#[derive(Debug, Deserialize)]
struct SearchMatch {
    #[serde(rename = "1. symbol")]
    symbol: String,
    #[serde(rename = "2. name")]
    name: String,
    #[serde(rename = "3. type")]
    asset_type: String,
    #[serde(rename = "4. region")]
    region: String,
    #[serde(rename = "9. matchScore")]
    match_score: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct CompanyOverview {
    pub symbol: String,
    pub asset_type: String,
    pub name: String,
    pub description: String,
    pub cik: String,
    pub exchange: String,
    pub currency: String,
    pub country: String,
    pub sector: String,
    pub industry: String,
    pub address: String,
    #[serde(rename = "FiscalYearEnd")]
    pub fiscal_year_end: String,
    #[serde(rename = "LatestQuarter")]
    pub latest_quarter: String,
    #[serde(rename = "MarketCapitalization")]
    pub market_capitalization: String,
    #[serde(rename = "EBITDA")]
    pub ebitda: String,
    #[serde(rename = "PERatio")]
    pub pe_ratio: String,
    #[serde(rename = "PEGRatio")]
    pub peg_ratio: String,
    #[serde(rename = "BookValue")]
    pub book_value: String,
    #[serde(rename = "DividendPerShare")]
    pub dividend_per_share: String,
    #[serde(rename = "DividendYield")]
    pub dividend_yield: String,
    #[serde(rename = "EPS")]
    pub eps: String,
    #[serde(rename = "RevenuePerShareTTM")]
    pub revenue_per_share_ttm: String,
    #[serde(rename = "ProfitMargin")]
    pub profit_margin: String,
    #[serde(rename = "OperatingMarginTTM")]
    pub operating_margin_ttm: String,
    #[serde(rename = "ReturnOnAssetsTTM")]
    pub return_on_assets_ttm: String,
    #[serde(rename = "ReturnOnEquityTTM")]
    pub return_on_equity_ttm: String,
    #[serde(rename = "RevenueTTM")]
    pub revenue_ttm: String,
    #[serde(rename = "GrossProfitTTM")]
    pub gross_profit_ttm: String,
    #[serde(rename = "DilutedEPSTTM")]
    pub diluted_eps_ttm: String,
    #[serde(rename = "QuarterlyEarningsGrowthYOY")]
    pub quarterly_earnings_growth_yoy: String,
    #[serde(rename = "QuarterlyRevenueGrowthYOY")]
    pub quarterly_revenue_growth_yoy: String,
    #[serde(rename = "AnalystTargetPrice")]
    pub analyst_target_price: String,
    #[serde(rename = "TrailingPE")]
    pub trailing_pe: String,
    #[serde(rename = "ForwardPE")]
    pub forward_pe: String,
    #[serde(rename = "PriceToSalesRatioTTM")]
    pub price_to_sales_ratio_ttm: String,
    #[serde(rename = "PriceToBookRatio")]
    pub price_to_book_ratio: String,
    #[serde(rename = "EVToRevenue")]
    pub ev_to_revenue: String,
    #[serde(rename = "EVToEBITDA")]
    pub ev_to_ebitda: String,
    #[serde(rename = "Beta")]
    pub beta: String,
    #[serde(rename = "52WeekHigh")]
    pub week_52_high: String,
    #[serde(rename = "52WeekLow")]
    pub week_52_low: String,
    #[serde(rename = "50DayMovingAverage")]
    pub day_50_moving_average: String,
    #[serde(rename = "200DayMovingAverage")]
    pub day_200_moving_average: String,
    #[serde(rename = "SharesOutstanding")]
    pub shares_outstanding: String,
    #[serde(rename = "DividendDate")]
    pub dividend_date: String,
    #[serde(rename = "ExDividendDate")]
    pub ex_dividend_date: String,
}

#[async_trait]
impl AssetProfiler for AlphaVantageProvider {
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let params = vec![("symbol", symbol)];
        let response_text = self.fetch_data("OVERVIEW", params).await?;
        let overview: CompanyOverview = serde_json::from_str(&response_text).map_err(|e| {
            MarketDataError::ProviderError(format!("Failed to parse asset profile: {}", e))
        })?;

        let profile = AssetProfile {
            id: Some(overview.symbol.clone()),
            name: Some(overview.name),
            asset_type: Some(overview.asset_type),
            symbol: overview.symbol,
            data_source: DataSource::AlphaVantage.as_str().to_string(),
            currency: overview.currency,
            notes: Some(overview.description),
            ..Default::default()
        };

        Ok(profile)
    }

    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        log::debug!("Searching AlphaVantage for ticker with query: {}", query);
        let params = vec![("keywords", query)];
        let response_text = self.fetch_data("SYMBOL_SEARCH", params).await?;
        let search_response: SymbolSearchResponse =
            serde_json::from_str(&response_text).map_err(|e| {
                MarketDataError::ProviderError(format!("Failed to parse search results: {}", e))
            })?;

        let summaries = search_response
            .best_matches
            .into_iter()
            .map(|m| QuoteSummary {
                symbol: m.symbol,
                long_name: m.name.clone(),
                short_name: m.name,
                quote_type: m.asset_type,
                exchange: m.region,
                score: m.match_score.parse::<f64>().unwrap_or(0.0),
                type_display: "".to_string(),
                index: "".to_string(),
            })
            .collect();

        Ok(summaries)
    }
}
