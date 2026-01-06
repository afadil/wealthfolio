//! Quote sync state domain models.

use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

/// Sync category determines how a symbol should be synced
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
    /// Get the default priority for this category
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

/// Plan for syncing a specific symbol
#[derive(Debug, Clone)]
pub struct SymbolSyncPlan {
    pub symbol: String,
    pub category: SyncCategory,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub priority: i32,
    pub data_source: String,
    pub quote_symbol: Option<String>, // Symbol for quote fetching (replaces symbol_mapping)
    pub currency: String,
}

/// Domain model for quote sync state
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
    /// Create a new sync state for a symbol
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

    /// Determine the sync category based on current state
    /// Note: Uses QUOTE_HISTORY_BUFFER_DAYS (30 days) for backfill calculation
    pub fn determine_category(&self, grace_period_days: i64) -> SyncCategory {
        const QUOTE_HISTORY_BUFFER_DAYS: i64 = 30;

        let today = Utc::now().date_naive();

        // FIRST: Check for NEW assets - has activities but no quotes yet
        // This takes precedence because we need quotes regardless of is_active status
        // (is_active might be false simply because no snapshot exists yet for new assets)
        if self.first_activity_date.is_some() && self.earliest_quote_date.is_none() {
            return SyncCategory::New;
        }

        // Check if needs backfill (activity date - buffer before earliest quote)
        // This also applies regardless of is_active status
        if let (Some(first_activity), Some(earliest_quote)) =
            (self.first_activity_date, self.earliest_quote_date)
        {
            let required_start = first_activity - Duration::days(QUOTE_HISTORY_BUFFER_DAYS);
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

    /// Mark as synced successfully
    pub fn mark_synced(&mut self, last_quote_date: NaiveDate) {
        self.last_synced_at = Some(Utc::now());
        self.last_quote_date = Some(last_quote_date);
        self.error_count = 0;
        self.last_error = None;
        self.updated_at = Utc::now();
    }

    /// Mark sync as failed
    pub fn mark_sync_failed(&mut self, error: String) {
        self.error_count += 1;
        self.last_error = Some(error);
        self.updated_at = Utc::now();
    }

    /// Update activity dates
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

    /// Mark position as closed
    pub fn mark_closed(&mut self, closed_date: NaiveDate) {
        self.is_active = false;
        self.position_closed_date = Some(closed_date);
        self.sync_priority = SyncCategory::RecentlyClosed.default_priority();
        self.updated_at = Utc::now();
    }

    /// Mark position as active (reopened or new)
    pub fn mark_active(&mut self) {
        self.is_active = true;
        self.position_closed_date = None;
        self.sync_priority = SyncCategory::Active.default_priority();
        self.updated_at = Utc::now();
    }

    /// Update the earliest quote date
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

/// Update payload for partial updates
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

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_state() -> QuoteSyncState {
        QuoteSyncState::new("TEST".to_string(), "YAHOO".to_string())
    }

    #[test]
    fn test_new_asset_with_activity_but_no_quotes() {
        // Scenario: User added a BUY activity for AAPL, but no quotes fetched yet
        let mut state = create_test_state();
        state.is_active = false; // No snapshot exists yet
        state.first_activity_date = Some(Utc::now().date_naive());
        state.last_activity_date = Some(Utc::now().date_naive());
        state.earliest_quote_date = None; // No quotes yet

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
        state.first_activity_date = Some(Utc::now().date_naive() - Duration::days(10));
        state.earliest_quote_date = Some(Utc::now().date_naive() - Duration::days(40));
        state.last_quote_date = Some(Utc::now().date_naive() - Duration::days(1));

        let category = state.determine_category(30);
        assert_eq!(category, SyncCategory::Active);
    }

    #[test]
    fn test_needs_backfill_activity_before_quotes() {
        let mut state = create_test_state();
        state.is_active = true;
        // Activity date is 60 days ago, but earliest quote is 20 days ago
        // With 30 day buffer: required_start = activity - 30 = 90 days ago
        // Since 90 days ago < 20 days ago, needs backfill
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
        state.last_activity_date = Some(today - Duration::days(5)); // 5 days ago
        state.position_closed_date = Some(today - Duration::days(5));
        state.earliest_quote_date = Some(today - Duration::days(130));

        let category = state.determine_category(30);
        assert_eq!(
            category,
            SyncCategory::RecentlyClosed,
            "Position closed 5 days ago should be RecentlyClosed (within 30 day grace)"
        );
    }

    #[test]
    fn test_recently_closed_fallback_to_last_activity() {
        // Position closed but position_closed_date not set
        let mut state = create_test_state();
        state.is_active = false;
        let today = Utc::now().date_naive();
        state.first_activity_date = Some(today - Duration::days(100));
        state.last_activity_date = Some(today - Duration::days(10)); // Last activity 10 days ago
        state.position_closed_date = None; // Not explicitly set
        state.earliest_quote_date = Some(today - Duration::days(130));

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
        state.last_activity_date = Some(today - Duration::days(50)); // 50 days ago
        state.position_closed_date = Some(today - Duration::days(50));
        state.earliest_quote_date = Some(today - Duration::days(130));

        let category = state.determine_category(30);
        assert_eq!(
            category,
            SyncCategory::Closed,
            "Position closed 50 days ago should be Closed (beyond 30 day grace)"
        );
    }

    #[test]
    fn test_needs_backfill_even_when_not_active() {
        // Edge case: position closed but still needs backfill for historical accuracy
        let mut state = create_test_state();
        state.is_active = false;
        let today = Utc::now().date_naive();
        state.first_activity_date = Some(today - Duration::days(100)); // Activity 100 days ago
        state.earliest_quote_date = Some(today - Duration::days(50)); // Quotes only from 50 days ago
        // With 30 day buffer: required_start = 100 - 30 = 70 days ago
        // Since 70 days ago < 50 days ago, needs backfill

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
}
