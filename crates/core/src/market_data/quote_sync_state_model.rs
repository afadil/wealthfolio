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

        // Check if symbol has open position
        if self.is_active {
            // Check if needs backfill (activity date - buffer before earliest quote)
            if let (Some(first_activity), Some(earliest_quote)) =
                (self.first_activity_date, self.earliest_quote_date)
            {
                // If (first activity - buffer) is before earliest quote, needs backfill
                let required_start = first_activity - Duration::days(QUOTE_HISTORY_BUFFER_DAYS);
                if required_start < earliest_quote {
                    return SyncCategory::NeedsBackfill;
                }
            }

            // Check if it's a new symbol (no quotes yet)
            if self.earliest_quote_date.is_none() {
                return SyncCategory::New;
            }

            return SyncCategory::Active;
        }

        // Position is closed - check grace period
        if let Some(closed_date) = self.position_closed_date {
            let days_since_close = (today - closed_date).num_days();
            if days_since_close <= grace_period_days {
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
