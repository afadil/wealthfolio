use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::market_data_model::Quote as ModelQuote;
use crate::market_data::providers::market_data_provider::MarketDataProvider;

use std::sync::Arc;
use std::time::SystemTime;


pub struct ProviderRegistry {
    chain: Vec<Arc<dyn MarketDataProvider>>,
}

impl ProviderRegistry {
    pub fn new(mut providers: Vec<Arc<dyn MarketDataProvider>>) -> Self {
        providers.sort_by_key(|p| p.priority());
        Self { chain: providers }
    }

    pub async fn latest_quote(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<ModelQuote, MarketDataError> {
        for p in &self.chain {
            if let Ok(q) = p.get_latest_quote(symbol, fallback_currency.clone()).await {
                return Ok(q);
            }
        }
        Err(MarketDataError::NoData)
    }

    pub async fn historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        for p in &self.chain {
            if let Ok(q) = p
                .get_historical_quotes(symbol, start, end, fallback_currency.clone())
                .await
            {
                return Ok(q);
            }
        }
        Err(MarketDataError::NoData)
    }

    pub async fn historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        for p in &self.chain {
            if let Ok(q) = p
                .get_historical_quotes_bulk(symbols_with_currencies, start, end)
                .await
            {
                return Ok(q);
            }
        }
        Err(MarketDataError::NoData)
    }
}
