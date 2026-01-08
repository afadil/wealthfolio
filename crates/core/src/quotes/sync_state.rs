//! Quote sync state models and traits.
//!
//! This module contains the domain models for tracking quote synchronization state,
//! including sync categories, sync plans, and the repository trait for persistence.

use async_trait::async_trait;
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::errors::Result;

/// Sync category determines how a symbol should be synced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncCategory {
    /// Active position - sync from last_quote_date to today
    Active,
    /// New symbol - needs full history from first_activity_date - buffer days
    New,
    /// Activity date moved to past - needs quotes before earliest_quote_date
    NeedsBackfill,
    /// Closed within grace period - continue syncing for N days after close
    RecentlyClosed,
    /// Closed beyond grace period - skip syncing
    Closed,
}

impl SyncCategory {
    /// Get the default priority for this category.
    pub fn default_priority(&self) -> i32 {
        match self {
            SyncCategory::Active => 100,
            SyncCategory::NeedsBackfill => 90,
            SyncCategory::New => 80,
            SyncCategory::RecentlyClosed => 50,
            SyncCategory::Closed => 0,
        }
    }
}

/// Plan for syncing a specific symbol.
#[derive(Debug, Clone)]
pub struct SymbolSyncPlan {
    pub symbol: String,
    pub category: SyncCategory,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub priority: i32,
    pub data_source: String,
    /// Symbol used for quote fetching (may differ from asset symbol).
    pub quote_symbol: Option<String>,
    pub currency: String,
}

/// Domain model for quote sync state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSyncState {
    pub symbol: String,
    pub is_active: bool,
    pub first_activity_date: Option<NaiveDate>,
    pub last_activity_date: Option<NaiveDate>,
    pub position_closed_date: Option<NaiveDate>,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub last_quote_date: Option<NaiveDate>,
    pub earliest_quote_date: Option<NaiveDate>,
    pub data_source: String,
    pub sync_priority: i32,
    pub error_count: i32,
    pub last_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl QuoteSyncState {
    /// Buffer days to fetch quotes before the first activity date.
    /// Should match QUOTE_HISTORY_BUFFER_DAYS from constants.rs.
    const QUOTE_HISTORY_BUFFER_DAYS: i64 = 45;

    /// Additional safety margin for backfill detection.
    /// Should match BACKFILL_SAFETY_MARGIN_DAYS from constants.rs.
    const BACKFILL_SAFETY_MARGIN_DAYS: i64 = 7;

    /// Create a new sync state for a symbol.
    pub fn new(symbol: String, data_source: String) -> Self {
        let now = Utc::now();
        QuoteSyncState {
            symbol,
            is_active: true,
            first_activity_date: None,
            last_activity_date: None,
            position_closed_date: None,
            last_synced_at: None,
            last_quote_date: None,
            earliest_quote_date: None,
            data_source,
            sync_priority: SyncCategory::New.default_priority(),
            error_count: 0,
            last_error: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Determine the sync category based on current state.
    pub fn determine_category(&self, grace_period_days: i64) -> SyncCategory {
        let today = Utc::now().date_naive();

        // FIRST: Check for NEW assets - has activities but no quotes yet
        // This takes precedence because we need quotes regardless of is_active status
        // (is_active might be false simply because no snapshot exists yet for new assets)
        if self.first_activity_date.is_some() && self.earliest_quote_date.is_none() {
            return SyncCategory::New;
        }

        // Check if needs backfill (activity date - buffer - safety margin before earliest quote)
        // This also applies regardless of is_active status
        // Use safety margin to be conservative and avoid edge cases
        if let (Some(first_activity), Some(earliest_quote)) =
            (self.first_activity_date, self.earliest_quote_date)
        {
            let required_start = first_activity
                - Duration::days(Self::QUOTE_HISTORY_BUFFER_DAYS + Self::BACKFILL_SAFETY_MARGIN_DAYS);
            if required_start < earliest_quote {
                return SyncCategory::NeedsBackfill;
            }
        }

        // Check if symbol has open position
        if self.is_active {
            return SyncCategory::Active;
        }

        // Position is closed - check grace period
        if let Some(closed_date) = self.position_closed_date {
            let days_since_close = (today - closed_date).num_days();
            if days_since_close <= grace_period_days {
                return SyncCategory::RecentlyClosed;
            }
        }

        // Fallback: check last_activity_date for recently closed without explicit closed_date
        // This handles cases where position was closed but closed_date wasn't set
        if let Some(last_activity) = self.last_activity_date {
            let days_since_activity = (today - last_activity).num_days();
            if days_since_activity <= grace_period_days {
                return SyncCategory::RecentlyClosed;
            }
        }

        SyncCategory::Closed
    }

    /// Mark as synced successfully.
    pub fn mark_synced(&mut self, last_quote_date: NaiveDate) {
        self.last_synced_at = Some(Utc::now());
        self.last_quote_date = Some(last_quote_date);
        self.error_count = 0;
        self.last_error = None;
        self.updated_at = Utc::now();
    }

    /// Mark sync as failed.
    pub fn mark_sync_failed(&mut self, error: String) {
        self.error_count += 1;
        self.last_error = Some(error);
        self.updated_at = Utc::now();
    }

    /// Update activity dates.
    pub fn update_activity_dates(
        &mut self,
        first_date: Option<NaiveDate>,
        last_date: Option<NaiveDate>,
    ) {
        // Only update if the new first date is earlier
        if let Some(new_first) = first_date {
            match self.first_activity_date {
                Some(existing) if new_first < existing => {
                    self.first_activity_date = Some(new_first);
                }
                None => {
                    self.first_activity_date = Some(new_first);
                }
                _ => {}
            }
        }

        // Only update if the new last date is later
        if let Some(new_last) = last_date {
            match self.last_activity_date {
                Some(existing) if new_last > existing => {
                    self.last_activity_date = Some(new_last);
                }
                None => {
                    self.last_activity_date = Some(new_last);
                }
                _ => {}
            }
        }

        self.updated_at = Utc::now();
    }

    /// Mark position as closed.
    pub fn mark_closed(&mut self, closed_date: NaiveDate) {
        self.is_active = false;
        self.position_closed_date = Some(closed_date);
        self.sync_priority = SyncCategory::RecentlyClosed.default_priority();
        self.updated_at = Utc::now();
    }

    /// Mark position as active (reopened or new).
    pub fn mark_active(&mut self) {
        self.is_active = true;
        self.position_closed_date = None;
        self.sync_priority = SyncCategory::Active.default_priority();
        self.updated_at = Utc::now();
    }

    /// Update the earliest quote date.
    pub fn update_earliest_quote_date(&mut self, date: NaiveDate) {
        match self.earliest_quote_date {
            Some(existing) if date < existing => {
                self.earliest_quote_date = Some(date);
            }
            None => {
                self.earliest_quote_date = Some(date);
            }
            _ => {}
        }
        self.updated_at = Utc::now();
    }
}

/// Update payload for partial updates to sync state.
#[derive(Debug, Clone, Default)]
pub struct QuoteSyncStateUpdate {
    pub is_active: Option<bool>,
    pub first_activity_date: Option<Option<NaiveDate>>,
    pub last_activity_date: Option<Option<NaiveDate>>,
    pub position_closed_date: Option<Option<NaiveDate>>,
    pub last_synced_at: Option<Option<DateTime<Utc>>>,
    pub last_quote_date: Option<Option<NaiveDate>>,
    pub earliest_quote_date: Option<Option<NaiveDate>>,
    pub sync_priority: Option<i32>,
    pub error_count: Option<i32>,
    pub last_error: Option<Option<String>>,
    pub updated_at: Option<DateTime<Utc>>,
}

/// Aggregated sync statistics for a data provider.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSyncStats {
    /// Provider ID (data_source)
    pub provider_id: String,
    /// Number of assets synced by this provider
    pub asset_count: i64,
    /// Number of assets with errors
    pub error_count: i64,
    /// Most recent sync timestamp
    pub last_synced_at: Option<DateTime<Utc>>,
    /// Most recent error message (if any)
    pub last_error: Option<String>,
    /// All unique error messages for this provider
    pub unique_errors: Vec<String>,
}

/// Trait for quote sync state storage operations.
#[async_trait]
pub trait SyncStateStore: Send + Sync {
    /// Get sync statistics aggregated by provider (data_source).
    fn get_provider_sync_stats(&self) -> Result<Vec<ProviderSyncStats>>;

    /// Get all sync states.
    fn get_all(&self) -> Result<Vec<QuoteSyncState>>;

    /// Get sync state by symbol.
    fn get_by_symbol(&self, symbol: &str) -> Result<Option<QuoteSyncState>>;

    /// Get sync states for multiple symbols.
    fn get_by_symbols(&self, symbols: &[String]) -> Result<HashMap<String, QuoteSyncState>>;

    /// Get all active symbols (is_active = true).
    fn get_active_symbols(&self) -> Result<Vec<QuoteSyncState>>;

    /// Get symbols that need syncing (active or recently closed).
    fn get_symbols_needing_sync(&self, grace_period_days: i64) -> Result<Vec<QuoteSyncState>>;

    /// Upsert a sync state (insert or update).
    async fn upsert(&self, state: &QuoteSyncState) -> Result<QuoteSyncState>;

    /// Upsert multiple sync states.
    async fn upsert_batch(&self, states: &[QuoteSyncState]) -> Result<usize>;

    /// Update sync state after successful sync.
    async fn update_after_sync(
        &self,
        symbol: &str,
        last_quote_date: NaiveDate,
        earliest_quote_date: Option<NaiveDate>,
        data_source: Option<&str>,
    ) -> Result<()>;

    /// Update sync state after sync failure.
    async fn update_after_failure(&self, symbol: &str, error: &str) -> Result<()>;

    /// Mark symbol as inactive (position closed).
    async fn mark_inactive(&self, symbol: &str, closed_date: NaiveDate) -> Result<()>;

    /// Mark symbol as active.
    async fn mark_active(&self, symbol: &str) -> Result<()>;

    /// Update activity dates for a symbol.
    async fn update_activity_dates(
        &self,
        symbol: &str,
        first_date: Option<NaiveDate>,
        last_date: Option<NaiveDate>,
    ) -> Result<()>;

    /// Delete sync state for a symbol.
    async fn delete(&self, symbol: &str) -> Result<()>;

    /// Delete all sync states (used for reset).
    async fn delete_all(&self) -> Result<usize>;

    /// Refresh activity dates for all sync states from the activities table.
    /// This efficiently populates first_activity_date and last_activity_date
    /// for all sync states by querying the activities table directly.
    async fn refresh_activity_dates_from_activities(&self) -> Result<usize>;

    /// Refresh earliest_quote_date for all sync states from the quotes table.
    /// This ensures earliest_quote_date reflects the actual minimum quote date.
    async fn refresh_earliest_quote_dates(&self) -> Result<usize>;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_state() -> QuoteSyncState {
        QuoteSyncState::new("TEST".to_string(), "YAHOO".to_string())
    }

    #[test]
    fn test_new_asset_with_activity_but_no_quotes() {
        let mut state = create_test_state();
        state.is_active = false;
        state.first_activity_date = Some(Utc::now().date_naive());
        state.last_activity_date = Some(Utc::now().date_naive());
        state.earliest_quote_date = None;

        let category = state.determine_category(30);
        assert_eq!(
            category,
            SyncCategory::New,
            "Asset with activities but no quotes should be categorized as New"
        );
    }

    #[test]
    fn test_active_position_with_quotes() {
        let mut state = create_test_state();
        state.is_active = true;
        let today = Utc::now().date_naive();
        state.first_activity_date = Some(today - Duration::days(10));
        // earliest_quote_date must be at least (10 + buffer + margin) = 10 + 52 = 62 days ago
        // to avoid triggering NeedsBackfill
        state.earliest_quote_date = Some(today - Duration::days(70));
        state.last_quote_date = Some(today - Duration::days(1));

        let category = state.determine_category(30);
        assert_eq!(category, SyncCategory::Active);
    }

    #[test]
    fn test_needs_backfill_activity_before_quotes() {
        let mut state = create_test_state();
        state.is_active = true;
        let today = Utc::now().date_naive();
        state.first_activity_date = Some(today - Duration::days(60));
        state.earliest_quote_date = Some(today - Duration::days(20));
        state.last_quote_date = Some(today - Duration::days(1));

        let category = state.determine_category(30);
        assert_eq!(
            category,
            SyncCategory::NeedsBackfill,
            "Should need backfill when first_activity - buffer < earliest_quote"
        );
    }

    #[test]
    fn test_recently_closed_within_grace_period() {
        let mut state = create_test_state();
        state.is_active = false;
        let today = Utc::now().date_naive();
        state.first_activity_date = Some(today - Duration::days(100));
        state.last_activity_date = Some(today - Duration::days(5));
        state.position_closed_date = Some(today - Duration::days(5));
        // earliest_quote_date must be at least (100 + buffer + margin) = 152 days ago
        // to avoid triggering NeedsBackfill
        state.earliest_quote_date = Some(today - Duration::days(160));

        let category = state.determine_category(30);
        assert_eq!(
            category,
            SyncCategory::RecentlyClosed,
            "Position closed 5 days ago should be RecentlyClosed (within 30 day grace)"
        );
    }

    #[test]
    fn test_recently_closed_fallback_to_last_activity() {
        let mut state = create_test_state();
        state.is_active = false;
        let today = Utc::now().date_naive();
        state.first_activity_date = Some(today - Duration::days(100));
        state.last_activity_date = Some(today - Duration::days(10));
        state.position_closed_date = None;
        // earliest_quote_date must be at least (100 + buffer + margin) = 152 days ago
        state.earliest_quote_date = Some(today - Duration::days(160));

        let category = state.determine_category(30);
        assert_eq!(
            category,
            SyncCategory::RecentlyClosed,
            "Should fallback to last_activity_date when position_closed_date is None"
        );
    }

    #[test]
    fn test_closed_beyond_grace_period() {
        let mut state = create_test_state();
        state.is_active = false;
        let today = Utc::now().date_naive();
        state.first_activity_date = Some(today - Duration::days(100));
        state.last_activity_date = Some(today - Duration::days(50));
        state.position_closed_date = Some(today - Duration::days(50));
        // earliest_quote_date must be at least (100 + buffer + margin) = 152 days ago
        state.earliest_quote_date = Some(today - Duration::days(160));

        let category = state.determine_category(30);
        assert_eq!(
            category,
            SyncCategory::Closed,
            "Position closed 50 days ago should be Closed (beyond 30 day grace)"
        );
    }

    #[test]
    fn test_needs_backfill_even_when_not_active() {
        let mut state = create_test_state();
        state.is_active = false;
        let today = Utc::now().date_naive();
        state.first_activity_date = Some(today - Duration::days(100));
        state.earliest_quote_date = Some(today - Duration::days(50));

        let category = state.determine_category(30);
        assert_eq!(
            category,
            SyncCategory::NeedsBackfill,
            "Should detect backfill need regardless of is_active status"
        );
    }

    #[test]
    fn test_category_priorities() {
        assert!(SyncCategory::Active.default_priority() > SyncCategory::NeedsBackfill.default_priority());
        assert!(SyncCategory::NeedsBackfill.default_priority() > SyncCategory::New.default_priority());
        assert!(SyncCategory::New.default_priority() > SyncCategory::RecentlyClosed.default_priority());
        assert!(SyncCategory::RecentlyClosed.default_priority() > SyncCategory::Closed.default_priority());
    }

    #[test]
    fn test_mark_synced() {
        let mut state = create_test_state();
        state.error_count = 3;
        state.last_error = Some("Previous error".to_string());

        let quote_date = Utc::now().date_naive();
        state.mark_synced(quote_date);

        assert_eq!(state.last_quote_date, Some(quote_date));
        assert!(state.last_synced_at.is_some());
        assert_eq!(state.error_count, 0);
        assert!(state.last_error.is_none());
    }

    #[test]
    fn test_mark_sync_failed() {
        let mut state = create_test_state();
        assert_eq!(state.error_count, 0);

        state.mark_sync_failed("Connection timeout".to_string());
        assert_eq!(state.error_count, 1);
        assert_eq!(state.last_error, Some("Connection timeout".to_string()));

        state.mark_sync_failed("Rate limited".to_string());
        assert_eq!(state.error_count, 2);
        assert_eq!(state.last_error, Some("Rate limited".to_string()));
    }
}
