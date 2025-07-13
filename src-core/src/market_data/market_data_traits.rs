use async_trait::async_trait;
use chrono::{NaiveDate, NaiveDateTime};
use std::collections::{HashMap, HashSet};

use crate::errors::Result;
use crate::market_data::market_data_model::{MarketDataProviderSetting, UpdateMarketDataProviderSetting};
use super::market_data_model::{Quote, QuoteSummary, LatestQuotePair, MarketDataProviderInfo};
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
    async fn add_quote(&self, quote: &Quote) -> Result<Quote>;
    async fn update_quote(&self, quote: Quote) -> Result<Quote>;
    async fn delete_quote(&self, quote_id: &str) -> Result<()>;
    async fn get_historical_quotes_from_provider(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>>;
    async fn sync_market_data(&self) -> Result<((), Vec<(String, String)>)>;
    async fn resync_market_data(&self, symbols: Option<Vec<String>>) -> Result<((), Vec<(String, String)>)>;
    fn get_latest_quotes_pair_for_symbols(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, LatestQuotePair>>;
    fn get_historical_quotes_for_symbols_in_range(
        &self,
        symbols: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>>;
    /// Fetches historical quotes for the needed symbols and date range, grouped by date.
    async fn get_daily_quotes(
        &self,
        asset_ids: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>>;
    async fn get_market_data_providers_info(&self) -> Result<Vec<MarketDataProviderInfo>>;
    async fn get_market_data_providers_settings(&self) -> Result<Vec<MarketDataProviderSetting>>;
    async fn update_market_data_provider_settings(
        &self,
        provider_id: String,
        priority: i32,
        enabled: bool,
    ) -> Result<MarketDataProviderSetting>;

}

#[async_trait]
pub trait MarketDataRepositoryTrait {
    fn get_all_historical_quotes(&self) -> Result<Vec<Quote>>;
    fn get_historical_quotes_for_symbol(&self, symbol: &str) -> Result<Vec<Quote>>;
    async fn save_quotes(&self, quotes: &[Quote]) -> Result<()>;
    async fn save_quote(&self, quote: &Quote) -> Result<Quote>;
    async fn delete_quote(&self, quote_id: &str) -> Result<()>;
    async fn delete_quotes_for_symbols(&self, symbols: &[String]) -> Result<()>;
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
    fn get_historical_quotes_for_symbols_in_range(
        &self,
        symbols: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>>;
    fn get_all_historical_quotes_for_symbols(
        &self,
        symbols: &HashSet<String>,
    ) -> Result<Vec<Quote>>;
    fn get_all_historical_quotes_for_symbols_by_source(
        &self,
        symbols: &HashSet<String>,
        source: &str,
    ) -> Result<Vec<Quote>>;
    fn get_latest_sync_dates_by_source(&self) -> Result<HashMap<String, Option<NaiveDateTime>>>;
    fn get_all_providers(&self) -> Result<Vec<MarketDataProviderSetting>>;
    fn get_provider_by_id(&self, provider_id: &str) -> Result<MarketDataProviderSetting>;
    async fn update_provider_settings(
        &self,
        provider_id: String,
        changes: UpdateMarketDataProviderSetting,
    ) -> Result<MarketDataProviderSetting>;
}