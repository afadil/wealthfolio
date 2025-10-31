use std::time::SystemTime;
use std::str::FromStr;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use rust_decimal::Decimal;

use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::{
    market_data_model::{DataSource, Quote},
    AssetProfiler, MarketDataProvider,
    providers::models::AssetProfile,
    QuoteSummary,
};

pub struct VnMarketProvider {
    client: Client,
    base_url: String,
}

impl VnMarketProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "http://localhost:8765".to_string(),
        }
    }

    async fn search_tickers(&self, query: &str) -> Result<Vec<VnMarketSearchResult>, MarketDataError> {
        let url = format!("{}/search", self.base_url);
        let params = [("query", query)];

        let response = self.client.get(&url).query(&params).send().await?;
        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError(format!(
                "VN_MARKET search failed: {}",
                response.status()
            )));
        }

        let search_results: VnMarketSearchResponse = response.json().await?;
        Ok(search_results.results)
    }

    async fn get_quote(&self, symbol: &str) -> Result<VnMarketQuote, MarketDataError> {
        let url = format!("{}/stocks/quote/{}", self.base_url, symbol);

        let response = self.client.get(&url).send().await?;
        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError(format!(
                "VN_MARKET quote failed for {}: {}",
                symbol,
                response.status()
            )));
        }

        let quote: VnMarketQuoteResponse = response.json().await?;
        quote.quote().ok_or_else(|| MarketDataError::NotFound(format!(
            "No quote data found for symbol: {}", symbol
        )))
    }

    async fn get_historical_quotes_internal(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        _fallback_currency: String,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let url = format!("{}/stocks/history/{}", self.base_url, symbol);

        // Convert SystemTime to date range
        let start_date = DateTime::<Utc>::from(start).date_naive();
        let end_date = DateTime::<Utc>::from(end).date_naive();

        let mut query_params = Vec::new();
        query_params.push(("start_date", start_date.format("%Y-%m-%d").to_string()));
        query_params.push(("end_date", end_date.format("%Y-%m-%d").to_string()));

        let response = self.client.get(&url).query(&query_params).send().await?;
        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError(format!(
                "VN_MARKET history failed for {}: {}",
                symbol,
                response.status()
            )));
        }

        let history: VnMarketHistoryResponse = response.json().await?;
        Ok(history.data.into_iter().map(|item| {
            let date = chrono::NaiveDate::parse_from_str(&item.date, "%Y-%m-%d")
                .unwrap_or_else(|_| chrono::NaiveDate::from_ymd_opt(2025, 1, 1).unwrap());
            Quote {
                id: format!("hist_{}_{}", symbol, item.date),
                symbol: symbol.to_string(),
                timestamp: date.and_time(chrono::NaiveTime::MIN).and_utc(),
                open: Decimal::from_str(&item.open.to_string()).unwrap_or_default(),
                high: Decimal::from_str(&item.high.to_string()).unwrap_or_default(),
                low: Decimal::from_str(&item.low.to_string()).unwrap_or_default(),
                close: Decimal::from_str(&item.close.to_string()).unwrap_or_default(),
                adjclose: Decimal::from_str(&item.adjclose.to_string()).unwrap_or_default(),
                volume: Decimal::from_str(&item.volume.to_string()).unwrap_or_default(),
                currency: "VND".to_string(),
                data_source: DataSource::VnMarket,
                created_at: Utc::now(),
            }
        }).collect())
    }
}

#[async_trait]
impl MarketDataProvider for VnMarketProvider {
    fn name(&self) -> &'static str {
        "VN_MARKET"
    }

    fn priority(&self) -> u8 {
        2 // Between Yahoo (1) and Alpha Vantage (3)
    }

    async fn get_latest_quote(&self, symbol: &str, fallback_currency: String) -> Result<Quote, MarketDataError> {
        let quote = self.get_quote(symbol).await?;

        Ok(Quote {
            id: format!("quote_{}", symbol),
            symbol: symbol.to_string(),
            timestamp: Utc::now(),
            open: Decimal::ZERO,
            high: Decimal::ZERO,
            low: Decimal::ZERO,
            close: Decimal::from_str(&quote.price.to_string()).unwrap_or_default(),
            adjclose: Decimal::from_str(&quote.price.to_string()).unwrap_or_default(),
            volume: Decimal::ZERO,
            currency: fallback_currency,
            data_source: DataSource::VnMarket,
            created_at: Utc::now(),
        })
    }

    async fn get_historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<Quote>, MarketDataError> {
        self.get_historical_quotes_internal(symbol, start, end, fallback_currency).await
    }

    async fn get_historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<Quote>, Vec<(String, String)>), MarketDataError> {
        let mut results = Vec::new();
        let mut failed_symbols = Vec::new();

        for (symbol, _currency) in symbols_with_currencies {
            match self.get_historical_quotes_internal(symbol, start, end, "VND".to_string()).await {
                Ok(historical_quotes) => {
                    results.extend(historical_quotes);
                }
                Err(e) => {
                    failed_symbols.push((symbol.clone(), _currency.clone()));
                    eprintln!("Failed to fetch historical data for {}: {}", symbol, e);
                }
            }
        }

        Ok((results, failed_symbols))
    }
}

#[async_trait]
impl AssetProfiler for VnMarketProvider {
    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        let search_results = self.search_tickers(query).await?;

        Ok(search_results.into_iter().map(|result| {
            let name = result.name.clone();
            QuoteSummary {
                symbol: result.symbol,
                short_name: name.clone(),
                quote_type: "Stock".to_string(),
                index: "".to_string(),
                score: 100.0,
                type_display: "Stock".to_string(),
                long_name: name,
                exchange: result.exchange.unwrap_or_default(),
            }
        }).collect())
    }

    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let search_results = self.search_tickers(symbol).await?;

        // Find exact match or first result
        let result = search_results.iter()
            .find(|result| result.symbol == symbol)
            .cloned()
            .or_else(|| search_results.first().cloned())
            .ok_or_else(|| MarketDataError::NotFound(symbol.to_string()))?;

        Ok(AssetProfile {
            id: None,
            isin: None,
            name: Some(result.name),
            asset_type: Some(result.asset_type.unwrap_or_else(|| "Stock".to_string())),
            symbol: result.symbol,
            symbol_mapping: None,
            asset_class: Some("Equity".to_string()),
            asset_sub_class: Some("Stock".to_string()),
            notes: None,
            countries: None,
            categories: None,
            classes: None,
            attributes: None,
            currency: "VND".to_string(),
            data_source: "VN_MARKET".to_string(),
            sectors: None,
            url: None,
        })
    }
}

// VN_MARKET API Response Structures
#[derive(Debug, Deserialize)]
struct VnMarketSearchResponse {
    results: Vec<VnMarketSearchResult>,
}

#[derive(Debug, Deserialize, Clone)]
struct VnMarketSearchResult {
    symbol: String,
    name: String,
    exchange: Option<String>,
    asset_type: Option<String>,
    industry: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VnMarketQuoteResponse {
    symbol: String,
    close: f64,
    date: String,
}

impl VnMarketQuoteResponse {
    fn quote(self) -> Option<VnMarketQuote> {
        Some(VnMarketQuote {
            symbol: self.symbol,
            price: self.close,
            date: self.date,
        })
    }
}

#[derive(Debug, Deserialize)]
struct VnMarketQuote {
    symbol: String,
    price: f64,
    date: String,
}

#[derive(Debug, Deserialize)]
struct VnMarketHistoryResponse {
    data: Vec<VnMarketHistoryData>,
}

#[derive(Debug, Deserialize)]
struct VnMarketHistoryData {
    date: String,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    adjclose: f64,
    volume: f64,
}

impl Default for VnMarketProvider {
    fn default() -> Self {
        Self::new()
    }
}