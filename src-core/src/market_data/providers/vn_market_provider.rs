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

    async fn search_tickers(&self, query: &str) -> Result<Vec<VnMarketAssetProfile>, MarketDataError> {
        let url = format!("{}/search", self.base_url);
        let params = [("query", query)];

        let response = self.client.get(&url).query(&params).send().await?;
        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError(format!(
                "VN_MARKET search failed: {}",
                response.status()
            )));
        }

        let search_response: VnMarketSearchResponse = response.json().await?;
        Ok(search_response.results)
    }

    async fn get_quote(&self, symbol: &str) -> Result<VnMarketQuote, MarketDataError> {
        let url = format!("{}/quote/{}", self.base_url, symbol);

        let response = self.client.get(&url).send().await?;
        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError(format!(
                "VN_MARKET quote failed for {}: {}",
                symbol,
                response.status()
            )));
        }

        let quote: VnMarketQuote = response.json().await?;
        Ok(quote)
    }

    async fn get_historical_quotes_internal(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        _fallback_currency: String,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let url = format!("{}/history/{}", self.base_url, symbol);

        // Convert SystemTime to date range
        let start_date = DateTime::<Utc>::from(start).date_naive();
        let end_date = DateTime::<Utc>::from(end).date_naive();

        let params = [
            ("start_date", start_date.format("%Y-%m-%d").to_string()),
            ("end_date", end_date.format("%Y-%m-%d").to_string()),
        ];

        let response = self.client.get(&url).query(&params).send().await?;
        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError(format!(
                "VN_MARKET history failed for {}: {}",
                symbol,
                response.status()
            )));
        }

        let history_response: VnMarketHistoryResponse = response.json().await?;

        Ok(history_response.history.into_iter().map(|entry| {
            let date = chrono::NaiveDate::parse_from_str(&entry.date, "%Y-%m-%d")
                .unwrap_or_else(|_| Utc::now().date_naive());

            Quote {
                id: format!("hist_{}_{}", symbol, entry.date),
                symbol: symbol.to_string(),
                timestamp: date.and_time(chrono::NaiveTime::MIN).and_utc(),
                open: Decimal::from_str(&entry.open.to_string()).unwrap_or_default(),
                high: Decimal::from_str(&entry.high.to_string()).unwrap_or_default(),
                low: Decimal::from_str(&entry.low.to_string()).unwrap_or_default(),
                close: Decimal::from_str(&entry.close.to_string()).unwrap_or_default(),
                adjclose: Decimal::from_str(&entry.adjclose.to_string()).unwrap_or_default(),
                volume: Decimal::from_str(&entry.volume.to_string()).unwrap_or_default(),
                currency: history_response.currency.clone(),
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

    async fn get_latest_quote(&self, symbol: &str, _fallback_currency: String) -> Result<Quote, MarketDataError> {
        let quote = self.get_quote(symbol).await?;

        Ok(Quote {
            id: format!("quote_{}", symbol),
            symbol: symbol.to_string(),
            timestamp: Utc::now(),
            open: Decimal::from_str(&quote.open.to_string()).unwrap_or_default(),
            high: Decimal::from_str(&quote.high.to_string()).unwrap_or_default(),
            low: Decimal::from_str(&quote.low.to_string()).unwrap_or_default(),
            close: Decimal::from_str(&quote.close.to_string()).unwrap_or_default(),
            adjclose: Decimal::from_str(&quote.adjclose.to_string()).unwrap_or_default(),
            volume: Decimal::from_str(&quote.volume.to_string()).unwrap_or_default(),
            currency: quote.currency,
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

        Ok(search_results.into_iter().map(|profile| {
            QuoteSummary {
                symbol: profile.symbol,
                short_name: profile.name.clone(),
                quote_type: profile.asset_type.clone(),
                index: "".to_string(),
                score: 100.0,
                type_display: profile.asset_type.clone(),
                long_name: profile.name,
                exchange: profile.exchange,
            }
        }).collect())
    }

    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let search_results = self.search_tickers(symbol).await?;

        // Find exact match or first result
        let profile = search_results.iter()
            .find(|p| p.symbol == symbol)
            .cloned()
            .or_else(|| search_results.first().cloned())
            .ok_or_else(|| MarketDataError::NotFound(symbol.to_string()))?;

        Ok(AssetProfile {
            id: Some(profile.symbol.clone()),
            isin: profile.isin,
            name: Some(profile.name),
            asset_type: Some(profile.asset_type.clone()),
            symbol: profile.symbol,
            symbol_mapping: None,
            asset_class: Some(profile.asset_class),
            asset_sub_class: Some(profile.asset_sub_class),
            notes: None,
            countries: profile.countries.map(|c| c.join(", ")),
            categories: profile.categories.map(|c| c.join(", ")),
            classes: None,
            attributes: None,
            currency: profile.currency,
            data_source: profile.data_source,
            sectors: None,
            url: None,
        })
    }
}

// VN_MARKET API Response Structures - Universal Interface
#[derive(Debug, Deserialize)]
struct VnMarketSearchResponse {
    results: Vec<VnMarketAssetProfile>,
    total: usize,
}

#[derive(Debug, Deserialize, Clone)]
struct VnMarketAssetProfile {
    symbol: String,
    name: String,
    asset_type: String,
    asset_class: String,
    asset_sub_class: String,
    #[serde(default)]
    isin: Option<String>,
    #[serde(default)]
    countries: Option<Vec<String>>,
    #[serde(default)]
    categories: Option<Vec<String>>,
    currency: String,
    exchange: String,
    data_source: String,
}

#[derive(Debug, Deserialize)]
struct VnMarketQuote {
    symbol: String,
    asset_type: String,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    adjclose: f64,
    volume: f64,
    currency: String,
    data_source: String,
}

#[derive(Debug, Deserialize)]
struct VnMarketHistoryResponse {
    symbol: String,
    history: Vec<VnMarketHistoryEntry>,
    currency: String,
    data_source: String,
}

#[derive(Debug, Deserialize)]
struct VnMarketHistoryEntry {
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
