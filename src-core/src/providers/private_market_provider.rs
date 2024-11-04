use crate::models::{NewAsset, Quote as ModelQuote, QuoteSummary};
use crate::providers::market_data_provider::{MarketDataError, MarketDataProvider};
use std::time::SystemTime;

pub struct PrivateMarketProvider;

impl PrivateMarketProvider {
    pub fn new() -> Result<Self, MarketDataError> {
        Ok(PrivateMarketProvider)
    }
}

#[async_trait::async_trait]
impl MarketDataProvider for PrivateMarketProvider {
    async fn get_latest_quote(&self, symbol: &str) -> Result<ModelQuote, MarketDataError> {

        Err(MarketDataError::Unknown(format!("Latest quote not supported for symbol: {}", symbol)))
    }

    async fn get_symbol_profile(&self, symbol: &str) -> Result<NewAsset, MarketDataError> {

        Ok(NewAsset {
            id: symbol.to_string(),
            isin: None,
            name: Some("Private Asset".to_string()),
            asset_type: Some("Equity".to_string()),
            symbol: symbol.to_string(),
            data_source: "Private".to_string(),
            ..Default::default()
        })
    }

    async fn get_stock_history(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime)
        -> Result<Vec<ModelQuote>, MarketDataError> {

        Err(MarketDataError::Unknown(format!("Stock history not supported for symbol: {}, {:?}-{:?}", symbol, start, end)))
    }

    async fn search_ticker(&self, symbol: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {

        Err(MarketDataError::Unknown(format!("Search ticker not supported for symbol: {}", symbol)))
    }

	async fn get_exchange_rate(&self, _from_currency: &str, _to_currency: &str) -> Result<f64, MarketDataError> {

        Err(MarketDataError::Unknown("Exchange rate not supported".to_string()))
    }
}