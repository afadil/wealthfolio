//! Broker sync state domain models.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Status of a sync operation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncStatus {
    /// No sync in progress
    #[default]
    Idle,
    /// Sync is running
    Running,
    /// Sync completed but needs user review
    NeedsReview,
    /// Sync failed
    Failed,
}

/// Tracks the sync state for a broker/provider account
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerSyncState {
    /// Account this state belongs to
    pub account_id: String,
    /// Provider name (e.g., "snaptrade", "plaid")
    pub provider: String,
    /// JSON checkpoint for incremental syncs
    pub checkpoint_json: Option<Value>,
    /// When sync was last attempted
    pub last_attempted_at: Option<DateTime<Utc>>,
    /// When sync last succeeded
    pub last_successful_at: Option<DateTime<Utc>>,
    /// Last error message if failed
    pub last_error: Option<String>,
    /// ID of the last import run
    pub last_run_id: Option<String>,
    /// Current sync status
    pub sync_status: SyncStatus,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

impl BrokerSyncState {
    /// Create new sync state for an account+provider
    pub fn new(account_id: String, provider: String) -> Self {
        let now = Utc::now();
        Self {
            account_id,
            provider,
            checkpoint_json: None,
            last_attempted_at: None,
            last_successful_at: None,
            last_error: None,
            last_run_id: None,
            sync_status: SyncStatus::Idle,
            created_at: now,
            updated_at: now,
        }
    }

    /// Get typed checkpoint
    pub fn get_checkpoint<T: serde::de::DeserializeOwned>(&self) -> Option<T> {
        self.checkpoint_json
            .as_ref()
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    /// Set checkpoint
    pub fn set_checkpoint<T: Serialize>(
        &mut self,
        checkpoint: &T,
    ) -> Result<(), serde_json::Error> {
        self.checkpoint_json = Some(serde_json::to_value(checkpoint)?);
        self.updated_at = Utc::now();
        Ok(())
    }

    /// Mark sync as started
    pub fn start_sync(&mut self, run_id: String) {
        self.sync_status = SyncStatus::Running;
        self.last_attempted_at = Some(Utc::now());
        self.last_run_id = Some(run_id);
        self.last_error = None;
        self.updated_at = Utc::now();
    }

    /// Mark sync as completed successfully
    pub fn complete_sync(&mut self) {
        self.sync_status = SyncStatus::Idle;
        self.last_successful_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Mark sync as failed
    pub fn fail_sync(&mut self, error: String) {
        self.sync_status = SyncStatus::Failed;
        self.last_error = Some(error);
        self.updated_at = Utc::now();
    }
}

// Provider-specific checkpoint types

/// Checkpoint for SnapTrade sync operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapTradeCheckpoint {
    /// Last date that was synced
    pub last_synced_date: NaiveDate,
    /// Number of days to look back for updates
    pub lookback_days: u32,
}

/// Checkpoint for Plaid transactions sync (cursor-based)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaidSyncCheckpoint {
    /// Cursor for Plaid's transactions sync API
    pub cursor: String,
}

/// Checkpoint for Plaid investments sync
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaidInvestmentsCheckpoint {
    /// Last date that was synced
    pub last_synced_date: NaiveDate,
    /// Number of days to look back for updates
    pub lookback_days: u32,
}
