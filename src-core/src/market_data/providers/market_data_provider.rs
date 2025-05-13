use crate::market_data::{MarketDataError, Quote as ModelQuote, QuoteSummary};
use async_trait::async_trait;
use std::time::SystemTime;

use super::models::AssetProfile;



#[async_trait]
pub trait MarketDataProvider: Send + Sync {
    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError>;
    async fn get_latest_quote(&self, symbol: &str, fallback_currency: String) -> Result<ModelQuote, MarketDataError>;
    async fn get_historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError>;
    
    /// Fetch historical quotes for multiple symbols in parallel
    async fn get_historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError>;
}

#[async_trait]
pub trait AssetProfiler: Send + Sync {
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError>;
}
