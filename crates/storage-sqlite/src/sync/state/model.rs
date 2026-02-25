//! Database models for broker sync state.

use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use wealthfolio_connect::broker_ingest::{BrokerSyncState, SyncStatus};

/// Database model for broker sync state
#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(primary_key(account_id, provider))]
#[diesel(table_name = crate::schema::brokers_sync_state)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct BrokerSyncStateDB {
    pub account_id: String,
    pub provider: String,
    pub checkpoint_json: Option<String>,
    pub last_attempted_at: Option<String>,
    pub last_successful_at: Option<String>,
    pub last_error: Option<String>,
    pub last_run_id: Option<String>,
    pub sync_status: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<BrokerSyncStateDB> for BrokerSyncState {
    fn from(db: BrokerSyncStateDB) -> Self {
        let sync_status = match db.sync_status.as_str() {
            "IDLE" => SyncStatus::Idle,
            "RUNNING" | "SYNCING" => SyncStatus::Running,
            "NEEDS_REVIEW" => SyncStatus::NeedsReview,
            "FAILED" => SyncStatus::Failed,
            _ => SyncStatus::Idle,
        };

        Self {
            account_id: db.account_id,
            provider: db.provider,
            checkpoint_json: db
                .checkpoint_json
                .and_then(|s| serde_json::from_str(&s).ok()),
            last_attempted_at: db.last_attempted_at.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            }),
            last_successful_at: db.last_successful_at.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            }),
            last_error: db.last_error,
            last_run_id: db.last_run_id,
            sync_status,
            created_at: DateTime::parse_from_rfc3339(&db.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            updated_at: DateTime::parse_from_rfc3339(&db.updated_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }
    }
}

impl From<BrokerSyncState> for BrokerSyncStateDB {
    fn from(domain: BrokerSyncState) -> Self {
        let sync_status = match domain.sync_status {
            SyncStatus::Idle => "IDLE",
            SyncStatus::Running => "RUNNING",
            SyncStatus::NeedsReview => "NEEDS_REVIEW",
            SyncStatus::Failed => "FAILED",
        };

        Self {
            account_id: domain.account_id,
            provider: domain.provider,
            checkpoint_json: domain
                .checkpoint_json
                .map(|v| serde_json::to_string(&v).unwrap_or_default()),
            last_attempted_at: domain.last_attempted_at.map(|dt| dt.to_rfc3339()),
            last_successful_at: domain.last_successful_at.map(|dt| dt.to_rfc3339()),
            last_error: domain.last_error,
            last_run_id: domain.last_run_id,
            sync_status: sync_status.to_string(),
            created_at: domain.created_at.to_rfc3339(),
            updated_at: domain.updated_at.to_rfc3339(),
        }
    }
}
