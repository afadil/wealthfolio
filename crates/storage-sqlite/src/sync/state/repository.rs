//! Repository for broker sync state persistence.

use chrono::Utc;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use wealthfolio_core::errors::Result;
use wealthfolio_core::sync::BrokerSyncState;

use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::brokers_sync_state;

use super::model::BrokerSyncStateDB;

pub struct BrokerSyncStateRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl BrokerSyncStateRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    /// Get or create sync state for account+provider
    pub async fn get_or_create(
        &self,
        account_id: String,
        provider: String,
    ) -> Result<BrokerSyncState> {
        self.writer
            .exec(move |conn| {
                let existing = brokers_sync_state::table
                    .find((&account_id, &provider))
                    .first::<BrokerSyncStateDB>(conn)
                    .optional()
                    .map_err(StorageError::from)?;

                match existing {
                    Some(db) => Ok(db.into()),
                    None => {
                        let new_state = BrokerSyncState::new(account_id, provider);
                        let db_model: BrokerSyncStateDB = new_state.clone().into();

                        diesel::insert_into(brokers_sync_state::table)
                            .values(&db_model)
                            .execute(conn)
                            .map_err(StorageError::from)?;

                        Ok(new_state)
                    }
                }
            })
            .await
    }

    /// Get sync state by account+provider (read-only)
    pub fn get(&self, account_id: &str, provider: &str) -> Result<Option<BrokerSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let result = brokers_sync_state::table
            .find((account_id, provider))
            .first::<BrokerSyncStateDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(Into::into))
    }

    /// Get sync state by account ID (first provider found)
    pub fn get_by_account_id(&self, account_id: &str) -> Result<Option<BrokerSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let result = brokers_sync_state::table
            .filter(brokers_sync_state::account_id.eq(account_id))
            .first::<BrokerSyncStateDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(Into::into))
    }

    /// Update sync state
    pub async fn update(&self, state: BrokerSyncState) -> Result<BrokerSyncState> {
        self.writer
            .exec(move |conn| {
                let db_model: BrokerSyncStateDB = state.into();

                diesel::update(
                    brokers_sync_state::table.find((&db_model.account_id, &db_model.provider)),
                )
                .set(&db_model)
                .execute(conn)
                .map_err(StorageError::from)?;

                Ok(db_model.into())
            })
            .await
    }

    /// Record a sync attempt (upsert with SYNCING status)
    pub async fn upsert_attempt(&self, account_id: String, provider: String) -> Result<()> {
        self.writer
            .exec(move |conn| {
                let now = Utc::now();
                let now_str = now.to_rfc3339();

                // Check if exists
                let existing = brokers_sync_state::table
                    .find((&account_id, &provider))
                    .first::<BrokerSyncStateDB>(conn)
                    .optional()
                    .map_err(StorageError::from)?;

                match existing {
                    Some(_) => {
                        // Update attempt timestamp and status
                        diesel::update(brokers_sync_state::table.find((&account_id, &provider)))
                            .set((
                                brokers_sync_state::last_attempted_at.eq(&now_str),
                                brokers_sync_state::sync_status.eq("SYNCING"),
                                brokers_sync_state::updated_at.eq(&now_str),
                            ))
                            .execute(conn)
                            .map_err(StorageError::from)?;
                    }
                    None => {
                        // Create new record
                        let new_state = BrokerSyncStateDB {
                            account_id,
                            provider,
                            checkpoint_json: None,
                            last_attempted_at: Some(now_str.clone()),
                            last_successful_at: None,
                            last_error: None,
                            last_run_id: None,
                            sync_status: "SYNCING".to_string(),
                            created_at: now_str.clone(),
                            updated_at: now_str,
                        };

                        diesel::insert_into(brokers_sync_state::table)
                            .values(&new_state)
                            .execute(conn)
                            .map_err(StorageError::from)?;
                    }
                }

                Ok(())
            })
            .await
    }

    /// Record a successful sync (upsert with IDLE status)
    pub async fn upsert_success(
        &self,
        account_id: String,
        provider: String,
        _last_synced_date: String,
        import_run_id: Option<String>,
    ) -> Result<()> {
        self.writer
            .exec(move |conn| {
                let now = Utc::now();
                let now_str = now.to_rfc3339();

                // Check if exists
                let existing = brokers_sync_state::table
                    .find((&account_id, &provider))
                    .first::<BrokerSyncStateDB>(conn)
                    .optional()
                    .map_err(StorageError::from)?;

                match existing {
                    Some(_) => {
                        // Update success timestamp and status
                        diesel::update(brokers_sync_state::table.find((&account_id, &provider)))
                            .set((
                                brokers_sync_state::last_successful_at.eq(&now_str),
                                brokers_sync_state::sync_status.eq("IDLE"),
                                brokers_sync_state::last_error.eq::<Option<String>>(None),
                                brokers_sync_state::last_run_id.eq(&import_run_id),
                                brokers_sync_state::updated_at.eq(&now_str),
                            ))
                            .execute(conn)
                            .map_err(StorageError::from)?;
                    }
                    None => {
                        // Create new record
                        let new_state = BrokerSyncStateDB {
                            account_id,
                            provider,
                            checkpoint_json: None,
                            last_attempted_at: Some(now_str.clone()),
                            last_successful_at: Some(now_str.clone()),
                            last_error: None,
                            last_run_id: import_run_id,
                            sync_status: "IDLE".to_string(),
                            created_at: now_str.clone(),
                            updated_at: now_str,
                        };

                        diesel::insert_into(brokers_sync_state::table)
                            .values(&new_state)
                            .execute(conn)
                            .map_err(StorageError::from)?;
                    }
                }

                Ok(())
            })
            .await
    }

    /// Record a failed sync (upsert with FAILED status)
    pub async fn upsert_failure(
        &self,
        account_id: String,
        provider: String,
        error: String,
        import_run_id: Option<String>,
    ) -> Result<()> {
        self.writer
            .exec(move |conn| {
                let now = Utc::now();
                let now_str = now.to_rfc3339();

                // Check if exists
                let existing = brokers_sync_state::table
                    .find((&account_id, &provider))
                    .first::<BrokerSyncStateDB>(conn)
                    .optional()
                    .map_err(StorageError::from)?;

                match existing {
                    Some(_) => {
                        // Update failure
                        diesel::update(brokers_sync_state::table.find((&account_id, &provider)))
                            .set((
                                brokers_sync_state::sync_status.eq("FAILED"),
                                brokers_sync_state::last_error.eq(&error),
                                brokers_sync_state::last_run_id.eq(&import_run_id),
                                brokers_sync_state::updated_at.eq(&now_str),
                            ))
                            .execute(conn)
                            .map_err(StorageError::from)?;
                    }
                    None => {
                        // Create new record with error
                        let new_state = BrokerSyncStateDB {
                            account_id,
                            provider,
                            checkpoint_json: None,
                            last_attempted_at: Some(now_str.clone()),
                            last_successful_at: None,
                            last_error: Some(error),
                            last_run_id: import_run_id,
                            sync_status: "FAILED".to_string(),
                            created_at: now_str.clone(),
                            updated_at: now_str,
                        };

                        diesel::insert_into(brokers_sync_state::table)
                            .values(&new_state)
                            .execute(conn)
                            .map_err(StorageError::from)?;
                    }
                }

                Ok(())
            })
            .await
    }

    /// Get all sync states for an account
    pub fn get_for_account(&self, account_id: &str) -> Result<Vec<BrokerSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let results = brokers_sync_state::table
            .filter(brokers_sync_state::account_id.eq(account_id))
            .load::<BrokerSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Into::into).collect())
    }

    /// Get all broker sync states
    pub fn get_all(&self) -> Result<Vec<BrokerSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let results = brokers_sync_state::table
            .order(brokers_sync_state::updated_at.desc())
            .load::<BrokerSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Into::into).collect())
    }

    /// Delete sync state
    pub async fn delete(&self, account_id: String, provider: String) -> Result<()> {
        self.writer
            .exec(move |conn| {
                diesel::delete(brokers_sync_state::table.find((&account_id, &provider)))
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }
}
