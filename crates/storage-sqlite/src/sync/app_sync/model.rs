//! Database models for app/device sync infrastructure tables.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(event_id))]
#[diesel(table_name = crate::schema::sync_applied_events)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SyncAppliedEventDB {
    pub event_id: String,
    pub seq: i64,
    pub entity: String,
    pub entity_id: String,
    pub applied_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(table_name = crate::schema::sync_cursor)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SyncCursorDB {
    pub id: i32,
    pub cursor: i64,
    pub updated_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(device_id))]
#[diesel(table_name = crate::schema::sync_device_config)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SyncDeviceConfigDB {
    pub device_id: String,
    pub key_version: Option<i32>,
    pub trust_state: String,
    pub last_bootstrap_at: Option<String>,
    pub min_snapshot_created_at: Option<String>,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(table_name = crate::schema::sync_engine_state)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SyncEngineStateDB {
    pub id: i32,
    pub lock_version: i64,
    pub last_push_at: Option<String>,
    pub last_pull_at: Option<String>,
    pub last_error: Option<String>,
    pub consecutive_failures: i32,
    pub next_retry_at: Option<String>,
    pub last_cycle_status: Option<String>,
    pub last_cycle_duration_ms: Option<i64>,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(entity, entity_id))]
#[diesel(table_name = crate::schema::sync_entity_metadata)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SyncEntityMetadataDB {
    pub entity: String,
    pub entity_id: String,
    pub last_event_id: String,
    pub last_client_timestamp: String,
    pub last_seq: i64,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(event_id))]
#[diesel(table_name = crate::schema::sync_outbox)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SyncOutboxEventDB {
    pub event_id: String,
    pub entity: String,
    pub entity_id: String,
    pub op: String,
    pub client_timestamp: String,
    pub payload: String,
    pub payload_key_version: i32,
    pub sent: i32,
    pub status: String,
    pub retry_count: i32,
    pub next_retry_at: Option<String>,
    pub last_error: Option<String>,
    pub last_error_code: Option<String>,
    pub device_id: Option<String>,
    pub created_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(table_name))]
#[diesel(table_name = crate::schema::sync_table_state)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SyncTableStateDB {
    pub table_name: String,
    pub enabled: i32,
    pub last_snapshot_restore_at: Option<String>,
    pub last_incremental_apply_at: Option<String>,
}
