//! Quote synchronization service.
//!
//! This module provides the `QuoteSyncService` which orchestrates quote fetching
//! from market data providers and manages synchronization state.
//!
//! # Architecture
//!
//! ```text
//! QuoteSyncService
//!       │
//!       ├─► MarketDataClient (fetch quotes via market-data crate)
//!       ├─► QuoteStore (persist quotes)
//!       ├─► SyncStateStore (track sync state)
//!       └─► AssetRepository (asset lookups)
//! ```
//!
//! # Key Design Principles
//!
//! - **Thin orchestration**: Quote fetching delegated to `MarketDataClient`
//! - **Strong types**: Uses `AssetId`, `Day`, `QuoteSource` from `types.rs`
//! - **Activity-driven sync**: Sync ranges based on activity dates

use async_trait::async_trait;
use chrono::{Duration, NaiveDate, TimeZone, Utc};
use log::{debug, error, info, warn};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::client::MarketDataClient;
use super::constants::*;
use super::store::QuoteStore;
use super::sync_state::{QuoteSyncState, SyncCategory, SyncStateStore, SymbolSyncPlan};
use super::types::{AssetId, Day, ProviderId};
use crate::assets::{is_cash_asset_id, is_fx_asset_id, Asset, AssetKind, AssetRepositoryTrait, PricingMode};
use crate::errors::Result;

// =============================================================================
// Sync Result Types
// =============================================================================

/// Result of a sync operation for a single asset.
#[derive(Debug, Clone)]
pub struct AssetSyncResult {
    /// The asset that was synced.
    pub asset_id: AssetId,
    /// Number of quotes added/updated.
    pub quotes_added: usize,
    /// The sync status after the operation.
    pub status: SyncStatus,
    /// Optional error message if sync failed.
    pub error: Option<String>,
}

/// Status of a sync operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncStatus {
    /// Sync completed successfully.
    Success,
    /// Sync was skipped (e.g., manual pricing mode).
    Skipped,
    /// Sync failed with error.
    Failed,
}

/// Aggregate result of a sync operation.
#[derive(Debug, Clone, Default)]
pub struct SyncResult {
    /// Number of assets successfully synced.
    pub synced: usize,
    /// Number of assets that failed to sync.
    pub failed: usize,
    /// Number of assets that were skipped.
    pub skipped: usize,
    /// Total quotes added/updated.
    pub quotes_synced: usize,
    /// Detailed errors for each failed asset.
    pub errors: Vec<SyncError>,
    /// Legacy field for backwards compatibility.
    pub failures: Vec<(String, String)>,
}

impl SyncResult {
    /// Check if the sync was fully successful (no failures).
    pub fn is_success(&self) -> bool {
        self.failed == 0
    }

    /// Get a summary string.
    pub fn summary(&self) -> String {
        if self.is_success() {
            format!(
                "Synced {} quotes for {} assets successfully",
                self.quotes_synced, self.synced
            )
        } else {
            format!(
                "Synced {} quotes with {} failures",
                self.quotes_synced, self.failed
            )
        }
    }

    /// Add a result for a single asset.
    fn add_result(&mut self, result: AssetSyncResult) {
        match result.status {
            SyncStatus::Success => {
                self.synced += 1;
                self.quotes_synced += result.quotes_added;
            }
            SyncStatus::Skipped => {
                self.skipped += 1;
            }
            SyncStatus::Failed => {
                self.failed += 1;
                if let Some(err) = result.error.clone() {
                    self.errors.push(SyncError {
                        asset_id: result.asset_id.clone(),
                        message: err.clone(),
                        provider_errors: vec![],
                    });
                    self.failures.push((result.asset_id.0.clone(), err));
                }
            }
        }
    }
}

/// Error details for a failed sync operation.
#[derive(Debug, Clone)]
pub struct SyncError {
    /// The asset that failed to sync.
    pub asset_id: AssetId,
    /// Error message.
    pub message: String,
    /// Provider-specific errors if applicable.
    pub provider_errors: Vec<(ProviderId, String)>,
}

// =============================================================================
// Service Trait
// =============================================================================

/// Trait for the quote sync service.
#[async_trait]
pub trait QuoteSyncServiceTrait: Send + Sync {
    /// Perform an optimized sync of quotes for all relevant assets.
    /// This is the main entry point for sync operations.
    async fn sync(&self) -> Result<SyncResult>;

    /// Force resync of quotes for specific assets.
    /// If asset_ids is None or empty, resync all syncable assets.
    async fn resync(&self, asset_ids: Option<Vec<String>>) -> Result<SyncResult>;

    /// Handle a new activity being created.
    /// This may expand the sync range to include the activity date.
    async fn handle_activity_created(&self, asset_id: &AssetId, activity_date: Day) -> Result<()>;

    /// Handle an activity being deleted.
    /// This may recalculate the required sync range.
    async fn handle_activity_deleted(&self, asset_id: &AssetId) -> Result<()>;

    /// Refresh the sync state from current holdings and activities.
    async fn refresh_sync_state(&self) -> Result<()>;

    /// Get the current sync plan without executing it.
    fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>>;
}

// =============================================================================
// Quote Sync Service
// =============================================================================

/// Quote synchronization service.
///
/// Orchestrates quote fetching from market data providers
/// and manages synchronization state. This is a thin layer that
/// delegates actual fetching to `MarketDataClient` and storage to `QuoteStore`.
pub struct QuoteSyncService<Q, S, A>
where
    Q: QuoteStore,
    S: SyncStateStore,
    A: AssetRepositoryTrait,
{
    /// Market data client for fetching quotes from providers.
    client: Arc<RwLock<MarketDataClient>>,
    /// Quote storage.
    quote_store: Arc<Q>,
    /// Sync state storage.
    sync_state_store: Arc<S>,
    /// Asset repository for asset lookups.
    asset_repo: Arc<A>,
}

impl<Q, S, A> QuoteSyncService<Q, S, A>
where
    Q: QuoteStore + 'static,
    S: SyncStateStore + 'static,
    A: AssetRepositoryTrait + 'static,
{
    /// Create a new quote sync service.
    pub fn new(
        client: Arc<RwLock<MarketDataClient>>,
        quote_store: Arc<Q>,
        sync_state_store: Arc<S>,
        asset_repo: Arc<A>,
    ) -> Self {
        Self {
            client,
            quote_store,
            sync_state_store,
            asset_repo,
        }
    }

    /// Build sync plan for a list of assets.
    ///
    /// Determines the date ranges needed for each asset based on:
    /// - First activity date (for backfill)
    /// - Last synced date (for incremental sync)
    /// - Current sync category (active, new, needs backfill, etc.)
    pub fn build_sync_plan(&self, assets: &[Asset]) -> Vec<SymbolSyncPlan> {
        let today = Utc::now().date_naive();

        assets
            .iter()
            .filter(|a| self.should_sync_asset(a))
            .filter_map(|asset| self.build_asset_sync_plan(asset, today))
            .collect()
    }

    /// Check if an asset should be synced.
    fn should_sync_asset(&self, asset: &Asset) -> bool {
        // Skip cash assets - they don't need quote syncing (always 1:1)
        if asset.kind == AssetKind::Cash {
            return false;
        }

        // Only sync market-priced assets (including FX rates for currency conversion)
        if asset.pricing_mode != PricingMode::Market {
            return false;
        }

        // Only sync active assets
        if !asset.is_active {
            return false;
        }

        true
    }

    /// Build sync plan for a single asset.
    fn build_asset_sync_plan(&self, asset: &Asset, today: NaiveDate) -> Option<SymbolSyncPlan> {
        // Get existing sync state
        let state = self.sync_state_store.get_by_asset_id(&asset.id).ok().flatten();

        let category = state
            .as_ref()
            .map(|s| s.determine_category(CLOSED_POSITION_GRACE_PERIOD_DAYS))
            .unwrap_or(SyncCategory::New);

        // Skip closed positions
        if matches!(category, SyncCategory::Closed) {
            return None;
        }

        let (start_date, end_date) = self.calculate_date_range(&state, &category, today);

        // Validate date range
        if start_date > end_date {
            return None;
        }

        Some(SymbolSyncPlan {
            asset_id: asset.id.clone(),
            category,
            start_date,
            end_date,
            priority: state
                .as_ref()
                .map(|s| s.sync_priority)
                .unwrap_or_else(|| SyncCategory::New.default_priority()),
            data_source: asset
                .preferred_provider
                .clone()
                .unwrap_or_else(|| DATA_SOURCE_YAHOO.to_string()),
            quote_symbol: None, // Derived from asset during fetch
            currency: asset.currency.clone(),
        })
    }

    /// Calculate the date range for syncing an asset.
    fn calculate_date_range(
        &self,
        state: &Option<QuoteSyncState>,
        category: &SyncCategory,
        today: NaiveDate,
    ) -> (NaiveDate, NaiveDate) {
        match category {
            SyncCategory::Active => {
                let start = state
                    .as_ref()
                    .and_then(|s| s.last_quote_date)
                    .map(|d| d.succ_opt().unwrap_or(d))
                    .or_else(|| {
                        state.as_ref().and_then(|s| {
                            s.first_activity_date
                                .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                        })
                    })
                    .unwrap_or_else(|| today - Duration::days(QUOTE_HISTORY_BUFFER_DAYS));
                (start, today)
            }
            SyncCategory::New => {
                let start = state
                    .as_ref()
                    .and_then(|s| s.first_activity_date)
                    .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                    .unwrap_or_else(|| today - Duration::days(QUOTE_HISTORY_BUFFER_DAYS));
                (start, today)
            }
            SyncCategory::NeedsBackfill => {
                let start = state
                    .as_ref()
                    .and_then(|s| s.first_activity_date)
                    .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                    .unwrap_or(today);
                let end = state
                    .as_ref()
                    .and_then(|s| s.earliest_quote_date)
                    .unwrap_or(today);
                (start, end)
            }
            SyncCategory::RecentlyClosed => {
                let start = state
                    .as_ref()
                    .and_then(|s| s.last_quote_date)
                    .map(|d| d.succ_opt().unwrap_or(d))
                    .unwrap_or_else(|| today - Duration::days(MIN_SYNC_LOOKBACK_DAYS));
                (start, today)
            }
            SyncCategory::Closed => (today, today), // Should not reach here
        }
    }

    /// Sync a single asset according to its sync plan.
    async fn sync_asset(&self, asset: &Asset, plan: &SymbolSyncPlan) -> AssetSyncResult {
        let asset_id = AssetId::new(&asset.id);

        debug!(
            "Fetching quotes for {} from {} to {}",
            asset.id, plan.start_date, plan.end_date
        );

        // Convert dates to DateTime<Utc>
        let start_dt = Utc
            .from_utc_datetime(&plan.start_date.and_hms_opt(0, 0, 0).unwrap());
        let end_dt = Utc
            .from_utc_datetime(&plan.end_date.and_hms_opt(23, 59, 59).unwrap());

        // Fetch quotes via MarketDataClient
        let client = self.client.read().await;
        match client.fetch_historical_quotes(asset, start_dt, end_dt).await {
            Ok(mut quotes) => {
                // Sort quotes by timestamp to ensure correct ordering
                // This is important because we use first()/last() to determine date ranges
                quotes.sort_by_key(|q| q.timestamp);

                let quotes_count = quotes.len();

                if quotes_count > 0 {
                    // Save to store
                    match self.quote_store.upsert_quotes(&quotes).await {
                        Ok(_) => {
                            debug!("Saved {} quotes for {}", quotes_count, asset.id);

                            // Update sync state
                            if let Some(last_quote) = quotes.last() {
                                let earliest = quotes.first().map(|q| q.timestamp.date_naive());
                                let data_source = last_quote.data_source.as_str();
                                if let Err(e) = self
                                    .sync_state_store
                                    .update_after_sync(
                                        &asset.id,
                                        last_quote.timestamp.date_naive(),
                                        earliest,
                                        Some(data_source),
                                    )
                                    .await
                                {
                                    warn!("Failed to update sync state for {}: {:?}", asset.id, e);
                                }
                            }

                            AssetSyncResult {
                                asset_id,
                                quotes_added: quotes_count,
                                status: SyncStatus::Success,
                                error: None,
                            }
                        }
                        Err(e) => {
                            error!("Failed to save quotes for {}: {:?}", asset.id, e);
                            AssetSyncResult {
                                asset_id,
                                quotes_added: 0,
                                status: SyncStatus::Failed,
                                error: Some(format!("Storage error: {}", e)),
                            }
                        }
                    }
                } else {
                    debug!("No quotes returned for {}", asset.id);
                    AssetSyncResult {
                        asset_id,
                        quotes_added: 0,
                        status: SyncStatus::Success,
                        error: None,
                    }
                }
            }
            Err(e) => {
                error!("Failed to fetch quotes for {}: {:?}", asset.id, e);

                // Update sync state with failure
                if let Err(state_err) = self
                    .sync_state_store
                    .update_after_failure(&asset.id, &e.to_string())
                    .await
                {
                    warn!(
                        "Failed to update sync state for {}: {:?}",
                        asset.id, state_err
                    );
                }

                AssetSyncResult {
                    asset_id,
                    quotes_added: 0,
                    status: SyncStatus::Failed,
                    error: Some(e.to_string()),
                }
            }
        }
    }

    /// Execute sync for a list of plans.
    async fn execute_sync_plans(&self, plans: Vec<SymbolSyncPlan>) -> SyncResult {
        if plans.is_empty() {
            return SyncResult::default();
        }

        info!("Executing sync for {} assets", plans.len());

        // Get all assets for the plans
        let asset_ids: Vec<String> = plans.iter().map(|p| p.asset_id.clone()).collect();
        let assets = match self.asset_repo.list_by_symbols(&asset_ids) {
            Ok(a) => a,
            Err(e) => {
                error!("Failed to get assets for sync: {:?}", e);
                let mut result = SyncResult::default();
                for plan in &plans {
                    result.failures.push((plan.asset_id.clone(), e.to_string()));
                    result.failed += 1;
                }
                return result;
            }
        };

        let asset_map: HashMap<String, Asset> =
            assets.into_iter().map(|a| (a.id.clone(), a)).collect();

        let mut result = SyncResult::default();

        for plan in &plans {
            if let Some(asset) = asset_map.get(&plan.asset_id) {
                let asset_result = self.sync_asset(asset, plan).await;
                result.add_result(asset_result);
            } else {
                warn!("Asset not found for asset_id: {}", plan.asset_id);
                result.add_result(AssetSyncResult {
                    asset_id: AssetId::new(&plan.asset_id),
                    quotes_added: 0,
                    status: SyncStatus::Failed,
                    error: Some("Asset not found".to_string()),
                });
            }
        }

        info!(
            "Sync complete: {} synced, {} failed, {} skipped, {} quotes total",
            result.synced, result.failed, result.skipped, result.quotes_synced
        );

        result
    }

    /// Generate sync plan based on current sync states.
    fn generate_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>> {
        let states = self
            .sync_state_store
            .get_assets_needing_sync(CLOSED_POSITION_GRACE_PERIOD_DAYS)?;

        let today = Utc::now().date_naive();

        let mut plans = Vec::new();

        for state in states {
            let category = state.determine_category(CLOSED_POSITION_GRACE_PERIOD_DAYS);

            if matches!(category, SyncCategory::Closed) {
                continue;
            }

            let (start_date, end_date) =
                self.calculate_date_range(&Some(state.clone()), &category, today);

            // Ensure minimum lookback
            let start_date = if start_date >= today {
                today - Duration::days(MIN_SYNC_LOOKBACK_DAYS)
            } else {
                start_date
            };

            if start_date > end_date {
                continue;
            }

            plans.push(SymbolSyncPlan {
                asset_id: state.asset_id.clone(),
                category,
                start_date,
                end_date,
                priority: state.sync_priority,
                data_source: state.data_source.clone(),
                quote_symbol: None,
                currency: "USD".to_string(), // Will be updated from asset
            });
        }

        // Sort by priority (highest first)
        plans.sort_by(|a, b| b.priority.cmp(&a.priority));
        Ok(plans)
    }

    /// Build sync states from current holdings and activities.
    async fn refresh_sync_states(&self) -> Result<()> {
        info!("Refreshing quote sync states...");

        // Get all syncable assets
        let assets = self.asset_repo.list()?;

        let syncable_assets: Vec<&Asset> = assets
            .iter()
            .filter(|a| self.should_sync_asset(a))
            .collect();

        for asset in syncable_assets {
            let existing = self.sync_state_store.get_by_asset_id(&asset.id)?;

            if existing.is_none() {
                // Create new sync state
                let mut state = QuoteSyncState::new(
                    asset.id.clone(),
                    asset
                        .preferred_provider
                        .clone()
                        .unwrap_or_else(|| DATA_SOURCE_YAHOO.to_string()),
                );
                state.is_active = true;
                state.sync_priority = SyncCategory::New.default_priority();

                if let Err(e) = self.sync_state_store.upsert(&state).await {
                    warn!("Failed to create sync state for {}: {:?}", asset.id, e);
                }
            }
        }

        // Refresh activity dates from actual activities table
        // This ensures first_activity_date and last_activity_date are accurate
        if let Err(e) = self
            .sync_state_store
            .refresh_activity_dates_from_activities()
            .await
        {
            warn!("Failed to refresh activity dates from activities: {:?}", e);
        }

        // Refresh earliest_quote_date from actual quotes table
        // This ensures we have the correct historical minimum
        if let Err(e) = self.sync_state_store.refresh_earliest_quote_dates().await {
            warn!("Failed to refresh earliest quote dates: {:?}", e);
        }

        Ok(())
    }
}

#[async_trait]
impl<Q, S, A> QuoteSyncServiceTrait for QuoteSyncService<Q, S, A>
where
    Q: QuoteStore + 'static,
    S: SyncStateStore + 'static,
    A: AssetRepositoryTrait + 'static,
{
    async fn sync(&self) -> Result<SyncResult> {
        info!("Starting optimized quote sync...");

        // Refresh sync state first
        if let Err(e) = self.refresh_sync_states().await {
            warn!("Failed to refresh sync states: {:?}", e);
        }

        // Generate and execute plan
        let plans = self.generate_sync_plan()?;

        if plans.is_empty() {
            info!("No assets need syncing");
            return Ok(SyncResult::default());
        }

        info!("Syncing {} assets", plans.len());
        Ok(self.execute_sync_plans(plans).await)
    }

    async fn resync(&self, asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
        info!("Starting resync for {:?}", asset_ids);

        let assets = match asset_ids {
            Some(ids) if !ids.is_empty() => self.asset_repo.list_by_symbols(&ids)?,
            _ => self.asset_repo.list()?,
        };

        // Filter to syncable assets
        let syncable: Vec<&Asset> = assets.iter().filter(|a| self.should_sync_asset(a)).collect();

        let today = Utc::now().date_naive();

        let plans: Vec<SymbolSyncPlan> = syncable
            .iter()
            .map(|asset| {
                let start_date = self
                    .sync_state_store
                    .get_by_asset_id(&asset.id)
                    .ok()
                    .flatten()
                    .and_then(|s| s.first_activity_date)
                    .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                    .unwrap_or_else(|| today - Duration::days(DEFAULT_HISTORY_DAYS));

                SymbolSyncPlan {
                    asset_id: asset.id.clone(),
                    category: SyncCategory::Active,
                    start_date,
                    end_date: today,
                    priority: 100,
                    data_source: asset
                        .preferred_provider
                        .clone()
                        .unwrap_or_else(|| DATA_SOURCE_YAHOO.to_string()),
                    quote_symbol: None,
                    currency: asset.currency.clone(),
                }
            })
            .collect();

        Ok(self.execute_sync_plans(plans).await)
    }

    async fn handle_activity_created(&self, asset_id: &AssetId, activity_date: Day) -> Result<()> {
        let symbol = asset_id.as_str();

        // Skip assets that don't need quote syncing (cash, FX)
        if symbol.is_empty() || is_cash_asset_id(symbol) || is_fx_asset_id(symbol) {
            return Ok(());
        }

        info!(
            "Handling new activity for {} on {}",
            symbol, activity_date.0
        );

        let existing = self.sync_state_store.get_by_asset_id(symbol)?;

        if let Some(mut state) = existing {
            // Check if we need backfill
            // Use QUOTE_HISTORY_BUFFER_DAYS + BACKFILL_SAFETY_MARGIN_DAYS for conservative detection
            let required_start =
                activity_date.0 - Duration::days(QUOTE_HISTORY_BUFFER_DAYS + BACKFILL_SAFETY_MARGIN_DAYS);
            let needs_backfill = state
                .earliest_quote_date
                .map(|earliest| required_start < earliest)
                .unwrap_or(true); // If no earliest_quote_date, assume backfill needed

            if needs_backfill {
                state.sync_priority = SyncCategory::NeedsBackfill.default_priority();
                debug!(
                    "Activity {} needs backfill: required_start={}, earliest_quote={:?}",
                    symbol, required_start, state.earliest_quote_date
                );
            }

            state.update_activity_dates(Some(activity_date.0), Some(activity_date.0));

            if !state.is_active {
                state.mark_active();
            }

            self.sync_state_store.upsert(&state).await?;
        } else {
            // Check if asset should be synced (only market-priced assets)
            if let Ok(asset) = self.asset_repo.get_by_id(symbol) {
                if asset.pricing_mode != PricingMode::Market {
                    return Ok(());
                }

                let mut state = QuoteSyncState::new(
                    symbol.to_string(),
                    asset
                        .preferred_provider
                        .unwrap_or_else(|| DATA_SOURCE_YAHOO.to_string()),
                );
                state.first_activity_date = Some(activity_date.0);
                state.last_activity_date = Some(activity_date.0);
                state.is_active = true;
                state.sync_priority = SyncCategory::New.default_priority();

                self.sync_state_store.upsert(&state).await?;
            }
        }

        Ok(())
    }

    async fn handle_activity_deleted(&self, asset_id: &AssetId) -> Result<()> {
        let symbol = asset_id.as_str();

        // Skip assets that don't need quote syncing (cash, FX)
        if symbol.is_empty() || is_cash_asset_id(symbol) || is_fx_asset_id(symbol) {
            return Ok(());
        }

        info!("Handling activity deletion for {}", symbol);

        // Refresh activity dates from the activities table
        // This will recalculate first_activity_date and last_activity_date
        // based on remaining activities for this asset
        if let Err(e) = self
            .sync_state_store
            .refresh_activity_dates_from_activities()
            .await
        {
            warn!("Failed to refresh activity dates after deletion: {:?}", e);
        }

        Ok(())
    }

    async fn refresh_sync_state(&self) -> Result<()> {
        self.refresh_sync_states().await
    }

    fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>> {
        self.generate_sync_plan()
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_result_summary() {
        let result = SyncResult {
            synced: 10,
            failed: 0,
            skipped: 2,
            quotes_synced: 100,
            errors: vec![],
            failures: vec![],
        };
        assert!(result.is_success());
        assert!(result.summary().contains("100"));

        let result_with_failures = SyncResult {
            synced: 5,
            failed: 1,
            skipped: 0,
            quotes_synced: 50,
            errors: vec![SyncError {
                asset_id: AssetId::new("AAPL"),
                message: "timeout".to_string(),
                provider_errors: vec![],
            }],
            failures: vec![("AAPL".to_string(), "timeout".to_string())],
        };
        assert!(!result_with_failures.is_success());
        assert!(result_with_failures.summary().contains("1 failures"));
    }

    #[test]
    fn test_sync_status() {
        assert_eq!(SyncStatus::Success, SyncStatus::Success);
        assert_ne!(SyncStatus::Success, SyncStatus::Failed);
    }

    #[test]
    fn test_asset_sync_result() {
        let result = AssetSyncResult {
            asset_id: AssetId::new("AAPL"),
            quotes_added: 10,
            status: SyncStatus::Success,
            error: None,
        };

        assert_eq!(result.asset_id.as_str(), "AAPL");
        assert_eq!(result.quotes_added, 10);
        assert_eq!(result.status, SyncStatus::Success);
        assert!(result.error.is_none());
    }
}
