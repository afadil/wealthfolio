use crate::assets::assets_model::NewAsset;
use crate::market_data::{Quote as ModelQuote, QuoteSummary};
use async_trait::async_trait;
use std::time::SystemTime;

use super::MarketDataError;


#[async_trait]
pub trait MarketDataProvider: Send + Sync {
    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError>;
    async fn get_latest_quote(&self, symbol: &str) -> Result<ModelQuote, MarketDataError>;
    async fn get_stock_history(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
    ) -> Result<Vec<ModelQuote>, MarketDataError>;
    async fn get_exchange_rate(&self, from: &str, to: &str) -> Result<f64, MarketDataError>;
    
    /// Fetch historical quotes for multiple symbols in parallel
    async fn get_stock_history_bulk(
        &self,
        symbols: &[String],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<Vec<ModelQuote>, MarketDataError>;
}

#[async_trait]
pub trait AssetProfiler: Send + Sync {
    async fn get_asset_profile(&self, symbol: &str) -> Result<NewAsset, MarketDataError>;
}
