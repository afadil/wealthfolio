//! Database models for broker sync state.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for brokers sync state
#[derive(
    Queryable,
    Insertable,
    AsChangeset,
    Selectable,
    Serialize,
    Deserialize,
    Debug,
    Clone,
    Default,
)]
#[diesel(table_name = crate::schema::brokers_sync_state)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[diesel(primary_key(account_id))]
pub struct BrokersSyncStateDB {
    pub account_id: String,
    pub provider: String,
    pub last_synced_date: Option<String>,
    pub last_attempted_at: Option<String>,
    pub last_successful_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Domain model for broker sync state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokersSyncState {
    pub account_id: String,
    pub provider: String,
    pub last_synced_date: Option<String>,
    pub last_attempted_at: Option<String>,
    pub last_successful_at: Option<String>,
    pub last_error: Option<String>,
}

impl From<BrokersSyncStateDB> for BrokersSyncState {
    fn from(db: BrokersSyncStateDB) -> Self {
        Self {
            account_id: db.account_id,
            provider: db.provider,
            last_synced_date: db.last_synced_date,
            last_attempted_at: db.last_attempted_at,
            last_successful_at: db.last_successful_at,
            last_error: db.last_error,
        }
    }
}
