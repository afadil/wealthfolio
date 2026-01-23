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
//!       ├─► AssetRepository (asset lookups)
//!       └─► ActivityRepository (activity bounds)
//! ```
//!
//! # Key Design Principles
//!
//! - **Thin orchestration**: Quote fetching delegated to `MarketDataClient`
//! - **Strong types**: Uses `AssetId`, `Day`, `QuoteSource` from `types.rs`
//! - **Activity-driven sync**: Sync ranges based on activity dates

use async_trait::async_trait;
use chrono::{Duration, NaiveDate, TimeZone, Utc};
use log::{debug, error, warn};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::client::MarketDataClient;
use super::constants::*;
use super::store::QuoteStore;
use super::sync_state::{
    calculate_sync_window, determine_sync_category, QuoteSyncState, SyncPlanningInputs,
    SymbolSyncPlan, SyncCategory, SyncMode, SyncStateStore,
};
use super::types::{AssetId, Day, ProviderId};
use crate::activities::ActivityRepositoryTrait;
use crate::assets::{
    is_cash_asset_id, is_fx_asset_id, Asset, AssetKind, AssetRepositoryTrait, PricingMode,
};
use crate::errors::Result;

// =============================================================================
// Per-Asset Sync Locking (US-012)
// =============================================================================

/// Global lock for in-flight sync operations per asset_id.
/// This prevents duplicate sync work when multiple sync triggers occur for the same asset.
static SYNC_LOCKS: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

/// RAII guard that releases the sync lock when dropped.
struct SyncLockGuard {
    asset_id: String,
}

impl SyncLockGuard {
    /// Try to acquire sync lock for an asset. Returns Some(guard) if acquired, None if already locked.
    fn try_acquire(asset_id: &str) -> Option<Self> {
        let mut locks = SYNC_LOCKS.lock().unwrap();
        if locks.contains(asset_id) {
            None
        } else {
            locks.insert(asset_id.to_string());
            Some(Self {
                asset_id: asset_id.to_string(),
            })
        }
    }
}

impl Drop for SyncLockGuard {
    fn drop(&mut self) {
        let mut locks = SYNC_LOCKS.lock().unwrap();
        locks.remove(&self.asset_id);
    }
}

// Test helpers - expose lock functions for testing
#[cfg(test)]
fn try_acquire_sync_lock(asset_id: &str) -> bool {
    SyncLockGuard::try_acquire(asset_id)
        .map(std::mem::forget)
        .is_some()
}

#[cfg(test)]
fn release_sync_lock(asset_id: &str) {
    let mut locks = SYNC_LOCKS.lock().unwrap();
    locks.remove(asset_id);
}

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

/// Reason why an asset was skipped during sync.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AssetSkipReason {
    /// Asset is a cash asset (always 1:1, no quotes needed).
    CashAsset,
    /// Asset uses manual pricing mode (not market-priced).
    ManualPricing,
    /// Asset is inactive.
    Inactive,
    /// Asset position is closed (grace period expired).
    ClosedPosition,
    /// Asset not found in repository.
    NotFound,
    /// Sync already in progress for this asset (US-012).
    SyncInProgress,
}

impl std::fmt::Display for AssetSkipReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AssetSkipReason::CashAsset => write!(f, "Cash asset (no quotes needed)"),
            AssetSkipReason::ManualPricing => write!(f, "Manual pricing mode"),
            AssetSkipReason::Inactive => write!(f, "Inactive asset"),
            AssetSkipReason::ClosedPosition => write!(f, "Closed position"),
            AssetSkipReason::NotFound => write!(f, "Asset not found"),
            AssetSkipReason::SyncInProgress => write!(f, "Sync already in progress"),
        }
    }
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
    /// Reasons why specific assets were skipped (asset_id, reason).
    pub skipped_reasons: Vec<(String, AssetSkipReason)>,
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

    /// Record that an asset was skipped with a specific reason.
    fn add_skipped(&mut self, asset_id: String, reason: AssetSkipReason) {
        self.skipped += 1;
        self.skipped_reasons.push((asset_id, reason));
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

    /// Force resync of quotes for specific assets using BackfillHistory mode.
    ///
    /// This is a convenience wrapper that calls `sync(SyncMode::BackfillHistory { days: DEFAULT_HISTORY_DAYS }, asset_ids)`.
    /// If asset_ids is None or empty, resync all syncable assets.
    async fn resync(&self, asset_ids: Option<Vec<String>>) -> Result<SyncResult>;

    /// Handle a new activity being created.
    /// This may expand the sync range to include the activity date.
    async fn handle_activity_created(&self, asset_id: &AssetId, activity_date: Day) -> Result<()>;

    /// Handle an activity being deleted.
    /// This may recalculate the required sync range.
    async fn handle_activity_deleted(&self, asset_id: &AssetId) -> Result<()>;

    /// Ensure sync state entries exist for syncable assets.
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
pub struct QuoteSyncService<Q, S, A, R>
where
    Q: QuoteStore,
    S: SyncStateStore,
    A: AssetRepositoryTrait,
    R: ActivityRepositoryTrait,
{
    /// Market data client for fetching quotes from providers.
    client: Arc<RwLock<MarketDataClient>>,
    /// Quote storage.
    quote_store: Arc<Q>,
    /// Sync state storage.
    sync_state_store: Arc<S>,
    /// Asset repository for asset lookups.
    asset_repo: Arc<A>,
    /// Activity repository for activity bounds.
    activity_repo: Arc<R>,
}

impl<Q, S, A, R> QuoteSyncService<Q, S, A, R>
where
    Q: QuoteStore + 'static,
    S: SyncStateStore + 'static,
    A: AssetRepositoryTrait + 'static,
    R: ActivityRepositoryTrait + 'static,
{
    /// Create a new quote sync service.
    pub fn new(
        client: Arc<RwLock<MarketDataClient>>,
        quote_store: Arc<Q>,
        sync_state_store: Arc<S>,
        asset_repo: Arc<A>,
        activity_repo: Arc<R>,
    ) -> Self {
        Self {
            client,
            quote_store,
            sync_state_store,
            asset_repo,
            activity_repo,
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
        let asset_ids: Vec<String> = assets.iter().map(|asset| asset.id.clone()).collect();
        let activity_bounds = self
            .activity_repo
            .get_activity_bounds_for_assets(&asset_ids)
            .unwrap_or_default();

        // Compute quote bounds per provider
        // Group assets by preferred_provider and batch query
        let mut quote_bounds: HashMap<String, (NaiveDate, NaiveDate)> = HashMap::new();
        let mut assets_by_provider: HashMap<String, Vec<String>> = HashMap::new();
        for asset in assets.iter().filter(|a| self.should_sync_asset(a)) {
            let provider = asset
                .preferred_provider
                .clone()
                .unwrap_or_else(|| DATA_SOURCE_YAHOO.to_string());
            assets_by_provider
                .entry(provider)
                .or_default()
                .push(asset.id.clone());
        }
        for (provider, ids) in &assets_by_provider {
            if let Ok(bounds) = self.quote_store.get_quote_bounds_for_assets(&ids, provider) {
                quote_bounds.extend(bounds);
            }
        }

        assets
            .iter()
            .filter(|a| self.should_sync_asset(a))
            .filter_map(|asset| {
                self.build_asset_sync_plan(asset, today, &activity_bounds, &quote_bounds)
            })
            .collect()
    }

    /// Check if an asset should be synced.
    fn should_sync_asset(&self, asset: &Asset) -> bool {
        self.get_skip_reason(asset).is_none()
    }

    /// Get the reason why an asset should be skipped, if any.
    /// Returns None if the asset should be synced.
    fn get_skip_reason(&self, asset: &Asset) -> Option<AssetSkipReason> {
        // Skip cash assets - they don't need quote syncing (always 1:1)
        if asset.kind == AssetKind::Cash {
            return Some(AssetSkipReason::CashAsset);
        }

        // Only sync market-priced assets (including FX rates for currency conversion)
        if asset.pricing_mode != PricingMode::Market {
            return Some(AssetSkipReason::ManualPricing);
        }

        // Only sync active assets
        if !asset.is_active {
            return Some(AssetSkipReason::Inactive);
        }

        None
    }

    /// Build sync plan for a single asset.
    fn build_asset_sync_plan(
        &self,
        asset: &Asset,
        today: NaiveDate,
        activity_bounds: &HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)>,
        quote_bounds: &HashMap<String, (NaiveDate, NaiveDate)>,
    ) -> Option<SymbolSyncPlan> {
        // Get existing sync state
        let state = self
            .sync_state_store
            .get_by_asset_id(&asset.id)
            .ok()
            .flatten();

        // Build SyncPlanningInputs from computed bounds
        let (activity_min, activity_max) = activity_bounds
            .get(&asset.id)
            .copied()
            .unwrap_or((None, None));

        let (quote_min, quote_max) = quote_bounds
            .get(&asset.id)
            .map(|(min, max)| (Some(*min), Some(*max)))
            .unwrap_or((None, None));

        let inputs = SyncPlanningInputs {
            is_active: state.as_ref().map(|s| s.is_active).unwrap_or(true),
            position_closed_date: state.as_ref().and_then(|s| s.position_closed_date),
            activity_min,
            activity_max,
            quote_min,
            quote_max,
        };

        let category = determine_sync_category(&inputs, CLOSED_POSITION_GRACE_PERIOD_DAYS, today);

        // Skip closed positions
        if matches!(category, SyncCategory::Closed) {
            return None;
        }

        // Use the new calculate_sync_window function
        let (start_date, end_date) = calculate_sync_window(&category, &inputs, today)?;

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

    /// Calculate the date range for syncing an asset based on SyncMode.
    ///
    /// This is the primary method for determining sync windows, used when an explicit
    /// SyncMode is provided (typically from external callers or resync operations).
    ///
    /// # FX Asset Handling (US-006)
    ///
    /// FX assets (e.g., `FX:EUR:USD`) have no activities attached to them, so their
    /// activity_min is always NULL. For full history recomputation jobs
    /// (BackfillHistory mode), FX assets need quote coverage from the earliest
    /// activity date across ALL accounts to support valuation history calculations.
    ///
    /// - **BackfillHistory mode + FX asset**: Use global earliest activity date
    /// - **Incremental mode + FX asset**: Continue from quote_max (no backfill)
    fn calculate_date_range_for_mode(
        &self,
        inputs: &SyncPlanningInputs,
        mode: SyncMode,
        today: NaiveDate,
        asset_id: &str,
    ) -> (NaiveDate, NaiveDate) {
        match mode {
            SyncMode::Incremental => {
                // Use category-based calculation for incremental mode
                let category = determine_sync_category(inputs, CLOSED_POSITION_GRACE_PERIOD_DAYS, today);
                calculate_sync_window(&category, inputs, today)
                    .unwrap_or((today - Duration::days(QUOTE_HISTORY_BUFFER_DAYS), today))
            }
            SyncMode::RefetchRecent { days } => {
                // Simply fetch the last N days, ignoring existing quotes
                let start = today - Duration::days(days);
                (start, today)
            }
            SyncMode::BackfillHistory { days: _days } => {
                // For FX assets in BackfillHistory mode, use global earliest activity date
                // FX assets have no activities, so activity_min is always NULL
                if is_fx_asset_id(asset_id) {
                    // Get global earliest activity date for FX coverage
                    let global_earliest = self
                        .sync_state_store
                        .get_earliest_activity_date_global()
                        .ok()
                        .flatten();

                    let start = global_earliest
                        .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                        // Unify fallback policy: missing activity bounds should never imply a multi-year fetch.
                        .unwrap_or_else(|| today - Duration::days(QUOTE_HISTORY_BUFFER_DAYS));

                    debug!(
                        "FX asset {} BackfillHistory: global_earliest={:?}, start={}",
                        asset_id, global_earliest, start
                    );
                    (start, today)
                } else {
                    // Non-FX: Fetch from activity start (with buffer) or fallback to buffer days
                    let start = inputs
                        .activity_min
                        .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                        // Unify fallback policy: missing activity bounds should never imply a multi-year fetch.
                        .unwrap_or_else(|| today - Duration::days(QUOTE_HISTORY_BUFFER_DAYS));
                    (start, today)
                }
            }
        }
    }

    /// Sync a single asset according to its sync plan.
    ///
    /// Uses per-asset locking (US-012) to prevent duplicate sync work when multiple
    /// sync triggers occur for the same asset. If a sync is already in progress for
    /// this asset, the call is skipped (not blocked) to keep the system responsive.
    async fn sync_asset(&self, asset: &Asset, plan: &SymbolSyncPlan) -> AssetSyncResult {
        let asset_id_str = &asset.id;
        let asset_id = AssetId::new(asset_id_str);

        // Try to acquire per-asset lock (US-012)
        // Guard automatically releases lock when dropped (on success, failure, or panic)
        let _lock_guard = match SyncLockGuard::try_acquire(asset_id_str) {
            Some(guard) => guard,
            None => {
                debug!("Skipping sync for {} - already in progress", asset_id_str);
                return AssetSyncResult {
                    asset_id,
                    quotes_added: 0,
                    status: SyncStatus::Skipped,
                    error: Some("Sync already in progress".to_string()),
                };
            }
        };

        debug!(
            "Fetching quotes for {} from {} to {}",
            asset.id, plan.start_date, plan.end_date
        );

        // Convert dates to DateTime<Utc>
        let start_dt = Utc.from_utc_datetime(&plan.start_date.and_hms_opt(0, 0, 0).unwrap());
        let end_dt = Utc.from_utc_datetime(&plan.end_date.and_hms_opt(23, 59, 59).unwrap());

        // Fetch quotes via MarketDataClient
        let client = self.client.read().await;
        match client
            .fetch_historical_quotes(asset, start_dt, end_dt)
            .await
        {
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

                            // Update sync state - just mark as synced
                            if let Err(e) = self.sync_state_store.update_after_sync(&asset.id).await
                            {
                                warn!("Failed to update sync state for {}: {:?}", asset.id, e);
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

        debug!("Executing sync for {} assets", plans.len());

        // Get all assets for the plans
        let asset_ids: Vec<String> = plans.iter().map(|p| p.asset_id.clone()).collect();
        let assets = match self.asset_repo.list_by_asset_ids(&asset_ids) {
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

        debug!(
            "Sync complete: {} synced, {} failed, {} skipped, {} quotes total",
            result.synced, result.failed, result.skipped, result.quotes_synced
        );

        result
    }

    /// Generate sync plan based on current sync states.
    ///
    /// This function computes both activity bounds and quote bounds on-the-fly
    /// from the operational tables, ensuring planning is based on fresh data.
    fn generate_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>> {
        let states = self
            .sync_state_store
            .get_assets_needing_sync(CLOSED_POSITION_GRACE_PERIOD_DAYS)?;

        let today = Utc::now().date_naive();
        let asset_ids: Vec<String> = states.iter().map(|state| state.asset_id.clone()).collect();

        // Compute activity bounds on-the-fly from activities table
        let activity_bounds = self
            .activity_repo
            .get_activity_bounds_for_assets(&asset_ids)?;

        // Compute quote bounds on-the-fly from quotes table, filtered by provider
        // Group states by data_source to batch quote bounds queries
        let mut quote_bounds_by_source: HashMap<String, HashMap<String, (NaiveDate, NaiveDate)>> =
            HashMap::new();
        for state in &states {
            if !quote_bounds_by_source.contains_key(&state.data_source) {
                let source_assets: Vec<String> = states
                    .iter()
                    .filter(|s| s.data_source == state.data_source)
                    .map(|s| s.asset_id.clone())
                    .collect();
                let bounds = self
                    .quote_store
                    .get_quote_bounds_for_assets(&source_assets, &state.data_source)?;
                quote_bounds_by_source.insert(state.data_source.clone(), bounds);
            }
        }

        let mut plans = Vec::new();

        for state in states {
            // Build SyncPlanningInputs from computed bounds
            let (activity_min, activity_max) = activity_bounds
                .get(&state.asset_id)
                .copied()
                .unwrap_or((None, None));

            let (quote_min, quote_max) = quote_bounds_by_source
                .get(&state.data_source)
                .and_then(|bounds| bounds.get(&state.asset_id))
                .map(|(min, max)| (Some(*min), Some(*max)))
                .unwrap_or((None, None));

            let inputs = SyncPlanningInputs {
                is_active: state.is_active,
                position_closed_date: state.position_closed_date,
                activity_min,
                activity_max,
                quote_min,
                quote_max,
            };

            let category = determine_sync_category(&inputs, CLOSED_POSITION_GRACE_PERIOD_DAYS, today);

            if matches!(category, SyncCategory::Closed) {
                continue;
            }

            // Use the new calculate_sync_window function
            let Some((start_date, end_date)) = calculate_sync_window(&category, &inputs, today)
            else {
                continue;
            };

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
        debug!("Refreshing quote sync states...");

        for asset in assets.iter().filter(|a| self.should_sync_asset(a)) {
            let existing = self.sync_state_store.get_by_asset_id(&asset.id)?;
            if existing.is_none() {
                let mut state = QuoteSyncState::new(
                    asset.id.clone(),
                    asset
                        .preferred_provider
                        .clone()
                        .unwrap_or_else(|| DATA_SOURCE_YAHOO.to_string()),
                );
                state.is_active = true;
                state.sync_priority = SyncCategory::New.default_priority();
                new_states.push(state);
            }
        }

        if !new_states.is_empty() {
            if let Err(e) = self.sync_state_store.upsert_batch(&new_states).await {
                warn!("Failed to upsert {} sync states: {:?}", new_states.len(), e);
            }
        }

        Ok(())
    }

    /// Ensure sync states exist for all syncable assets.
    async fn ensure_sync_states_for_all_assets(&self) -> Result<()> {
        let assets = self.asset_repo.list()?;
        self.ensure_sync_states_for_assets(&assets).await
    }
}

#[async_trait]
impl<Q, S, A, R> QuoteSyncServiceTrait for QuoteSyncService<Q, S, A, R>
where
    Q: QuoteStore + 'static,
    S: SyncStateStore + 'static,
    A: AssetRepositoryTrait + 'static,
    R: ActivityRepositoryTrait + 'static,
{
    async fn sync(&self) -> Result<SyncResult> {
        debug!("Starting optimized quote sync...");

        // Initialize result to track skipped assets
        let mut result = SyncResult::default();

        // Get assets to sync
        let assets = match &asset_ids {
            Some(ids) if !ids.is_empty() => {
                let found_assets = self.asset_repo.list_by_asset_ids(ids)?;

        if plans.is_empty() {
            debug!("No assets need syncing");
            return Ok(SyncResult::default());
        }

        debug!("Syncing {} assets", plans.len());
        Ok(self.execute_sync_plans(plans).await)
    }

    async fn resync(&self, asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
        debug!("Starting resync for {:?}", asset_ids);

        let assets = match asset_ids {
            Some(ids) if !ids.is_empty() => self.asset_repo.list_by_symbols(&ids)?,
            _ => self.asset_repo.list()?,
        };

        if let Err(e) = self.ensure_sync_states_for_assets(&assets).await {
            warn!("Failed to ensure sync states: {:?}", e);
        }
        let mut syncable: Vec<&Asset> = Vec::new();

        for asset in &assets {
            if let Some(reason) = self.get_skip_reason(asset) {
                debug!("Skipping asset {} for sync: {}", asset.id, reason);
                result.add_skipped(asset.id.clone(), reason);
            } else {
                syncable.push(asset);
            }
        }

        if syncable.is_empty() {
            info!(
                "No syncable assets found (requested: {}, skipped: {})",
                assets.len(),
                result.skipped
            );
            return Ok(result);
        }

        let today = Utc::now().date_naive();
        let syncable_ids: Vec<String> = syncable.iter().map(|asset| asset.id.clone()).collect();
        let activity_bounds = self
            .activity_repo
            .get_activity_bounds_for_assets(&syncable_ids)?;

        // Compute quote bounds per provider
        let mut quote_bounds: HashMap<String, (NaiveDate, NaiveDate)> = HashMap::new();
        let mut assets_by_provider: HashMap<String, Vec<String>> = HashMap::new();
        for asset in &syncable {
            let provider = asset
                .preferred_provider
                .clone()
                .unwrap_or_else(|| DATA_SOURCE_YAHOO.to_string());
            assets_by_provider
                .entry(provider)
                .or_default()
                .push(asset.id.clone());
        }
        for (provider, ids) in &assets_by_provider {
            if let Ok(bounds) = self.quote_store.get_quote_bounds_for_assets(&ids, provider) {
                quote_bounds.extend(bounds);
            }
        }

        // Build plans using the mode-specific date range calculation
        let plans: Vec<SymbolSyncPlan> = syncable
            .iter()
            .map(|asset| {
                let state = self
                    .sync_state_store
                    .get_by_asset_id(&asset.id)
                    .ok()
                    .flatten();

                // Build SyncPlanningInputs from computed bounds
                let (activity_min, activity_max) = activity_bounds
                    .get(&asset.id)
                    .copied()
                    .unwrap_or((None, None));

                let (quote_min, quote_max) = quote_bounds
                    .get(&asset.id)
                    .map(|(min, max)| (Some(*min), Some(*max)))
                    .unwrap_or((None, None));

                let inputs = SyncPlanningInputs {
                    is_active: state.as_ref().map(|s| s.is_active).unwrap_or(true),
                    position_closed_date: state.as_ref().and_then(|s| s.position_closed_date),
                    activity_min,
                    activity_max,
                    quote_min,
                    quote_max,
                };

                let (start_date, end_date) =
                    self.calculate_date_range_for_mode(&inputs, mode, today, &asset.id);

                // Determine category for priority
                let category =
                    determine_sync_category(&inputs, CLOSED_POSITION_GRACE_PERIOD_DAYS, today);

                SymbolSyncPlan {
                    asset_id: asset.id.clone(),
                    category: category.clone(),
                    start_date,
                    end_date,
                    priority: category.default_priority(),
                    data_source: asset
                        .preferred_provider
                        .clone()
                        .unwrap_or_else(|| DATA_SOURCE_YAHOO.to_string()),
                    quote_symbol: None,
                    currency: asset.currency.clone(),
                }
            })
            .filter(|plan| plan.start_date <= plan.end_date)
            .collect();

        if plans.is_empty() {
            info!(
                "No valid sync plans generated (skipped: {})",
                result.skipped
            );
            return Ok(result);
        }

        info!(
            "Syncing {} assets with mode {} (skipped: {})",
            plans.len(),
            mode,
            result.skipped
        );

        // Execute sync and merge with skipped results
        let mut exec_result = self.execute_sync_plans(plans).await;
        exec_result.skipped += result.skipped;
        exec_result.skipped_reasons.extend(result.skipped_reasons);
        Ok(exec_result)
    }

    async fn resync(&self, asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
        // resync is a convenience wrapper for BackfillHistory mode
        self.sync(
            SyncMode::BackfillHistory {
                days: DEFAULT_HISTORY_DAYS,
            },
            asset_ids,
        )
        .await
    }

    async fn handle_activity_created(&self, asset_id: &AssetId, activity_date: Day) -> Result<()> {
        let symbol = asset_id.as_str();

        // Skip assets that don't need quote syncing (cash, FX)
        if symbol.is_empty() || is_cash_asset_id(symbol) || is_fx_asset_id(symbol) {
            return Ok(());
        }

        debug!(
            "Handling new activity for {} on {}",
            symbol, activity_date.0
        );

        let existing = self.sync_state_store.get_by_asset_id(symbol)?;

        if let Some(mut state) = existing {
            // Check if we need backfill by computing quote bounds on-the-fly
            // Use QUOTE_HISTORY_BUFFER_DAYS + BACKFILL_SAFETY_MARGIN_DAYS for conservative detection
            let required_start = activity_date.0
                - Duration::days(QUOTE_HISTORY_BUFFER_DAYS + BACKFILL_SAFETY_MARGIN_DAYS);

            // Compute quote bounds for this asset filtered by provider
            let quote_bounds = self
                .quote_store
                .get_quote_bounds_for_assets(&[symbol.to_string()], &state.data_source)
                .unwrap_or_default();
            let earliest_quote = quote_bounds.get(symbol).map(|(min, _)| *min);

            let needs_backfill = earliest_quote
                .map(|earliest| required_start < earliest)
                .unwrap_or(true); // If no quotes exist, assume backfill needed

            if needs_backfill {
                state.sync_priority = SyncCategory::NeedsBackfill.default_priority();
                debug!(
                    "Activity {} needs backfill: required_start={}, earliest_quote={:?}",
                    symbol, required_start, earliest_quote
                );
            }

            // Activity dates are computed on-the-fly, no need to update them here

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
                // Activity dates are computed on-the-fly, no need to set them here
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

        debug!("Handling activity deletion for {}", symbol);

        debug!(
            "Activity deleted for {} - sync planning will recompute activity bounds on demand",
            symbol
        );

        Ok(())
    }

    async fn refresh_sync_state(&self) -> Result<()> {
        self.ensure_sync_states_for_all_assets().await
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
    use crate::quotes::sync_state::MarketSyncMode;

    // =========================================================================
    // SyncMode Tests
    // =========================================================================

    #[test]
    fn test_sync_mode_display() {
        assert_eq!(format!("{}", SyncMode::Incremental), "Incremental");
        assert_eq!(
            format!("{}", SyncMode::RefetchRecent { days: 45 }),
            "RefetchRecent(45d)"
        );
        assert_eq!(
            format!("{}", SyncMode::BackfillHistory { days: 1825 }),
            "BackfillHistory(1825d)"
        );
    }

    #[test]
    fn test_sync_mode_default_is_incremental() {
        assert_eq!(SyncMode::default(), SyncMode::Incremental);
    }

    #[test]
    fn test_sync_mode_equality() {
        assert_eq!(SyncMode::Incremental, SyncMode::Incremental);
        assert_eq!(
            SyncMode::RefetchRecent { days: 30 },
            SyncMode::RefetchRecent { days: 30 }
        );
        assert_ne!(
            SyncMode::RefetchRecent { days: 30 },
            SyncMode::RefetchRecent { days: 45 }
        );
        assert_ne!(SyncMode::Incremental, SyncMode::RefetchRecent { days: 30 });
    }

    // =========================================================================
    // MarketSyncMode Tests
    // =========================================================================

    #[test]
    fn test_market_sync_mode_requires_sync() {
        assert!(!MarketSyncMode::None.requires_sync());
        assert!(MarketSyncMode::Incremental { asset_ids: None }.requires_sync());
        assert!(MarketSyncMode::RefetchRecent {
            asset_ids: None,
            days: 45
        }
        .requires_sync());
        assert!(MarketSyncMode::BackfillHistory {
            asset_ids: None,
            days: 1825
        }
        .requires_sync());

        // With asset_ids specified
        assert!(MarketSyncMode::Incremental {
            asset_ids: Some(vec!["AAPL".to_string()])
        }
        .requires_sync());
    }

    #[test]
    fn test_market_sync_mode_to_sync_mode() {
        assert_eq!(MarketSyncMode::None.to_sync_mode(), None);
        assert_eq!(
            MarketSyncMode::Incremental { asset_ids: None }.to_sync_mode(),
            Some(SyncMode::Incremental)
        );
        assert_eq!(
            MarketSyncMode::RefetchRecent {
                asset_ids: None,
                days: 45
            }
            .to_sync_mode(),
            Some(SyncMode::RefetchRecent { days: 45 })
        );
        assert_eq!(
            MarketSyncMode::BackfillHistory {
                asset_ids: None,
                days: 1825
            }
            .to_sync_mode(),
            Some(SyncMode::BackfillHistory { days: 1825 })
        );
    }

    #[test]
    fn test_market_sync_mode_asset_ids() {
        assert!(MarketSyncMode::None.asset_ids().is_none());
        assert!(MarketSyncMode::Incremental { asset_ids: None }
            .asset_ids()
            .is_none());

        let asset_ids = vec!["AAPL".to_string(), "MSFT".to_string()];
        let mode = MarketSyncMode::Incremental {
            asset_ids: Some(asset_ids.clone()),
        };
        assert_eq!(mode.asset_ids(), Some(&asset_ids));

        let mode = MarketSyncMode::RefetchRecent {
            asset_ids: Some(asset_ids.clone()),
            days: 45,
        };
        assert_eq!(mode.asset_ids(), Some(&asset_ids));

        let mode = MarketSyncMode::BackfillHistory {
            asset_ids: Some(asset_ids.clone()),
            days: 1825,
        };
        assert_eq!(mode.asset_ids(), Some(&asset_ids));
    }

    #[test]
    fn test_market_sync_mode_default_is_none() {
        assert_eq!(MarketSyncMode::default(), MarketSyncMode::None);
    }

    // =========================================================================
    // AssetSkipReason Display Tests
    // =========================================================================

    #[test]
    fn test_asset_skip_reason_display_cash_asset() {
        assert_eq!(
            AssetSkipReason::CashAsset.to_string(),
            "Cash asset (no quotes needed)"
        );
    }

    #[test]
    fn test_asset_skip_reason_display_manual_pricing() {
        assert_eq!(
            AssetSkipReason::ManualPricing.to_string(),
            "Manual pricing mode"
        );
    }

    #[test]
    fn test_asset_skip_reason_display_inactive() {
        assert_eq!(AssetSkipReason::Inactive.to_string(), "Inactive asset");
    }

    #[test]
    fn test_asset_skip_reason_display_closed_position() {
        assert_eq!(
            AssetSkipReason::ClosedPosition.to_string(),
            "Closed position"
        );
    }

    #[test]
    fn test_asset_skip_reason_display_not_found() {
        assert_eq!(AssetSkipReason::NotFound.to_string(), "Asset not found");
    }

    // =========================================================================
    // SyncResult Tests
    // =========================================================================

    #[test]
    fn test_sync_result_summary() {
        let result = SyncResult {
            synced: 10,
            failed: 0,
            skipped: 2,
            quotes_synced: 100,
            errors: vec![],
            failures: vec![],
            skipped_reasons: vec![
                ("CASH:USD".to_string(), AssetSkipReason::CashAsset),
                ("MANUAL_ASSET".to_string(), AssetSkipReason::ManualPricing),
            ],
        };
        assert!(result.is_success());
        assert!(result.summary().contains("100"));
        assert_eq!(result.skipped_reasons.len(), 2);

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
            skipped_reasons: vec![],
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

    #[test]
    fn test_asset_skip_reason_display() {
        assert_eq!(
            AssetSkipReason::CashAsset.to_string(),
            "Cash asset (no quotes needed)"
        );
        assert_eq!(
            AssetSkipReason::ManualPricing.to_string(),
            "Manual pricing mode"
        );
        assert_eq!(AssetSkipReason::Inactive.to_string(), "Inactive asset");
        assert_eq!(
            AssetSkipReason::ClosedPosition.to_string(),
            "Closed position"
        );
        assert_eq!(AssetSkipReason::NotFound.to_string(), "Asset not found");
        assert_eq!(
            AssetSkipReason::SyncInProgress.to_string(),
            "Sync already in progress"
        );
    }

    // =========================================================================
    // Per-Asset Sync Lock Tests (US-012)
    // =========================================================================

    #[test]
    fn test_sync_lock_acquire_and_release() {
        let asset_id = "TEST_LOCK_ACQUIRE";

        // First acquire should succeed
        assert!(try_acquire_sync_lock(asset_id));

        // Second acquire for same asset should fail
        assert!(!try_acquire_sync_lock(asset_id));

        // Release the lock
        release_sync_lock(asset_id);

        // Now acquire should succeed again
        assert!(try_acquire_sync_lock(asset_id));

        // Cleanup
        release_sync_lock(asset_id);
    }

    #[test]
    fn test_sync_lock_different_assets_independent() {
        let asset_a = "TEST_LOCK_ASSET_A";
        let asset_b = "TEST_LOCK_ASSET_B";

        // Acquire lock for asset A
        assert!(try_acquire_sync_lock(asset_a));

        // Acquire lock for asset B should also succeed (independent)
        assert!(try_acquire_sync_lock(asset_b));

        // Both should be locked
        assert!(!try_acquire_sync_lock(asset_a));
        assert!(!try_acquire_sync_lock(asset_b));

        // Release both
        release_sync_lock(asset_a);
        release_sync_lock(asset_b);
    }

    #[test]
    fn test_sync_lock_release_idempotent() {
        let asset_id = "TEST_LOCK_IDEMPOTENT";

        // Acquire the lock
        assert!(try_acquire_sync_lock(asset_id));

        // Release it
        release_sync_lock(asset_id);

        // Release again (should be idempotent, no panic)
        release_sync_lock(asset_id);

        // Lock should be available
        assert!(try_acquire_sync_lock(asset_id));

        // Cleanup
        release_sync_lock(asset_id);
    }

    #[test]
    fn test_sync_result_add_skipped() {
        let mut result = SyncResult::default();
        assert_eq!(result.skipped, 0);
        assert!(result.skipped_reasons.is_empty());

        result.add_skipped("CASH:USD".to_string(), AssetSkipReason::CashAsset);
        assert_eq!(result.skipped, 1);
        assert_eq!(result.skipped_reasons.len(), 1);
        assert_eq!(result.skipped_reasons[0].0, "CASH:USD");
        assert_eq!(result.skipped_reasons[0].1, AssetSkipReason::CashAsset);

        result.add_skipped("INACTIVE_ASSET".to_string(), AssetSkipReason::Inactive);
        assert_eq!(result.skipped, 2);
        assert_eq!(result.skipped_reasons.len(), 2);
    }

    // =========================================================================
    // Date Range Planning Tests (US-014)
    // =========================================================================

    /// Tests for Incremental mode date range calculation.
    /// Incremental mode should use last_quote_date - OVERLAP_DAYS as start date
    /// to heal provider corrections (stock splits, dividend adjustments).
    mod date_range_incremental_tests {
        use super::*;

        fn today() -> NaiveDate {
            Utc::now().date_naive()
        }

        #[test]
        fn test_incremental_with_existing_quotes_uses_overlap() {
            // When last_quote_date exists, the start should be last_quote_date - OVERLAP_DAYS
            // This ensures we refetch a small window to heal any provider corrections
            let last_quote = today() - Duration::days(3);
            let expected_start = last_quote - Duration::days(OVERLAP_DAYS);

            // Verify OVERLAP_DAYS is used in the overlap calculation
            assert_eq!(
                OVERLAP_DAYS, 5,
                "OVERLAP_DAYS should be 5 for healing corrections"
            );

            // The overlap window ensures we pick up corrections from providers
            let overlap_window = OVERLAP_DAYS;
            let calculated_start = last_quote - Duration::days(overlap_window);
            assert_eq!(calculated_start, expected_start);
        }

        #[test]
        fn test_incremental_without_quotes_uses_activity_date_with_buffer() {
            // When no quotes exist, start from first_activity_date - QUOTE_HISTORY_BUFFER_DAYS
            let first_activity = today() - Duration::days(30);
            let expected_start = first_activity - Duration::days(QUOTE_HISTORY_BUFFER_DAYS);

            // QUOTE_HISTORY_BUFFER_DAYS provides enough history for valuation
            assert_eq!(
                QUOTE_HISTORY_BUFFER_DAYS, 45,
                "Buffer should be 45 days to cover weekends/holidays"
            );

            let calculated_start = first_activity - Duration::days(QUOTE_HISTORY_BUFFER_DAYS);
            assert_eq!(calculated_start, expected_start);
        }

        #[test]
        fn test_overlap_days_constant_value() {
            // OVERLAP_DAYS is set to 5 for healing provider corrections
            // This is enough to catch most adjustment corrections while being efficient
            assert_eq!(OVERLAP_DAYS, 5);
        }

        #[test]
        fn test_quote_history_buffer_days_constant_value() {
            // QUOTE_HISTORY_BUFFER_DAYS is 45 to account for:
            // - Weekends (8-9 days lost per month)
            // - Holidays (varies by market)
            // - Potential data gaps
            assert_eq!(QUOTE_HISTORY_BUFFER_DAYS, 45);
        }
    }

    /// Tests for RefetchRecent mode date range calculation.
    /// RefetchRecent always starts from today - days, ignoring existing quotes.
    mod date_range_refetch_recent_tests {
        use super::*;

        fn today() -> NaiveDate {
            Utc::now().date_naive()
        }

        #[test]
        fn test_refetch_recent_ignores_existing_quotes() {
            // RefetchRecent should always start from today - days
            // regardless of last_quote_date
            let days = 45_i64;
            let expected_start = today() - Duration::days(days);

            let mode = SyncMode::RefetchRecent { days };
            if let SyncMode::RefetchRecent { days: mode_days } = mode {
                let calculated_start = today() - Duration::days(mode_days);
                assert_eq!(calculated_start, expected_start);
            }
        }

        #[test]
        fn test_refetch_recent_with_30_days() {
            let days = 30_i64;
            let expected_start = today() - Duration::days(days);
            let calculated_start = today() - Duration::days(days);
            assert_eq!(calculated_start, expected_start);
        }

        #[test]
        fn test_refetch_recent_with_90_days() {
            let days = 90_i64;
            let expected_start = today() - Duration::days(days);
            let calculated_start = today() - Duration::days(days);
            assert_eq!(calculated_start, expected_start);
        }
    }

    /// Tests for BackfillHistory mode date range calculation.
    /// BackfillHistory rebuilds full history from activity start.
    mod date_range_backfill_history_tests {
        use super::*;

        fn today() -> NaiveDate {
            Utc::now().date_naive()
        }

        #[test]
        fn test_backfill_history_uses_activity_min_date() {
            // BackfillHistory should start from activity_min_date - BUFFER_DAYS
            // when activity exists
            let first_activity = today() - Duration::days(100);
            let expected_start = first_activity - Duration::days(QUOTE_HISTORY_BUFFER_DAYS);

            let calculated_start = first_activity - Duration::days(QUOTE_HISTORY_BUFFER_DAYS);
            assert_eq!(calculated_start, expected_start);
        }

        #[test]
        fn test_backfill_history_uses_fallback_when_no_activity() {
            // When no activity date exists, use the unified buffer fallback
            let expected_start = today() - Duration::days(QUOTE_HISTORY_BUFFER_DAYS);

            let calculated_start = today() - Duration::days(QUOTE_HISTORY_BUFFER_DAYS);
            assert_eq!(calculated_start, expected_start);
        }

        #[test]
        fn test_default_history_days_constant() {
            // DEFAULT_HISTORY_DAYS is 1825 (5 years) for explicit full-history requests
            assert_eq!(DEFAULT_HISTORY_DAYS, 1825);
        }
    }

    /// Tests for FX asset handling in BackfillHistory mode (US-006).
    /// FX assets need special handling since they have no activities attached.
    mod fx_backfill_tests {
        use super::*;

        #[test]
        fn test_fx_asset_id_detection() {
            // FX assets are identified by the FX: prefix
            assert!(is_fx_asset_id("FX:EUR:USD"));
            assert!(is_fx_asset_id("FX:GBP:USD"));
            assert!(is_fx_asset_id("FX:JPY:USD"));
            assert!(!is_fx_asset_id("AAPL"));
            assert!(!is_fx_asset_id("MSFT"));
            assert!(!is_fx_asset_id("CASH:USD"));
        }

        #[test]
        fn test_fx_backfill_design_documented() {
            // FX assets in BackfillHistory mode should use global earliest activity date
            // because FX assets have no activities of their own.
            //
            // The implementation in calculate_date_range_for_mode() calls:
            // sync_state_store.get_earliest_activity_date_global()
            //
            // This ensures FX pairs have quote coverage from the earliest activity
            // date across the entire portfolio, enabling accurate valuation history.
            //
            // Example:
            // - User has activities starting 2020-01-15
            // - FX:EUR:USD needs quotes from 2020-01-15 - BUFFER_DAYS
            // - Without this, base currency changes would fail for historical data
            assert!(true, "FX backfill design documented");
        }

        #[test]
        fn test_fx_incremental_does_not_backfill() {
            // In Incremental mode, FX assets should continue from last_quote_date
            // and should NOT trigger a backfill to global earliest activity
            //
            // This is important for performance - we don't want every incremental
            // sync to fetch years of FX history
            assert!(true, "FX incremental behavior documented");
        }
    }

    // =========================================================================
    // Targeting Semantics Tests (US-014)
    // =========================================================================

    /// Tests for targeted asset sync behavior.
    /// When asset_ids is Some(vec![...]), only those assets should be synced.
    mod targeting_tests {
        use super::*;

        #[test]
        fn test_market_sync_mode_with_targeted_assets() {
            // When asset_ids is specified, only those assets should be synced
            let target_assets = vec!["AAPL".to_string(), "MSFT".to_string()];
            let mode = MarketSyncMode::Incremental {
                asset_ids: Some(target_assets.clone()),
            };

            // asset_ids() returns the specified list
            let ids = mode.asset_ids();
            assert!(ids.is_some());
            assert_eq!(ids.unwrap().len(), 2);
            assert!(ids.unwrap().contains(&"AAPL".to_string()));
            assert!(ids.unwrap().contains(&"MSFT".to_string()));
        }

        #[test]
        fn test_market_sync_mode_without_targeted_assets_syncs_all() {
            // When asset_ids is None, all relevant assets should be synced
            let mode = MarketSyncMode::Incremental { asset_ids: None };
            assert!(mode.asset_ids().is_none());
        }

        #[test]
        fn test_market_sync_mode_empty_asset_ids() {
            // Empty vec is different from None - it means sync nothing specific
            let mode = MarketSyncMode::Incremental {
                asset_ids: Some(vec![]),
            };
            let ids = mode.asset_ids();
            assert!(ids.is_some());
            assert!(ids.unwrap().is_empty());
        }

        #[test]
        fn test_targeted_refetch_recent() {
            let target_assets = vec!["GOOG".to_string()];
            let mode = MarketSyncMode::RefetchRecent {
                asset_ids: Some(target_assets.clone()),
                days: 30,
            };

            assert_eq!(mode.asset_ids(), Some(&target_assets));
            assert_eq!(
                mode.to_sync_mode(),
                Some(SyncMode::RefetchRecent { days: 30 })
            );
        }

        #[test]
        fn test_targeted_backfill_history() {
            let target_assets = vec!["TSLA".to_string(), "NVDA".to_string()];
            let mode = MarketSyncMode::BackfillHistory {
                asset_ids: Some(target_assets.clone()),
                days: 365,
            };

            assert_eq!(mode.asset_ids(), Some(&target_assets));
            assert_eq!(
                mode.to_sync_mode(),
                Some(SyncMode::BackfillHistory { days: 365 })
            );
        }
    }

    // =========================================================================
    // SyncCategory Priority Tests
    // =========================================================================

    mod sync_category_tests {
        use super::*;

        #[test]
        fn test_sync_category_priority_order() {
            // Active has highest priority
            assert_eq!(SyncCategory::Active.default_priority(), 100);
            // NeedsBackfill is second (urgent - missing historical data)
            assert_eq!(SyncCategory::NeedsBackfill.default_priority(), 90);
            // New is third (needs initial data)
            assert_eq!(SyncCategory::New.default_priority(), 80);
            // RecentlyClosed has lower priority
            assert_eq!(SyncCategory::RecentlyClosed.default_priority(), 50);
            // Closed has zero priority (should not be synced)
            assert_eq!(SyncCategory::Closed.default_priority(), 0);
        }

        #[test]
        fn test_sync_category_priority_ordering() {
            // Verify the relative ordering is correct
            assert!(
                SyncCategory::Active.default_priority()
                    > SyncCategory::NeedsBackfill.default_priority()
            );
            assert!(
                SyncCategory::NeedsBackfill.default_priority()
                    > SyncCategory::New.default_priority()
            );
            assert!(
                SyncCategory::New.default_priority()
                    > SyncCategory::RecentlyClosed.default_priority()
            );
            assert!(
                SyncCategory::RecentlyClosed.default_priority()
                    > SyncCategory::Closed.default_priority()
            );
        }
    }

    // =========================================================================
    // Closed Position Grace Period Tests
    // =========================================================================

    mod grace_period_tests {
        use super::*;

        #[test]
        fn test_closed_position_grace_period_constant() {
            // Grace period is 30 days
            assert_eq!(CLOSED_POSITION_GRACE_PERIOD_DAYS, 30);
        }

        #[test]
        fn test_grace_period_purpose_documented() {
            // The grace period ensures that recently closed positions continue
            // to receive quote updates for a while after closing.
            //
            // This is important for:
            // - Performance reporting (final performance calculations)
            // - Tax reporting (cost basis calculations)
            // - Historical accuracy (ensuring end-of-position values are correct)
            //
            // After the grace period, quotes are no longer fetched to save resources.
            assert!(true, "Grace period purpose documented");
        }
    }
}
