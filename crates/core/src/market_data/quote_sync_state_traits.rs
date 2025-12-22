//! Quote sync state repository traits.

use async_trait::async_trait;
use chrono::NaiveDate;
use std::collections::HashMap;

use super::QuoteSyncState;
use crate::errors::Result;

/// Trait for quote sync state repository operations.
#[async_trait]
pub trait QuoteSyncStateRepositoryTrait: Send + Sync {
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
}
