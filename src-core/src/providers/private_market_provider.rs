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
		// Since private market data is updated manually,
		// use the first quote in the quote history as the latest quote
		//let asset_service = AssetService::new();
		//let asset_data = asset_service.get_asset_data(symbol);
		//let previous_quote = asset_data.quote_history.first().unwrap();

		let latest_quote = ModelQuote {
			id: "1".to_string(),
			created_at: chrono::Utc::now().naive_utc(),
			data_source: "PRIVATE".to_string(),
			date: chrono::Utc::now().naive_utc(),
			symbol: symbol.to_string(),
			open: 0.0,
			high: 0.0,
			low: 0.0,
			volume: 0.0,
			close: 0.0,
			adjclose: 0.0,
		};
		Ok(latest_quote)
    }

    async fn get_symbol_profile(&self, symbol: &str) -> Result<NewAsset, MarketDataError> {

        Ok(NewAsset {
            id: symbol.to_string(),
            isin: None,
            name: Some("Private Asset".to_string()),
            asset_type: Some("PrivateType".to_string()),
            symbol: symbol.to_string(),
            data_source: "PRIVATE".to_string(),
            ..Default::default()
        })
    }

    async fn get_stock_history(&self, _symbol: &str, _start: SystemTime, _end: SystemTime) -> Result<Vec<ModelQuote>, MarketDataError> {
        // Implement logic to fetch historic quotes between start and end date
        Ok(vec![])
    }

    async fn search_ticker(&self, _query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        // Implement logic to search for tickers matching the query
        Ok(vec![])
    }

	async fn get_exchange_rate(&self, _from_currency: &str, _to_currency: &str) -> Result<f64, MarketDataError> {
        Err(MarketDataError::Unknown("Exchange rate not supported".to_string()))
    }
}