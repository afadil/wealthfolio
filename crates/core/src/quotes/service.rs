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
use super::model::{DataSource, LatestQuotePair, Quote, SymbolSearchResult};
use super::store::{ProviderSettingsStore, QuoteStore};
use super::sync::{QuoteSyncService, QuoteSyncServiceTrait, SyncResult};
use super::sync_state::{QuoteSyncState, SymbolSyncPlan, SyncMode, SyncStateStore};
use super::types::{AssetId, Day};
use crate::activities::ActivityRepositoryTrait;
use crate::assets::{
    is_fx_asset_id, needs_market_quotes, Asset, AssetKind, AssetRepositoryTrait, PricingMode,
    ProviderProfile,
};
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
    fn get_latest_quotes_pair(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, LatestQuotePair>>;

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
    fn get_quotes_in_range_filled(
        &self,
        symbols: &HashSet<String>,
        start: NaiveDate,
        end: NaiveDate,
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
    async fn search_symbol(&self, query: &str) -> Result<Vec<SymbolSearchResult>>;

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
    ) -> Result<Vec<SymbolSearchResult>>;

    /// Get asset profile from provider.
    ///
    /// Uses the asset's exchange_mic to build provider-specific symbols
    /// (e.g., "VFV.TO" for Yahoo when exchange_mic is XTSE).
    async fn get_asset_profile(&self, asset: &Asset) -> Result<ProviderProfile>;

    /// Fetch historical quotes from provider.
    async fn fetch_quotes_from_provider(
        &self,
        asset_id: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<Quote>>;

    /// Fetch quotes for an asset ID (canonical format like "SEC:^GSPC:INDEX")
    /// that may not exist in the database. Used for benchmark indices and external symbols.
    async fn fetch_quotes_for_symbol(
        &self,
        asset_id: &str,
        currency: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<Quote>>;

    // =========================================================================
    // Sync Operations (via QuoteSyncService)
    // =========================================================================

    /// Perform quote synchronization with the specified mode and optional asset filter.
    ///
    /// # Arguments
    /// * `mode` - The sync mode determining how date ranges are calculated
    /// * `asset_ids` - Optional list of specific assets to sync. If None, syncs all relevant assets.
    ///
    /// # Sync Modes
    /// * `Incremental` - Default mode. Continues from last_quote_date with overlap to heal corrections.
    /// * `RefetchRecent { days }` - Refetches the last N days regardless of existing quotes.
    /// * `BackfillHistory { days }` - Rebuilds full history from activity start (or N days fallback).
    async fn sync(&self, mode: SyncMode, asset_ids: Option<Vec<String>>) -> Result<SyncResult>;

    /// Force resync for specific asset IDs (or all if None) using BackfillHistory mode.
    async fn resync(&self, asset_ids: Option<Vec<String>>) -> Result<SyncResult>;

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

    /// Get sync states that have errors (error_count > 0).
    fn get_sync_states_with_errors(&self) -> Result<Vec<QuoteSyncState>>;

    /// Update position status (active/inactive) based on current holdings.
    async fn update_position_status_from_holdings(
        &self,
        current_holdings: &std::collections::HashMap<String, rust_decimal::Decimal>,
    ) -> Result<()>;

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

    /// Parse and validate quotes from CSV content.
    ///
    /// This method parses CSV data, validates quote fields, and checks if assets
    /// exist in the database. Returns quotes with validation status:
    /// - Valid: quote can be imported (asset exists, data valid)
    /// - Warning: quote has minor issues but can be imported
    /// - Error: quote cannot be imported (asset not found, invalid data)
    ///
    /// # Arguments
    /// * `content` - Raw CSV file content as bytes
    /// * `has_header_row` - Whether the CSV has a header row
    ///
    /// # Returns
    /// The parsed and validated quotes with symbols resolved to asset IDs
    async fn check_quotes_import(
        &self,
        content: &[u8],
        has_header_row: bool,
    ) -> Result<Vec<QuoteImport>>;

    /// Import quotes from CSV data.
    async fn import_quotes(
        &self,
        quotes: Vec<QuoteImport>,
        overwrite: bool,
    ) -> Result<Vec<QuoteImport>>;
}

/// Unified quote service implementation.
pub struct QuoteService<Q, S, PS, A, R>
where
    Q: QuoteStore,
    S: SyncStateStore,
    PS: ProviderSettingsStore,
    A: AssetRepositoryTrait,
    R: ActivityRepositoryTrait,
{
    /// Quote storage.
    quote_store: Arc<Q>,
    /// Sync state storage.
    sync_state_store: Arc<S>,
    /// Provider settings storage.
    provider_settings_store: Arc<PS>,
    /// Asset repository.
    asset_repo: Arc<A>,
    /// Activity repository.
    activity_repo: Arc<R>,
    /// Market data client for provider operations.
    client: Arc<RwLock<MarketDataClient>>,
    /// Secret store for API keys.
    secret_store: Arc<dyn SecretStore>,
    /// Sync service.
    sync_service: Arc<RwLock<Option<Arc<QuoteSyncService<Q, S, A, R>>>>>,
}

impl<Q, S, PS, A, R> QuoteService<Q, S, PS, A, R>
where
    Q: QuoteStore + 'static,
    S: SyncStateStore + 'static,
    PS: ProviderSettingsStore + 'static,
    A: AssetRepositoryTrait + 'static,
    R: ActivityRepositoryTrait + 'static,
{
    /// Create a new quote service.
    pub async fn new(
        quote_store: Arc<Q>,
        sync_state_store: Arc<S>,
        provider_settings_store: Arc<PS>,
        asset_repo: Arc<A>,
        activity_repo: Arc<R>,
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
            activity_repo.clone(),
        );

        Ok(Self {
            quote_store,
            sync_state_store,
            provider_settings_store,
            asset_repo,
            activity_repo,
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
            self.activity_repo.clone(),
        );
        *self.sync_service.write().await = Some(Arc::new(new_sync));

        Ok(())
    }

    /// Get the sync service.
    async fn get_sync_service(&self) -> Result<Arc<QuoteSyncService<Q, S, A, R>>> {
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

    /// Convert an existing Asset to a SymbolSearchResult for search results.
    ///
    /// Marks the result as existing and includes the asset ID.
    fn asset_to_quote_summary(asset: &Asset) -> SymbolSearchResult {
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

        SymbolSearchResult {
            symbol: asset.symbol.clone(),
            short_name: asset.name.clone().unwrap_or_else(|| asset.symbol.clone()),
            long_name: asset.name.clone().unwrap_or_else(|| asset.symbol.clone()),
            exchange: exchange_name.clone().unwrap_or_default(),
            exchange_mic: asset.exchange_mic.clone(),
            exchange_name,
            quote_type: quote_type.to_string(),
            type_display: quote_type.to_string(),
            currency: Some(asset.currency.clone()),
            data_source: asset
                .preferred_provider
                .clone()
                .or_else(|| Some("MANUAL".to_string())),
            is_existing: true,
            existing_asset_id: Some(asset.id.clone()),
            index: String::new(),
            score: 100.0, // High score for existing assets
        }
    }
}

#[async_trait]
impl<Q, S, PS, A, R> QuoteServiceTrait for QuoteService<Q, S, PS, A, R>
where
    Q: QuoteStore + 'static,
    S: SyncStateStore + 'static,
    PS: ProviderSettingsStore + 'static,
    A: AssetRepositoryTrait + 'static,
    R: ActivityRepositoryTrait + 'static,
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
            let quotes = self
                .quote_store
                .get_quotes_in_range(symbol, lookback_start, end)?;
            all_quotes.extend(quotes);
        }

        // Fill missing quotes
        Ok(fill_missing_quotes(&all_quotes, symbols, start, end))
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

    async fn search_symbol(&self, query: &str) -> Result<Vec<SymbolSearchResult>> {
        self.search_symbol_with_currency(query, None).await
    }

    async fn search_symbol_with_currency(
        &self,
        query: &str,
        account_currency: Option<&str>,
    ) -> Result<Vec<SymbolSearchResult>> {
        // 1. Search existing assets in user's database
        let existing_assets = self.asset_repo.search_by_symbol(query).unwrap_or_default();

        // 2. Search provider for external results
        let provider_results = self
            .client
            .read()
            .await
            .search(query)
            .await
            .unwrap_or_default();

        // 3. Convert existing assets to SymbolSearchResult with is_existing flag
        let existing_summaries: Vec<SymbolSearchResult> = existing_assets
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
        let new_provider_results: Vec<SymbolSearchResult> = provider_results
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

        // 7. Sort results: existing first, then by exchange relevance (if currency), then by score
        let preferred_exchanges = account_currency
            .map(|c| exchanges_for_currency(c))
            .unwrap_or_default();

        merged.sort_by(|a, b| {
            // Existing assets always come first
            match (a.is_existing, b.is_existing) {
                (true, false) => return std::cmp::Ordering::Less,
                (false, true) => return std::cmp::Ordering::Greater,
                _ => {}
            }

            // Then sort by exchange relevance (if currency provided)
            if !preferred_exchanges.is_empty() {
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
                    std::cmp::Ordering::Equal => {}
                    other => return other,
                }
            }

            // Finally sort by provider score (descending, higher score first)
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(merged)
    }

    async fn get_asset_profile(&self, asset: &Asset) -> Result<ProviderProfile> {
        self.client.read().await.get_profile(asset).await
    }

    async fn fetch_quotes_from_provider(
        &self,
        asset_id: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<Quote>> {
        let asset = self.asset_repo.get_by_id(asset_id)?;
        let start_dt = Utc.from_utc_datetime(&start.and_hms_opt(0, 0, 0).unwrap());
        let end_dt = Utc.from_utc_datetime(&end.and_hms_opt(23, 59, 59).unwrap());

        self.client
            .read()
            .await
            .fetch_historical_quotes(&asset, start_dt, end_dt)
            .await
    }

    /// Fetch quotes for an asset ID (canonical format like "SEC:^GSPC:INDEX")
    /// that may not exist in the user's database.
    async fn fetch_quotes_for_symbol(
        &self,
        asset_id: &str,
        currency: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<Quote>> {
        // First try to find an existing asset by ID
        if let Ok(asset) = self.asset_repo.get_by_id(asset_id) {
            let start_dt = Utc.from_utc_datetime(&start.and_hms_opt(0, 0, 0).unwrap());
            let end_dt = Utc.from_utc_datetime(&end.and_hms_opt(23, 59, 59).unwrap());
            return self
                .client
                .read()
                .await
                .fetch_historical_quotes(&asset, start_dt, end_dt)
                .await;
        }

        // Parse canonical asset ID format: SEC:{symbol}:{mic}
        // Fall back to treating the whole string as a symbol if not in canonical format
        let (symbol, exchange_mic) = if asset_id.starts_with("SEC:") {
            let parts: Vec<&str> = asset_id.split(':').collect();
            if parts.len() >= 3 {
                let sym = parts[1].to_string();
                let mic = if parts[2] == "INDEX" || parts[2] == "UNKNOWN" {
                    None
                } else {
                    Some(parts[2].to_string())
                };
                (sym, mic)
            } else {
                (asset_id.to_string(), None)
            }
        } else {
            (asset_id.to_string(), None)
        };

        // Create a minimal temporary Asset for fetching quotes from provider
        let temp_asset = Asset {
            id: asset_id.to_string(),
            symbol,
            kind: AssetKind::Security,
            currency: currency.to_string(),
            exchange_mic,
            pricing_mode: PricingMode::Market,
            ..Default::default()
        };

        let start_dt = Utc.from_utc_datetime(&start.and_hms_opt(0, 0, 0).unwrap());
        let end_dt = Utc.from_utc_datetime(&end.and_hms_opt(23, 59, 59).unwrap());

        self.client
            .read()
            .await
            .fetch_historical_quotes(&temp_asset, start_dt, end_dt)
            .await
    }

    // =========================================================================
    // Sync Operations
    // =========================================================================

    async fn sync(&self, mode: SyncMode, asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
        let sync_service = self.get_sync_service().await?;
        sync_service.sync(mode, asset_ids).await
    }

    async fn resync(&self, asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
        let sync_service = self.get_sync_service().await?;
        sync_service.resync(asset_ids).await
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
        sync_service.handle_activity_created(&asset_id, day).await
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
        self.sync_state_store
            .get_assets_needing_profile_enrichment()
    }

    async fn update_position_status_from_holdings(
        &self,
        current_holdings: &std::collections::HashMap<String, rust_decimal::Decimal>,
    ) -> Result<()> {
        use rust_decimal::Decimal;

        let today = Utc::now().date_naive();

        // Get all sync states to determine previous active/inactive status
        let all_sync_states = self.sync_state_store.get_all()?;

        let mut marked_active = 0;
        let mut marked_inactive = 0;

        for sync_state in all_sync_states {
            let asset_id = &sync_state.asset_id;

            // Skip FX assets - they don't have "positions" in the holdings sense.
            // FX rates are always needed for currency conversion as long as there are
            // foreign-currency activities or holdings. Their lifecycle is managed separately.
            if is_fx_asset_id(asset_id) {
                continue;
            }

            let current_qty = current_holdings
                .get(asset_id)
                .copied()
                .unwrap_or(Decimal::ZERO);
            let has_open_position = current_qty > Decimal::ZERO;

            if has_open_position {
                // Asset has an open position
                if !sync_state.is_active {
                    // Was inactive, now has a position - mark as active (re-opened)
                    debug!(
                        "Marking asset {} as active (re-opened position, qty={})",
                        asset_id, current_qty
                    );
                    self.sync_state_store.mark_active(asset_id).await?;
                    marked_active += 1;
                }
                // If already active, no change needed
            } else {
                // Asset has no open position (quantity = 0 or not in holdings)
                if sync_state.is_active {
                    // Was active, now closed - mark as inactive with today's date
                    debug!("Marking asset {} as inactive (position closed)", asset_id);
                    self.sync_state_store.mark_inactive(asset_id, today).await?;
                    marked_inactive += 1;
                }
                // If already inactive, no change needed (preserve existing closed date)
            }
        }

        if marked_active > 0 || marked_inactive > 0 {
            info!(
                "Position status update: {} marked active, {} marked inactive",
                marked_active, marked_inactive
            );
        }

        Ok(())
    }

    fn get_sync_states_with_errors(&self) -> Result<Vec<QuoteSyncState>> {
        self.sync_state_store.get_with_errors()
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
                DATA_SOURCE_ALPHA_VANTAGE
                    | DATA_SOURCE_MARKET_DATA_APP
                    | DATA_SOURCE_METAL_PRICE_API
                    | DATA_SOURCE_FINNHUB
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
            let unique_errors = stats.map(|s| s.unique_errors.clone()).unwrap_or_default();

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

    async fn check_quotes_import(
        &self,
        content: &[u8],
        has_header_row: bool,
    ) -> Result<Vec<QuoteImport>> {
        use rust_decimal::Decimal;
        use std::str::FromStr;

        // Parse CSV
        let mut reader = csv::ReaderBuilder::new()
            .has_headers(has_header_row)
            .flexible(true)
            .trim(csv::Trim::All)
            .from_reader(content);

        // Get headers (lowercase for case-insensitive matching)
        let headers: Vec<String> = if has_header_row {
            reader
                .headers()
                .map_err(|e| {
                    crate::errors::ValidationError::InvalidInput(format!(
                        "Failed to read CSV headers: {}",
                        e
                    ))
                })?
                .iter()
                .map(|h| h.to_lowercase())
                .collect()
        } else {
            vec![
                "symbol".to_string(),
                "date".to_string(),
                "close".to_string(),
            ]
        };

        // Validate required headers
        let required = ["symbol", "date", "close"];
        let missing: Vec<&str> = required
            .iter()
            .filter(|h| !headers.contains(&h.to_string()))
            .copied()
            .collect();
        if !missing.is_empty() {
            return Err(crate::errors::ValidationError::InvalidInput(format!(
                "Missing required columns: {}",
                missing.join(", ")
            ))
            .into());
        }

        // Helper to get column index
        let get_idx = |name: &str| headers.iter().position(|h| h == name);
        let symbol_idx = get_idx("symbol").unwrap();
        let date_idx = get_idx("date").unwrap();
        let close_idx = get_idx("close").unwrap();
        let open_idx = get_idx("open");
        let high_idx = get_idx("high");
        let low_idx = get_idx("low");
        let volume_idx = get_idx("volume");
        let currency_idx = get_idx("currency");

        // Parse rows into QuoteImport
        let mut quotes: Vec<QuoteImport> = Vec::new();
        for result in reader.records() {
            let record = match result {
                Ok(r) => r,
                Err(e) => {
                    debug!("Skipping invalid CSV row: {}", e);
                    continue;
                }
            };

            let get_field =
                |idx: usize| record.get(idx).map(|s| s.trim()).filter(|s| !s.is_empty());
            let parse_decimal = |idx: Option<usize>| -> Option<Decimal> {
                idx.and_then(|i| get_field(i))
                    .and_then(|s| Decimal::from_str(&s.replace(',', "")).ok())
            };

            let symbol = get_field(symbol_idx).unwrap_or("").to_string();
            let date = get_field(date_idx).unwrap_or("").to_string();
            let close = parse_decimal(Some(close_idx)).unwrap_or(Decimal::ZERO);
            let currency = get_field(currency_idx.unwrap_or(usize::MAX))
                .unwrap_or("USD")
                .to_string();

            quotes.push(QuoteImport {
                symbol,
                date,
                open: parse_decimal(open_idx),
                high: parse_decimal(high_idx),
                low: parse_decimal(low_idx),
                close,
                volume: parse_decimal(volume_idx),
                currency,
                validation_status: ImportValidationStatus::Valid,
                error_message: None,
            });
        }

        if quotes.is_empty() {
            return Err(crate::errors::ValidationError::InvalidInput(
                "CSV file must contain at least one data row".to_string(),
            )
            .into());
        }

        info!("Parsed {} quotes from CSV, validating...", quotes.len());

        // Fetch all assets once for efficient lookup
        let all_assets = self.asset_repo.list()?;

        // Build lookup maps for flexible symbol matching:
        // 1. By asset ID (e.g., "SEC:VFV:XTSE")
        // 2. By symbol (e.g., "VFV")
        // 3. By symbol.exchange suffix (e.g., "VFV.TO" -> symbol "VFV" + exchange suffix "TO")
        let mut asset_by_id: HashMap<String, &Asset> = HashMap::new();
        let mut asset_by_symbol: HashMap<String, &Asset> = HashMap::new();
        let mut asset_by_symbol_exchange: HashMap<String, &Asset> = HashMap::new();

        for asset in &all_assets {
            asset_by_id.insert(asset.id.to_lowercase(), asset);
            asset_by_symbol.insert(asset.symbol.to_lowercase(), asset);

            // Build symbol.exchange key if asset has exchange_mic
            if let Some(ref mic) = asset.exchange_mic {
                if let Some(suffix) = mic_to_yahoo_suffix(mic) {
                    let key = format!("{}.{}", asset.symbol.to_lowercase(), suffix.to_lowercase());
                    asset_by_symbol_exchange.insert(key, asset);
                }
            }
        }

        for quote in &mut quotes {
            // First validate the quote fields
            quote.validation_status = QuoteValidator::validate(quote);

            // If already has an error, skip asset matching
            if !quote.validation_status.is_importable() {
                if let ImportValidationStatus::Error(msg) = &quote.validation_status {
                    quote.error_message = Some(msg.clone());
                }
                continue;
            }

            // Try to match the symbol against existing assets
            // Priority: 1) exact asset ID, 2) exact symbol, 3) symbol.exchange format
            let symbol_lower = quote.symbol.to_lowercase();
            let matched_asset = asset_by_id
                .get(&symbol_lower)
                .or_else(|| asset_by_symbol.get(&symbol_lower))
                .or_else(|| asset_by_symbol_exchange.get(&symbol_lower));

            match matched_asset {
                Some(asset) => {
                    // Update the symbol to the canonical asset ID
                    quote.symbol = asset.id.clone();
                }
                None => {
                    // Asset not found - mark as error
                    let msg = format!("Asset not found: '{}'", quote.symbol);
                    quote.validation_status = ImportValidationStatus::Error(msg.clone());
                    quote.error_message = Some(msg);
                }
            }
        }

        Ok(quotes)
    }

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
                let existing = self
                    .quote_store
                    .find_duplicate_quotes(&quote.symbol, quote.parse_date().unwrap_or_default());
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
// Symbol Resolution Helpers
// =============================================================================

/// Convert MIC (Market Identifier Code) to Yahoo Finance exchange suffix.
///
/// This enables matching symbols like "VFV.TO" against assets with exchange_mic "XTSE".
///
/// # Arguments
/// * `mic` - The ISO 10383 Market Identifier Code (e.g., "XTSE")
///
/// # Returns
/// The Yahoo Finance suffix without the dot (e.g., "TO") if known, or None.
fn mic_to_yahoo_suffix(mic: &str) -> Option<&'static str> {
    match mic {
        // North America
        "XTSE" => Some("TO"), // Toronto Stock Exchange
        "XTSX" => Some("V"),  // TSX Venture
        "XCNQ" => Some("CN"), // Canadian Securities Exchange
        "XMEX" => Some("MX"), // Mexican Stock Exchange
        // UK & Ireland
        "XLON" => Some("L"),  // London Stock Exchange
        "XDUB" => Some("IR"), // Dublin
        // Germany
        "XETR" => Some("DE"), // XETRA
        "XFRA" => Some("F"),  // Frankfurt
        "XSTU" => Some("SG"), // Stuttgart
        "XHAM" => Some("HM"), // Hamburg
        "XDUS" => Some("DU"), // Dusseldorf
        "XMUN" => Some("MU"), // Munich
        "XBER" => Some("BE"), // Berlin
        "XHAN" => Some("HA"), // Hanover
        // Euronext
        "XPAR" => Some("PA"), // Paris
        "XAMS" => Some("AS"), // Amsterdam
        "XBRU" => Some("BR"), // Brussels
        "XLIS" => Some("LS"), // Lisbon
        // Southern Europe
        "XMIL" => Some("MI"), // Milan
        "XMAD" => Some("MC"), // Madrid
        "XATH" => Some("AT"), // Athens
        // Nordic
        "XSTO" => Some("ST"), // Stockholm
        "XHEL" => Some("HE"), // Helsinki
        "XCSE" => Some("CO"), // Copenhagen
        "XOSL" => Some("OL"), // Oslo
        "XICE" => Some("IC"), // Iceland
        // Central/Eastern Europe
        "XSWX" => Some("SW"), // Swiss Exchange
        "XWBO" => Some("VI"), // Vienna
        "XWAR" => Some("WA"), // Warsaw
        "XPRA" => Some("PR"), // Prague
        "XBUD" => Some("BD"), // Budapest
        "XIST" => Some("IS"), // Istanbul
        // Asia - China & Hong Kong
        "XSHG" => Some("SS"), // Shanghai
        "XSHE" => Some("SZ"), // Shenzhen
        "XHKG" => Some("HK"), // Hong Kong
        // Asia - Japan & Korea
        "XTKS" => Some("T"),  // Tokyo
        "XKRX" => Some("KS"), // Korea (KOSPI)
        "XKOS" => Some("KQ"), // Korea (KOSDAQ)
        // Southeast Asia
        "XSES" => Some("SI"), // Singapore
        "XBKK" => Some("BK"), // Bangkok
        "XIDX" => Some("JK"), // Jakarta
        "XKLS" => Some("KL"), // Kuala Lumpur
        // India
        "XBOM" => Some("BO"), // Bombay
        "XNSE" => Some("NS"), // National Stock Exchange India
        // Taiwan
        "XTAI" => Some("TW"), // Taiwan
        // Oceania
        "XASX" => Some("AX"), // Australia
        "XNZE" => Some("NZ"), // New Zealand
        // South America
        "BVMF" => Some("SA"), // Brazil (B3)
        "XBUE" => Some("BA"), // Buenos Aires
        "XSGO" => Some("SN"), // Santiago
        // Middle East
        "XTAE" => Some("TA"),  // Tel Aviv
        "XSAU" => Some("SAU"), // Saudi Arabia
        "XDFM" => Some("AE"),  // Dubai Financial Market
        "DSMD" => Some("QA"),  // Qatar
        // Africa
        "XJSE" => Some("JO"), // Johannesburg
        "XCAI" => Some("CA"), // Cairo
        _ => None,
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
///
/// # Returns
/// A Vec of quotes with one entry per symbol per day (filled from last known value)
fn fill_missing_quotes(
    quotes: &[Quote],
    required_symbols: &HashSet<String>,
    start_date: NaiveDate,
    end_date: NaiveDate,
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
            }
        }
    }

    all_filled_quotes
}
