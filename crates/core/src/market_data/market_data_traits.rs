use async_trait::async_trait;
use chrono::{NaiveDate, NaiveDateTime};
use std::collections::{HashMap, HashSet};

use super::market_data_model::{
    LatestQuotePair, MarketDataProviderInfo, Quote, QuoteImport, QuoteSummary,
};
use super::providers::models::AssetProfile;
use super::quote_sync_state_model::{QuoteSyncState, SymbolSyncPlan};
use crate::errors::Result;
use crate::market_data::market_data_model::{
    MarketDataProviderSetting, UpdateMarketDataProviderSetting,
};

#[async_trait]
pub trait MarketDataServiceTrait: Send + Sync {
    async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>>;
    fn get_latest_quote_for_symbol(&self, symbol: &str) -> Result<Quote>;
    fn get_latest_quotes_for_symbols(&self, symbols: &[String]) -> Result<HashMap<String, Quote>>;
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
    async fn resync_market_data(
        &self,
        symbols: Option<Vec<String>>,
    ) -> Result<((), Vec<(String, String)>)>;
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

    // --- Quote Import Methods ---
    async fn import_quotes_from_csv(
        &self,
        quotes: Vec<QuoteImport>,
        overwrite: bool,
    ) -> Result<Vec<QuoteImport>>;
    async fn bulk_upsert_quotes(&self, quotes: Vec<Quote>) -> Result<usize>;

    // --- Quote Sync State Methods ---
    // These methods manage the sync state for optimized quote fetching

    /// Refresh sync state from current holdings and activities
    /// This should be called before syncing to ensure state is up to date
    async fn refresh_sync_state(&self) -> Result<()>;

    /// Get the optimized sync plan based on current state
    fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>>;

    /// Handle an activity date change (for backfill detection)
    async fn handle_activity_date_change(
        &self,
        symbol: &str,
        old_date: Option<NaiveDate>,
        new_date: NaiveDate,
    ) -> Result<()>;

    /// Handle a new activity being created
    /// Creates or updates sync state for the symbol with the activity date
    async fn handle_new_activity(&self, symbol: &str, activity_date: NaiveDate) -> Result<()>;

    /// Handle an activity being deleted
    /// Recalculates activity dates for the symbol from remaining activities
    async fn handle_activity_deleted(&self, symbol: &str) -> Result<()>;

    /// Delete sync state for a symbol (e.g., when asset is deleted)
    async fn delete_sync_state(&self, symbol: &str) -> Result<()>;

    /// Get symbols that need syncing
    fn get_symbols_needing_sync(&self) -> Result<Vec<QuoteSyncState>>;
}

#[async_trait]
pub trait MarketDataRepositoryTrait: Send + Sync {
    fn get_all_historical_quotes(&self) -> Result<Vec<Quote>>;
    fn get_historical_quotes_for_symbol(&self, symbol: &str) -> Result<Vec<Quote>>;
    async fn save_quotes(&self, quotes: &[Quote]) -> Result<()>;
    async fn save_quote(&self, quote: &Quote) -> Result<Quote>;
    async fn delete_quote(&self, quote_id: &str) -> Result<()>;
    async fn delete_quotes_for_symbols(&self, symbols: &[String]) -> Result<()>;
    fn get_quotes_by_source(&self, symbol: &str, source: &str) -> Result<Vec<Quote>>;
    fn get_latest_quote_for_symbol(&self, symbol: &str) -> Result<Quote>;
    fn get_latest_quotes_for_symbols(&self, symbols: &[String]) -> Result<HashMap<String, Quote>>;
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

    // --- Quote Import Methods ---
    async fn bulk_insert_quotes(&self, quote_records: Vec<Quote>) -> Result<usize>;
    async fn bulk_update_quotes(&self, quote_records: Vec<Quote>) -> Result<usize>;
    async fn bulk_upsert_quotes(&self, quote_records: Vec<Quote>) -> Result<usize>;
    fn quote_exists(&self, symbol_param: &str, date: &str) -> Result<bool>;
    fn get_existing_quotes_for_period(
        &self,
        symbol_param: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<Quote>>;
}
