use async_trait::async_trait;
use chrono::{NaiveDate, Utc};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use log::debug;
use std::collections::HashMap;
use std::sync::Arc;

use super::model::{QuoteSyncStateDB, QuoteSyncStateUpdateDB};
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::quote_sync_state::dsl as qss_dsl;
use wealthfolio_core::market_data::{QuoteSyncState, QuoteSyncStateRepositoryTrait};
use wealthfolio_core::Result;

pub struct QuoteSyncStateRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl QuoteSyncStateRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl QuoteSyncStateRepositoryTrait for QuoteSyncStateRepository {
    fn get_all(&self) -> Result<Vec<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let results = qss_dsl::quote_sync_state
            .order(qss_dsl::sync_priority.desc())
            .load::<QuoteSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(QuoteSyncState::from).collect())
    }

    fn get_by_symbol(&self, symbol: &str) -> Result<Option<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let result = qss_dsl::quote_sync_state
            .filter(qss_dsl::symbol.eq(symbol))
            .first::<QuoteSyncStateDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(QuoteSyncState::from))
    }

    fn get_by_symbols(&self, symbols: &[String]) -> Result<HashMap<String, QuoteSyncState>> {
        if symbols.is_empty() {
            return Ok(HashMap::new());
        }

        let mut conn = get_connection(&self.pool)?;

        let results = qss_dsl::quote_sync_state
            .filter(qss_dsl::symbol.eq_any(symbols))
            .load::<QuoteSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results
            .into_iter()
            .map(|db| {
                let state = QuoteSyncState::from(db);
                (state.symbol.clone(), state)
            })
            .collect())
    }

    fn get_active_symbols(&self) -> Result<Vec<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let results = qss_dsl::quote_sync_state
            .filter(qss_dsl::is_active.eq(1))
            .order(qss_dsl::sync_priority.desc())
            .load::<QuoteSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(QuoteSyncState::from).collect())
    }

    fn get_symbols_needing_sync(&self, grace_period_days: i64) -> Result<Vec<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;
        let today = Utc::now().date_naive();
        let grace_cutoff = today - chrono::Duration::days(grace_period_days);
        let grace_cutoff_str = grace_cutoff.format("%Y-%m-%d").to_string();

        // Get active symbols OR recently closed symbols (within grace period)
        let results = qss_dsl::quote_sync_state
            .filter(
                qss_dsl::is_active.eq(1).or(qss_dsl::is_active
                    .eq(0)
                    .and(qss_dsl::position_closed_date.gt(&grace_cutoff_str))),
            )
            .order(qss_dsl::sync_priority.desc())
            .load::<QuoteSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(QuoteSyncState::from).collect())
    }

    async fn upsert(&self, state: &QuoteSyncState) -> Result<QuoteSyncState> {
        let db_state = QuoteSyncStateDB::from(state);

        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<QuoteSyncState> {
                    diesel::replace_into(qss_dsl::quote_sync_state)
                        .values(&db_state)
                        .execute(conn)
                        .map_err(StorageError::from)?;

                    let result = qss_dsl::quote_sync_state
                        .filter(qss_dsl::symbol.eq(&db_state.symbol))
                        .first::<QuoteSyncStateDB>(conn)
                        .map_err(StorageError::from)?;

                    Ok(QuoteSyncState::from(result))
                },
            )
            .await
    }

    async fn upsert_batch(&self, states: &[QuoteSyncState]) -> Result<usize> {
        if states.is_empty() {
            return Ok(0);
        }

        let db_states: Vec<QuoteSyncStateDB> = states.iter().map(QuoteSyncStateDB::from).collect();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                let mut total = 0;
                for chunk in db_states.chunks(500) {
                    total += diesel::replace_into(qss_dsl::quote_sync_state)
                        .values(chunk)
                        .execute(conn)
                        .map_err(StorageError::from)?;
                }
                Ok(total)
            })
            .await
    }

    async fn update_after_sync(
        &self,
        symbol: &str,
        last_quote_date: NaiveDate,
        earliest_quote_date: Option<NaiveDate>,
    ) -> Result<()> {
        let symbol_owned = symbol.to_string();
        let last_quote_str = last_quote_date.format("%Y-%m-%d").to_string();
        let earliest_quote_str = earliest_quote_date.map(|d| d.format("%Y-%m-%d").to_string());
        let now = Utc::now().to_rfc3339();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                let mut update = QuoteSyncStateUpdateDB {
                    last_synced_at: Some(Some(now.clone())),
                    last_quote_date: Some(Some(last_quote_str)),
                    error_count: Some(0),
                    last_error: Some(None),
                    updated_at: Some(now),
                    ..Default::default()
                };

                if earliest_quote_str.is_some() {
                    update.earliest_quote_date = Some(earliest_quote_str);
                }

                diesel::update(qss_dsl::quote_sync_state.filter(qss_dsl::symbol.eq(&symbol_owned)))
                    .set(&update)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn update_after_failure(&self, symbol: &str, error: &str) -> Result<()> {
        let symbol_owned = symbol.to_string();
        let error_owned = error.to_string();
        let now = Utc::now().to_rfc3339();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // First get current error count
                let current: Option<QuoteSyncStateDB> = qss_dsl::quote_sync_state
                    .filter(qss_dsl::symbol.eq(&symbol_owned))
                    .first(conn)
                    .optional()
                    .map_err(StorageError::from)?;

                let new_error_count = current.map(|s| s.error_count + 1).unwrap_or(1);

                let update = QuoteSyncStateUpdateDB {
                    error_count: Some(new_error_count),
                    last_error: Some(Some(error_owned)),
                    updated_at: Some(now),
                    ..Default::default()
                };

                diesel::update(qss_dsl::quote_sync_state.filter(qss_dsl::symbol.eq(&symbol_owned)))
                    .set(&update)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn mark_inactive(&self, symbol: &str, closed_date: NaiveDate) -> Result<()> {
        let symbol_owned = symbol.to_string();
        let closed_date_str = closed_date.format("%Y-%m-%d").to_string();
        let now = Utc::now().to_rfc3339();

        debug!(
            "Marking symbol {} as inactive (closed: {})",
            symbol, closed_date
        );

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                let update = QuoteSyncStateUpdateDB {
                    is_active: Some(0),
                    position_closed_date: Some(Some(closed_date_str)),
                    sync_priority: Some(50), // RecentlyClosed priority
                    updated_at: Some(now),
                    ..Default::default()
                };

                diesel::update(qss_dsl::quote_sync_state.filter(qss_dsl::symbol.eq(&symbol_owned)))
                    .set(&update)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn mark_active(&self, symbol: &str) -> Result<()> {
        let symbol_owned = symbol.to_string();
        let now = Utc::now().to_rfc3339();

        debug!("Marking symbol {} as active", symbol);

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                let update = QuoteSyncStateUpdateDB {
                    is_active: Some(1),
                    position_closed_date: Some(None),
                    sync_priority: Some(100), // Active priority
                    updated_at: Some(now),
                    ..Default::default()
                };

                diesel::update(qss_dsl::quote_sync_state.filter(qss_dsl::symbol.eq(&symbol_owned)))
                    .set(&update)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn update_activity_dates(
        &self,
        symbol: &str,
        first_date: Option<NaiveDate>,
        last_date: Option<NaiveDate>,
    ) -> Result<()> {
        let symbol_owned = symbol.to_string();
        let now = Utc::now().to_rfc3339();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Get current state
                let current: Option<QuoteSyncStateDB> = qss_dsl::quote_sync_state
                    .filter(qss_dsl::symbol.eq(&symbol_owned))
                    .first(conn)
                    .optional()
                    .map_err(StorageError::from)?;

                let mut update = QuoteSyncStateUpdateDB {
                    updated_at: Some(now),
                    ..Default::default()
                };

                if let Some(first) = first_date {
                    let first_str = first.format("%Y-%m-%d").to_string();
                    // Only update if earlier than current
                    let should_update = current
                        .as_ref()
                        .and_then(|c| c.first_activity_date.as_ref())
                        .map(|existing| first_str < *existing)
                        .unwrap_or(true);

                    if should_update {
                        update.first_activity_date = Some(Some(first_str));
                    }
                }

                if let Some(last) = last_date {
                    let last_str = last.format("%Y-%m-%d").to_string();
                    // Only update if later than current
                    let should_update = current
                        .as_ref()
                        .and_then(|c| c.last_activity_date.as_ref())
                        .map(|existing| last_str > *existing)
                        .unwrap_or(true);

                    if should_update {
                        update.last_activity_date = Some(Some(last_str));
                    }
                }

                diesel::update(qss_dsl::quote_sync_state.filter(qss_dsl::symbol.eq(&symbol_owned)))
                    .set(&update)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn delete(&self, symbol: &str) -> Result<()> {
        let symbol_owned = symbol.to_string();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::delete(qss_dsl::quote_sync_state.filter(qss_dsl::symbol.eq(&symbol_owned)))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }

    async fn delete_all(&self) -> Result<usize> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                let count = diesel::delete(qss_dsl::quote_sync_state)
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(count)
            })
            .await
    }
}
