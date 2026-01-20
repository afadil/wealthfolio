//! Unified Quote Service.
//!
//! This module provides a comprehensive service for all quote-related operations:
//! - Quote CRUD (via QuoteStore)
//! - Provider operations (search, get_profile via MarketDataClient)
//! - Sync operations (via QuoteSyncService)
//! - Provider settings management
//! - Quote import/export

use async_trait::async_trait;
use chrono::{Duration, NaiveDate, TimeZone, Utc};
use log::{debug, info};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::utils::time_utils;

use super::client::{MarketDataClient, ProviderConfig};
use super::import::{ImportValidationStatus, QuoteConverter, QuoteImport, QuoteValidator};
use super::model::{DataSource, LatestQuotePair, Quote, QuoteSummary};
use super::store::{ProviderSettingsStore, QuoteStore};
use super::sync::{QuoteSyncService, QuoteSyncServiceTrait, SyncResult};
use super::sync_state::{QuoteSyncState, SyncStateStore, SymbolSyncPlan};
use super::types::{AssetId, Day};
use crate::assets::{needs_market_quotes, Asset, AssetKind, AssetRepositoryTrait, ProviderProfile};
use crate::errors::Result;
use crate::secrets::SecretStore;

use wealthfolio_market_data::{exchanges_for_currency, mic_to_exchange_name};

/// Provider information combining static info with settings.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub url: Option<String>,
    pub enabled: bool,
    pub priority: i32,
    pub logo_filename: Option<String>,
    pub capabilities: Option<super::provider_settings::ProviderCapabilities>,
    pub requires_api_key: bool,
    pub has_api_key: bool,
    /// Number of assets synced by this provider
    pub asset_count: i64,
    /// Number of assets with sync errors
    pub error_count: i64,
    /// Most recent sync timestamp
    pub last_synced_at: Option<String>,
    /// Most recent error message (if any)
    pub last_sync_error: Option<String>,
    /// All unique error messages for this provider
    pub unique_errors: Vec<String>,
}

/// Unified trait for all quote operations.
#[async_trait]
pub trait QuoteServiceTrait: Send + Sync {
    // =========================================================================
    // Quote CRUD Operations
    // =========================================================================

    /// Get the latest quote for a symbol.
    fn get_latest_quote(&self, symbol: &str) -> Result<Quote>;

    /// Get the latest quotes for multiple symbols.
    fn get_latest_quotes(&self, symbols: &[String]) -> Result<HashMap<String, Quote>>;

    /// Get the latest quote pairs (current + previous) for multiple symbols.
    fn get_latest_quotes_pair(&self, symbols: &[String]) -> Result<HashMap<String, LatestQuotePair>>;

    /// Get all historical quotes for a symbol.
    fn get_historical_quotes(&self, symbol: &str) -> Result<Vec<Quote>>;

    /// Get all historical quotes grouped by symbol.
    fn get_all_historical_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>>;

    /// Get quotes for symbols within a date range.
    fn get_quotes_in_range(
        &self,
        symbols: &HashSet<String>,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<Quote>>;

    /// Get quotes for symbols within a date range, with gap filling.
    ///
    /// This method fills in missing quotes for weekends and holidays by carrying
    /// forward the last known quote. This is essential for portfolio valuation
    /// which needs a quote for every day in the range.
    ///
    /// # Algorithm
    /// 1. Fetches all quotes in range (with lookback for initial values)
    /// 2. For each day in the range, outputs the last known quote for each symbol
    /// 3. Symbols with no quotes before the start date will have no output until their first quote
    ///
    /// # Arguments
    /// * `symbols` - Set of symbols to fetch quotes for
    /// * `start` - Start date of the range
    /// * `end` - End date of the range
    /// * `first_appearance` - Optional map of symbol -> first date it appeared in portfolio.
    ///   Debug messages for missing quotes are only logged for dates on or after the symbol's
    ///   first appearance, reducing noise from assets added later.
    fn get_quotes_in_range_filled(
        &self,
        symbols: &HashSet<String>,
        start: NaiveDate,
        end: NaiveDate,
        first_appearance: &HashMap<String, NaiveDate>,
    ) -> Result<Vec<Quote>>;

    /// Get daily quotes grouped by date, then by symbol.
    async fn get_daily_quotes(
        &self,
        asset_ids: &HashSet<String>,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>>;

    /// Add a new quote.
    async fn add_quote(&self, quote: &Quote) -> Result<Quote>;

    /// Update an existing quote.
    async fn update_quote(&self, quote: Quote) -> Result<Quote>;

    /// Delete a quote by ID.
    async fn delete_quote(&self, quote_id: &str) -> Result<()>;

    /// Bulk upsert quotes.
    async fn bulk_upsert_quotes(&self, quotes: Vec<Quote>) -> Result<usize>;

    // =========================================================================
    // Provider Operations (via MarketDataClient)
    // =========================================================================

    /// Search for symbols.
    ///
    /// Returns search results merged with existing assets. Existing assets are
    /// returned first, followed by provider results. Results are deduplicated
    /// by symbol+exchange and sorted by relevance to account_currency.
    async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>>;

    /// Search for symbols with account currency for relevance sorting.
    ///
    /// # Arguments
    /// * `query` - Search query string
    /// * `account_currency` - Optional currency to sort results by exchange relevance
    ///
    /// # Returns
    /// Search results merged with existing assets, sorted by:
    /// 1. Existing assets first
    /// 2. Then by exchange relevance to account_currency (e.g., CAD account prefers TSX)
    /// 3. Then by provider relevance score
    async fn search_symbol_with_currency(
        &self,
        query: &str,
        account_currency: Option<&str>,
    ) -> Result<Vec<QuoteSummary>>;

    /// Get asset profile from provider.
    ///
    /// Uses the asset's exchange_mic to build provider-specific symbols
    /// (e.g., "VFV.TO" for Yahoo when exchange_mic is XTSE).
    async fn get_asset_profile(&self, asset: &Asset) -> Result<ProviderProfile>;

    /// Fetch historical quotes from provider.
    async fn fetch_quotes_from_provider(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<Quote>>;

    // =========================================================================
    // Sync Operations (via QuoteSyncService)
    // =========================================================================

    /// Perform optimized sync.
    async fn sync(&self) -> Result<SyncResult>;

    /// Force resync for specific symbols (or all if None).
    async fn resync(&self, symbols: Option<Vec<String>>) -> Result<SyncResult>;

    /// Refresh sync state from holdings/activities.
    async fn refresh_sync_state(&self) -> Result<()>;

    /// Get the current sync plan.
    fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>>;

    /// Handle new activity created.
    async fn handle_activity_created(&self, symbol: &str, activity_date: NaiveDate) -> Result<()>;

    /// Handle activity deleted.
    async fn handle_activity_deleted(&self, symbol: &str) -> Result<()>;

    /// Delete sync state for a symbol.
    async fn delete_sync_state(&self, symbol: &str) -> Result<()>;

    /// Get symbols needing sync.
    fn get_symbols_needing_sync(&self) -> Result<Vec<QuoteSyncState>>;

    /// Get sync state for a specific symbol.
    fn get_sync_state(&self, symbol: &str) -> Result<Option<QuoteSyncState>>;

    /// Mark asset profile as enriched.
    async fn mark_profile_enriched(&self, symbol: &str) -> Result<()>;

    /// Get assets that need profile enrichment.
    fn get_assets_needing_profile_enrichment(&self) -> Result<Vec<QuoteSyncState>>;

    // =========================================================================
    // Provider Settings
    // =========================================================================

    /// Get all provider info.
    async fn get_providers_info(&self) -> Result<Vec<ProviderInfo>>;

    /// Update provider settings.
    async fn update_provider_settings(
        &self,
        provider_id: &str,
        priority: i32,
        enabled: bool,
    ) -> Result<()>;

    // =========================================================================
    // Quote Import
    // =========================================================================

    /// Import quotes from CSV data.
    async fn import_quotes(&self, quotes: Vec<QuoteImport>, overwrite: bool)
        -> Result<Vec<QuoteImport>>;
}

/// Unified quote service implementation.
pub struct QuoteService<Q, S, PS, A>
where
    Q: QuoteStore,
    S: SyncStateStore,
    PS: ProviderSettingsStore,
    A: AssetRepositoryTrait,
{
    /// Quote storage.
    quote_store: Arc<Q>,
    /// Sync state storage.
    sync_state_store: Arc<S>,
    /// Provider settings storage.
    provider_settings_store: Arc<PS>,
    /// Asset repository.
    asset_repo: Arc<A>,
    /// Market data client for provider operations.
    client: Arc<RwLock<MarketDataClient>>,
    /// Secret store for API keys.
    secret_store: Arc<dyn SecretStore>,
    /// Sync service.
    sync_service: Arc<RwLock<Option<Arc<QuoteSyncService<Q, S, A>>>>>,
}

impl<Q, S, PS, A> QuoteService<Q, S, PS, A>
where
    Q: QuoteStore + 'static,
    S: SyncStateStore + 'static,
    PS: ProviderSettingsStore + 'static,
    A: AssetRepositoryTrait + 'static,
{
    /// Create a new quote service.
    pub async fn new(
        quote_store: Arc<Q>,
        sync_state_store: Arc<S>,
        provider_settings_store: Arc<PS>,
        asset_repo: Arc<A>,
        secret_store: Arc<dyn SecretStore>,
    ) -> Result<Self> {
        // Get enabled providers with their priorities
        let providers = provider_settings_store.get_all_providers()?;
        let enabled: Vec<ProviderConfig> = providers
            .iter()
            .filter(|p| p.enabled)
            .map(|p| ProviderConfig {
                id: p.id.clone(),
                priority: p.priority,
            })
            .collect();

        // Create market data client with provider priorities
        let client = MarketDataClient::new(secret_store.clone(), enabled.clone()).await?;
        let client_arc = Arc::new(RwLock::new(client));

        // Create sync service with the client
        let sync_service = QuoteSyncService::new(
            client_arc.clone(),
            quote_store.clone(),
            sync_state_store.clone(),
            asset_repo.clone(),
        );

        Ok(Self {
            quote_store,
            sync_state_store,
            provider_settings_store,
            asset_repo,
            client: client_arc,
            secret_store,
            sync_service: Arc::new(RwLock::new(Some(Arc::new(sync_service)))),
        })
    }

    /// Refresh the market data client (e.g., after provider settings change).
    async fn refresh_client(&self) -> Result<()> {
        let providers = self.provider_settings_store.get_all_providers()?;
        let enabled: Vec<ProviderConfig> = providers
            .iter()
            .filter(|p| p.enabled)
            .map(|p| ProviderConfig {
                id: p.id.clone(),
                priority: p.priority,
            })
            .collect();

        let new_client = MarketDataClient::new(self.secret_store.clone(), enabled.clone()).await?;
        *self.client.write().await = new_client;

        // Refresh sync service with updated client
        let new_sync = QuoteSyncService::new(
            self.client.clone(),
            self.quote_store.clone(),
            self.sync_state_store.clone(),
            self.asset_repo.clone(),
        );
        *self.sync_service.write().await = Some(Arc::new(new_sync));

        Ok(())
    }

    /// Get the sync service.
    async fn get_sync_service(&self) -> Result<Arc<QuoteSyncService<Q, S, A>>> {
        let guard = self.sync_service.read().await;
        guard
            .as_ref()
            .cloned()
            .ok_or_else(|| crate::Error::Unexpected("Sync service not initialized".to_string()))
    }

    /// Convert QuoteImport to Quote.
    fn convert_import_to_quote(&self, import: &QuoteImport) -> Result<Quote> {
        let timestamp = QuoteConverter::date_to_timestamp(&import.date)?;
        let id = QuoteConverter::generate_id(&import.symbol, &import.date);

        Ok(Quote {
            id,
            created_at: Utc::now(),
            data_source: DataSource::Manual,
            timestamp,
            asset_id: import.symbol.clone(),
            open: import.open_or_close(),
            high: import.high_or_close(),
            low: import.low_or_close(),
            close: import.close,
            adjclose: import.close,
            volume: import.volume_or_zero(),
            currency: import.currency.clone(),
            notes: None,
        })
    }

    /// Convert an existing Asset to a QuoteSummary for search results.
    ///
    /// Marks the result as existing and includes the asset ID.
    fn asset_to_quote_summary(asset: &Asset) -> QuoteSummary {
        let exchange_name = asset
            .exchange_mic
            .as_ref()
            .and_then(|mic| mic_to_exchange_name(mic))
            .map(String::from);

        let quote_type = match asset.kind {
            AssetKind::Security => "EQUITY",
            AssetKind::Crypto => "CRYPTOCURRENCY",
            AssetKind::Option => "OPTION",
            AssetKind::Commodity => "COMMODITY",
            _ => "OTHER",
        };

        QuoteSummary {
            symbol: asset.symbol.clone(),
            short_name: asset.name.clone().unwrap_or_else(|| asset.symbol.clone()),
            long_name: asset.name.clone().unwrap_or_else(|| asset.symbol.clone()),
            exchange: exchange_name.clone().unwrap_or_default(),
            exchange_mic: asset.exchange_mic.clone(),
            exchange_name,
            quote_type: quote_type.to_string(),
            type_display: quote_type.to_string(),
            currency: Some(asset.currency.clone()),
            data_source: asset.preferred_provider.clone().or_else(|| Some("MANUAL".to_string())),
            is_existing: true,
            existing_asset_id: Some(asset.id.clone()),
            index: String::new(),
            score: 100.0, // High score for existing assets
        }
    }
}

#[async_trait]
impl<Q, S, PS, A> QuoteServiceTrait for QuoteService<Q, S, PS, A>
where
    Q: QuoteStore + 'static,
    S: SyncStateStore + 'static,
    PS: ProviderSettingsStore + 'static,
    A: AssetRepositoryTrait + 'static,
{
    // =========================================================================
    // Quote CRUD
    // =========================================================================

    fn get_latest_quote(&self, symbol: &str) -> Result<Quote> {
        self.quote_store.get_latest_quote(symbol)
    }

    fn get_latest_quotes(&self, symbols: &[String]) -> Result<HashMap<String, Quote>> {
        self.quote_store.get_latest_quotes(symbols)
    }

    fn get_latest_quotes_pair(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, LatestQuotePair>> {
        self.quote_store.get_latest_quotes_pair(symbols)
    }

    fn get_historical_quotes(&self, symbol: &str) -> Result<Vec<Quote>> {
        self.quote_store.get_historical_quotes(symbol)
    }

    fn get_all_historical_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>> {
        let quotes = self.quote_store.get_all_historical_quotes()?;

        let mut grouped: HashMap<String, Vec<(NaiveDate, Quote)>> = HashMap::new();
        for quote in quotes {
            let date = quote.timestamp.date_naive();
            grouped
                .entry(quote.asset_id.clone())
                .or_default()
                .push((date, quote));
        }

        // Sort by date
        for quotes in grouped.values_mut() {
            quotes.sort_by_key(|(date, _)| *date);
        }

        Ok(grouped)
    }

    fn get_quotes_in_range(
        &self,
        symbols: &HashSet<String>,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<Quote>> {
        let mut all_quotes = Vec::new();
        for symbol in symbols {
            let quotes = self.quote_store.get_quotes_in_range(symbol, start, end)?;
            all_quotes.extend(quotes);
        }
        Ok(all_quotes)
    }

    fn get_quotes_in_range_filled(
        &self,
        symbols: &HashSet<String>,
        start: NaiveDate,
        end: NaiveDate,
        first_appearance: &HashMap<String, NaiveDate>,
    ) -> Result<Vec<Quote>> {
        if symbols.is_empty() {
            return Ok(Vec::new());
        }

        // Lookback period to find initial quotes before start_date
        const QUOTE_LOOKBACK_DAYS: i64 = 30;

        // Fetch quotes with lookback period
        let lookback_start = start - Duration::days(QUOTE_LOOKBACK_DAYS);
        let mut all_quotes = Vec::new();
        for symbol in symbols {
            let quotes = self.quote_store.get_quotes_in_range(symbol, lookback_start, end)?;
            all_quotes.extend(quotes);
        }

        // Fill missing quotes
        Ok(fill_missing_quotes(
            &all_quotes,
            symbols,
            start,
            end,
            first_appearance,
        ))
    }

    async fn get_daily_quotes(
        &self,
        asset_ids: &HashSet<String>,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>> {
        let quotes = self.get_quotes_in_range(asset_ids, start, end)?;

        let mut daily: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();
        for quote in quotes {
            let date = quote.timestamp.date_naive();
            daily
                .entry(date)
                .or_default()
                .insert(quote.asset_id.clone(), quote);
        }

        Ok(daily)
    }

    async fn add_quote(&self, quote: &Quote) -> Result<Quote> {
        self.quote_store.save_quote(quote).await
    }

    async fn update_quote(&self, quote: Quote) -> Result<Quote> {
        self.quote_store.save_quote(&quote).await
    }

    async fn delete_quote(&self, quote_id: &str) -> Result<()> {
        self.quote_store.delete_quote(quote_id).await
    }

    async fn bulk_upsert_quotes(&self, quotes: Vec<Quote>) -> Result<usize> {
        self.quote_store.upsert_quotes(&quotes).await
    }

    // =========================================================================
    // Provider Operations
    // =========================================================================

    async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>> {
        self.search_symbol_with_currency(query, None).await
    }

    async fn search_symbol_with_currency(
        &self,
        query: &str,
        account_currency: Option<&str>,
    ) -> Result<Vec<QuoteSummary>> {
        // 1. Search existing assets in user's database
        let existing_assets = self.asset_repo.search_by_symbol(query).unwrap_or_default();

        // 2. Search provider for external results
        let provider_results = self.client.read().await.search(query).await.unwrap_or_default();

        // 3. Convert existing assets to QuoteSummary with is_existing flag
        let existing_summaries: Vec<QuoteSummary> = existing_assets
            .iter()
            .filter(|a| a.kind != AssetKind::Cash && a.kind != AssetKind::FxRate)
            .map(|asset| Self::asset_to_quote_summary(asset))
            .collect();

        // 4. Build a set of existing (symbol, exchange_mic) pairs for deduplication
        let existing_keys: HashSet<(String, Option<String>)> = existing_summaries
            .iter()
            .map(|s| (s.symbol.clone(), s.exchange_mic.clone()))
            .collect();

        // 5. Filter provider results to exclude duplicates
        let new_provider_results: Vec<QuoteSummary> = provider_results
            .into_iter()
            .filter(|r| {
                // Check if this symbol+exchange combo already exists
                !existing_keys.contains(&(r.symbol.clone(), r.exchange_mic.clone()))
            })
            .collect();

        // 6. Merge existing assets first, then provider results
        let mut merged = Vec::with_capacity(existing_summaries.len() + new_provider_results.len());
        merged.extend(existing_summaries);
        merged.extend(new_provider_results);

        // 7. Sort by currency relevance if account_currency is provided
        if let Some(currency) = account_currency {
            let preferred_exchanges = exchanges_for_currency(currency);

            merged.sort_by(|a, b| {
                // Existing assets always come first
                match (a.is_existing, b.is_existing) {
                    (true, false) => return std::cmp::Ordering::Less,
                    (false, true) => return std::cmp::Ordering::Greater,
                    _ => {}
                }

                // Then sort by exchange relevance
                let a_rank = a
                    .exchange_mic
                    .as_ref()
                    .and_then(|mic| preferred_exchanges.iter().position(|e| *e == mic.as_str()))
                    .unwrap_or(usize::MAX);
                let b_rank = b
                    .exchange_mic
                    .as_ref()
                    .and_then(|mic| preferred_exchanges.iter().position(|e| *e == mic.as_str()))
                    .unwrap_or(usize::MAX);

                match a_rank.cmp(&b_rank) {
                    std::cmp::Ordering::Equal => {
                        // If same exchange rank, sort by provider score (descending)
                        b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal)
                    }
                    other => other,
                }
            });
        }

        Ok(merged)
    }

    async fn get_asset_profile(&self, asset: &Asset) -> Result<ProviderProfile> {
        self.client.read().await.get_profile(asset).await
    }

    async fn fetch_quotes_from_provider(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<Quote>> {
        let asset = self.asset_repo.get_by_id(symbol)?;
        let start_dt = Utc.from_utc_datetime(&start.and_hms_opt(0, 0, 0).unwrap());
        let end_dt = Utc.from_utc_datetime(&end.and_hms_opt(23, 59, 59).unwrap());

        self.client
            .read()
            .await
            .fetch_historical_quotes(&asset, start_dt, end_dt)
            .await
    }

    // =========================================================================
    // Sync Operations
    // =========================================================================

    async fn sync(&self) -> Result<SyncResult> {
        let sync_service = self.get_sync_service().await?;
        sync_service.sync().await
    }

    async fn resync(&self, symbols: Option<Vec<String>>) -> Result<SyncResult> {
        let sync_service = self.get_sync_service().await?;
        sync_service.resync(symbols).await
    }

    async fn refresh_sync_state(&self) -> Result<()> {
        let sync_service = self.get_sync_service().await?;
        sync_service.refresh_sync_state().await
    }

    fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>> {
        // Blocking read since this is sync
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            let sync_service = self.get_sync_service().await?;
            sync_service.get_sync_plan()
        })
    }

    async fn handle_activity_created(&self, symbol: &str, activity_date: NaiveDate) -> Result<()> {
        let sync_service = self.get_sync_service().await?;
        let asset_id = AssetId::new(symbol);
        let day = Day::new(activity_date);
        sync_service
            .handle_activity_created(&asset_id, day)
            .await
    }

    async fn handle_activity_deleted(&self, symbol: &str) -> Result<()> {
        let sync_service = self.get_sync_service().await?;
        let asset_id = AssetId::new(symbol);
        sync_service.handle_activity_deleted(&asset_id).await
    }

    async fn delete_sync_state(&self, symbol: &str) -> Result<()> {
        self.sync_state_store.delete(symbol).await
    }

    fn get_symbols_needing_sync(&self) -> Result<Vec<QuoteSyncState>> {
        self.sync_state_store
            .get_assets_needing_sync(super::constants::CLOSED_POSITION_GRACE_PERIOD_DAYS)
    }

    fn get_sync_state(&self, asset_id: &str) -> Result<Option<QuoteSyncState>> {
        self.sync_state_store.get_by_asset_id(asset_id)
    }

    async fn mark_profile_enriched(&self, symbol: &str) -> Result<()> {
        self.sync_state_store.mark_profile_enriched(symbol).await
    }

    fn get_assets_needing_profile_enrichment(&self) -> Result<Vec<QuoteSyncState>> {
        self.sync_state_store.get_assets_needing_profile_enrichment()
    }

    // =========================================================================
    // Provider Settings
    // =========================================================================

    async fn get_providers_info(&self) -> Result<Vec<ProviderInfo>> {
        use super::constants::*;

        let settings = self.provider_settings_store.get_all_providers()?;

        // Get aggregated sync stats from quote_sync_state table
        let sync_stats = self.sync_state_store.get_provider_sync_stats()?;
        let stats_map: HashMap<String, super::sync_state::ProviderSyncStats> = sync_stats
            .into_iter()
            .map(|s| (s.provider_id.clone(), s))
            .collect();

        let mut infos = Vec::new();
        for setting in settings {
            // Check if provider requires an API key
            let requires_key = matches!(
                setting.id.as_str(),
                DATA_SOURCE_ALPHA_VANTAGE | DATA_SOURCE_MARKET_DATA_APP | DATA_SOURCE_METAL_PRICE_API | DATA_SOURCE_FINNHUB
            );
            // Check if API key is set (this may trigger keychain prompt on macOS)
            let has_key = if requires_key {
                self.secret_store
                    .get_secret(&setting.id)
                    .ok()
                    .flatten()
                    .map(|k| !k.is_empty())
                    .unwrap_or(false)
            } else {
                true
            };

            // Get sync stats for this provider
            let stats = stats_map.get(&setting.id);
            let asset_count = stats.map(|s| s.asset_count).unwrap_or(0);
            let error_count = stats.map(|s| s.error_count).unwrap_or(0);
            let last_synced_at = stats
                .and_then(|s| s.last_synced_at)
                .map(|dt| dt.to_rfc3339());
            let last_sync_error = stats.and_then(|s| s.last_error.clone());
            let unique_errors = stats
                .map(|s| s.unique_errors.clone())
                .unwrap_or_default();

            infos.push(ProviderInfo {
                id: setting.id.clone(),
                name: setting.name.clone(),
                description: Some(setting.description.clone()),
                url: setting.url.clone(),
                enabled: setting.enabled,
                priority: setting.priority,
                logo_filename: setting.logo_filename.clone(),
                capabilities: setting.capabilities.clone(),
                requires_api_key: requires_key,
                has_api_key: has_key,
                asset_count,
                error_count,
                last_synced_at,
                last_sync_error,
                unique_errors,
            });
        }

        infos.sort_by(|a, b| a.priority.cmp(&b.priority));
        Ok(infos)
    }

    async fn update_provider_settings(
        &self,
        provider_id: &str,
        priority: i32,
        enabled: bool,
    ) -> Result<()> {
        use super::provider_settings::UpdateMarketDataProviderSetting;

        self.provider_settings_store.update_provider(
            provider_id,
            UpdateMarketDataProviderSetting {
                priority: Some(priority),
                enabled: Some(enabled),
            },
        )?;

        // Refresh client with new settings
        self.refresh_client().await?;

        Ok(())
    }

    // =========================================================================
    // Quote Import
    // =========================================================================

    async fn import_quotes(
        &self,
        mut quotes: Vec<QuoteImport>,
        overwrite: bool,
    ) -> Result<Vec<QuoteImport>> {
        info!(
            "Importing {} quotes (overwrite={})",
            quotes.len(),
            overwrite
        );

        // Validate all quotes
        QuoteValidator::validate_batch(&mut quotes);

        let mut to_save = Vec::new();

        for quote in &mut quotes {
            // Skip invalid quotes
            if !quote.validation_status.is_importable() {
                continue;
            }

            // Check for duplicates if not overwriting
            if !overwrite {
                let existing = self.quote_store.find_duplicate_quotes(
                    &quote.symbol,
                    quote.parse_date().unwrap_or_default(),
                );
                if existing.map(|v| !v.is_empty()).unwrap_or(false) {
                    quote.validation_status =
                        ImportValidationStatus::Warning("Quote already exists".to_string());
                    continue;
                }
            }

            // Convert and add to batch
            match self.convert_import_to_quote(quote) {
                Ok(q) => {
                    to_save.push(q);
                    quote.validation_status = ImportValidationStatus::Valid;
                }
                Err(e) => {
                    quote.validation_status = ImportValidationStatus::Error(e.to_string());
                }
            }
        }

        // Save all valid quotes
        if !to_save.is_empty() {
            let saved = self.quote_store.upsert_quotes(&to_save).await?;
            info!("Saved {} quotes", saved);
        }

        Ok(quotes)
    }
}

// =============================================================================
// Gap Filling Helper
// =============================================================================

/// Fills missing quotes for weekends and holidays by carrying forward the last known quote.
///
/// This is critical for portfolio valuation which needs a quote for every day in the range.
/// Without this, portfolio values would show $0 on non-trading days.
///
/// # Algorithm
/// 1. Build a map of quotes by date
/// 2. Look back from start_date to find initial quotes for each symbol
/// 3. For each day in [start_date, end_date]:
///    - Update last_known_quotes with any actual quotes for that day
///    - Output the last known quote for each symbol (with the current day's timestamp)
///
/// # Arguments
/// * `quotes` - All quotes including lookback period
/// * `required_symbols` - Symbols to fill
/// * `start_date` - Start of the output range
/// * `end_date` - End of the output range
/// * `first_appearance` - Optional map of symbol -> first date it appeared in portfolio.
///   Debug messages for missing quotes are only logged for dates on or after the symbol's
///   first appearance, reducing noise from assets added later.
///
/// # Returns
/// A Vec of quotes with one entry per symbol per day (filled from last known value)
fn fill_missing_quotes(
    quotes: &[Quote],
    required_symbols: &HashSet<String>,
    start_date: NaiveDate,
    end_date: NaiveDate,
    first_appearance: &HashMap<String, NaiveDate>,
) -> Vec<Quote> {
    if required_symbols.is_empty() {
        return Vec::new();
    }

    // Filter to only symbols that need market quotes
    // Excludes: cash, FX, alternative assets (PROP, VEH, COLL, PREC, LIAB, ALT), private equity
    let required_symbols: HashSet<String> = required_symbols
        .iter()
        .filter(|s| needs_market_quotes(s))
        .cloned()
        .collect();

    if required_symbols.is_empty() {
        return Vec::new();
    }

    // Build quotes_by_date map
    let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();
    for quote in quotes {
        quotes_by_date
            .entry(quote.timestamp.date_naive())
            .or_default()
            .insert(quote.asset_id.clone(), quote.clone());
    }

    let mut all_filled_quotes = Vec::new();
    let mut last_known_quotes: HashMap<String, Quote> = HashMap::new();

    // Look back from start_date to find initial quotes for each required symbol
    // We look through all dates before start_date that we have quotes for
    let mut lookback_dates: Vec<NaiveDate> = quotes_by_date
        .keys()
        .filter(|d| **d < start_date)
        .cloned()
        .collect();
    lookback_dates.sort(); // Sort ascending so we get the most recent values

    for date in lookback_dates {
        if let Some(daily_quotes) = quotes_by_date.get(&date) {
            for (symbol, quote) in daily_quotes {
                if required_symbols.contains(symbol) {
                    // Always update - we want the most recent quote before start_date
                    last_known_quotes.insert(symbol.clone(), quote.clone());
                }
            }
        }
    }

    // Now iterate through the requested date range
    for current_date in time_utils::get_days_between(start_date, end_date) {
        // Update last_known_quotes with any actual quotes for this day
        if let Some(daily_quotes) = quotes_by_date.get(&current_date) {
            for (symbol, quote) in daily_quotes {
                if required_symbols.contains(symbol) {
                    last_known_quotes.insert(symbol.clone(), quote.clone());
                }
            }
        }

        // Output a quote for each required symbol using last known value
        for symbol in &required_symbols {
            if let Some(last_quote) = last_known_quotes.get(symbol) {
                let mut quote_for_today = last_quote.clone();
                // Update timestamp to current date at noon UTC
                quote_for_today.timestamp =
                    Utc.from_utc_datetime(&current_date.and_hms_opt(12, 0, 0).unwrap());
                all_filled_quotes.push(quote_for_today);
            } else {
                // Only log debug message if we're past the symbol's first appearance date
                // This avoids noisy logs for assets added to portfolio later
                let should_log = first_appearance
                    .get(symbol)
                    .map(|first_date| current_date >= *first_date)
                    .unwrap_or(true); // Log if no first_appearance info provided

                if should_log {
                    debug!(
                        "No quote available for symbol '{}' on or before date {}",
                        symbol, current_date
                    );
                }
            }
        }
    }

    all_filled_quotes
}
