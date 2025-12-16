use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db::{get_connection, WriteHandle};
use crate::errors::Result;
use crate::schema::brokers_sync_state;

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

pub struct BrokersSyncStateRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl BrokersSyncStateRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    pub fn get_by_account_id(&self, account_id: &str) -> Result<Option<BrokersSyncState>> {
        let mut conn = get_connection(&self.pool)?;
        let state = brokers_sync_state::table
            .select(BrokersSyncStateDB::as_select())
            .find(account_id)
            .first::<BrokersSyncStateDB>(&mut conn)
            .optional()?;
        Ok(state.map(BrokersSyncState::from))
    }

    pub async fn upsert_attempt(&self, account_id: String, provider: String) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let state = BrokersSyncStateDB {
            account_id,
            provider,
            last_synced_date: None,
            last_attempted_at: Some(now.clone()),
            last_successful_at: None,
            last_error: None,
            created_at: now.clone(),
            updated_at: now,
        };

        self.writer
            .exec(move |conn| {
                diesel::insert_into(brokers_sync_state::table)
                    .values(&state)
                    .on_conflict(brokers_sync_state::account_id)
                    .do_update()
                    .set((
                        brokers_sync_state::provider.eq(&state.provider),
                        brokers_sync_state::last_attempted_at.eq(&state.last_attempted_at),
                        brokers_sync_state::updated_at.eq(&state.updated_at),
                    ))
                    .execute(conn)?;
                Ok(())
            })
            .await
    }

    pub async fn upsert_success(
        &self,
        account_id: String,
        provider: String,
        last_synced_date: String,
    ) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let state = BrokersSyncStateDB {
            account_id,
            provider,
            last_synced_date: Some(last_synced_date),
            last_attempted_at: Some(now.clone()),
            last_successful_at: Some(now.clone()),
            last_error: None,
            created_at: now.clone(),
            updated_at: now,
        };

        self.writer
            .exec(move |conn| {
                diesel::insert_into(brokers_sync_state::table)
                    .values(&state)
                    .on_conflict(brokers_sync_state::account_id)
                    .do_update()
                    .set((
                        brokers_sync_state::provider.eq(&state.provider),
                        brokers_sync_state::last_synced_date.eq(&state.last_synced_date),
                        brokers_sync_state::last_attempted_at.eq(&state.last_attempted_at),
                        brokers_sync_state::last_successful_at.eq(&state.last_successful_at),
                        brokers_sync_state::last_error.eq::<Option<String>>(None),
                        brokers_sync_state::updated_at.eq(&state.updated_at),
                    ))
                    .execute(conn)?;
                Ok(())
            })
            .await
    }

    pub async fn upsert_failure(&self, account_id: String, provider: String, error: String) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let error_trimmed = error.chars().take(4096).collect::<String>();
        let state = BrokersSyncStateDB {
            account_id,
            provider,
            last_synced_date: None,
            last_attempted_at: Some(now.clone()),
            last_successful_at: None,
            last_error: Some(error_trimmed),
            created_at: now.clone(),
            updated_at: now,
        };

        self.writer
            .exec(move |conn| {
                diesel::insert_into(brokers_sync_state::table)
                    .values(&state)
                    .on_conflict(brokers_sync_state::account_id)
                    .do_update()
                    .set((
                        brokers_sync_state::provider.eq(&state.provider),
                        brokers_sync_state::last_attempted_at.eq(&state.last_attempted_at),
                        brokers_sync_state::last_error.eq(&state.last_error),
                        brokers_sync_state::updated_at.eq(&state.updated_at),
                    ))
                    .execute(conn)?;
                Ok(())
            })
            .await
    }
}

