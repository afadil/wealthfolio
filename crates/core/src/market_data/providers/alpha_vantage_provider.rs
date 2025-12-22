use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::market_data_provider::MarketDataProvider;
use crate::market_data::providers::models::AssetProfile;
use crate::market_data::{AssetProfiler, MarketDataError, Quote as ModelQuote, QuoteSummary};
use async_trait::async_trait;
use chrono::{NaiveDate, Utc};
use futures;
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
        Ok(text)
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
        let params = vec![("symbol", symbol), ("outputsize", "full")];
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
        const BATCH_SIZE: usize = 5; // Alpha Vantage has a low rate limit on the free tier
        let mut all_quotes = Vec::new();
        let mut failed_symbols: Vec<(String, String)> = Vec::new();
        let mut errors_for_logging: Vec<(String, String)> = Vec::new();

        for chunk in symbols_with_currencies.chunks(BATCH_SIZE) {
            let futures: Vec<_> = chunk
                .iter()
                .map(|(symbol, currency)| {
                    let symbol_clone = symbol.clone();
                    let currency_clone = currency.clone();
                    async move {
                        match self
                            .get_historical_quotes(
                                &symbol_clone,
                                start,
                                end,
                                currency_clone.clone(),
                            )
                            .await
                        {
                            Ok(quotes) => Ok(quotes),
                            Err(e) => Err((symbol_clone, currency_clone, e.to_string())),
                        }
                    }
                })
                .collect();

            let results = futures::future::join_all(futures).await;

            for result in results {
                match result {
                    Ok(quotes) => all_quotes.extend(quotes),
                    Err((symbol, currency, error)) => {
                        failed_symbols.push((symbol.clone(), currency));
                        errors_for_logging.push((symbol, error));
                    }
                }
            }

            // Add delay between chunks to respect rate limits
            if chunk.len() == BATCH_SIZE {
                tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
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
