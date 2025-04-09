use async_trait::async_trait;
use chrono::NaiveDate;
use std::collections::HashMap;

use crate::errors::Result;
use super::market_data_model::{Quote, QuoteRequest, QuoteSummary, LatestQuotePair};
use super::providers::models::AssetProfile;

#[async_trait]
pub trait MarketDataServiceTrait: Send + Sync {
    async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>>;
    fn get_latest_quote_for_symbol(&self, symbol: &str) -> Result<Quote>;
    fn get_latest_quotes_for_symbols(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, Quote>>;
    fn get_all_historical_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>>;
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile>;
    fn get_historical_quotes_for_symbol(&self, symbol: &str) -> Result<Vec<Quote>>;
    fn add_quote(&self, quote: &Quote) -> Result<Quote>;
    fn update_quote(&self, quote: Quote) -> Result<Quote>;
    fn delete_quote(&self, quote_id: &str) -> Result<()>;
    async fn get_historical_quotes_from_provider(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>>;
    async fn sync_quotes(&self, quote_requests: &[QuoteRequest], refetch_all: bool) -> Result<()>;
    fn get_latest_quotes_pair_for_symbols(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, LatestQuotePair>>;
}

pub trait MarketDataRepositoryTrait {
    fn get_all_historical_quotes(&self) -> Result<Vec<Quote>>;
    fn get_historical_quotes_for_symbol(&self, symbol: &str) -> Result<Vec<Quote>>;
    fn save_quotes(&self, quotes: &[Quote]) -> Result<()>;
    fn save_quote(&self, quote: &Quote) -> Result<Quote>;
    fn delete_quote(&self, quote_id: &str) -> Result<()>;
    fn delete_quotes_for_symbols(&self, symbols: &[String]) -> Result<()>;
    fn get_quotes_by_source(&self, symbol: &str, source: &str) -> Result<Vec<Quote>>;
    fn get_latest_quote_for_symbol(&self, symbol: &str) -> Result<Quote>;
    fn get_latest_quotes_for_symbols(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, Quote>>;
    fn get_latest_quotes_pair_for_symbols(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, LatestQuotePair>>;
} 