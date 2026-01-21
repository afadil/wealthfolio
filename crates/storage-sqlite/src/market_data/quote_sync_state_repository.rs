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
use crate::utils::chunk_for_sqlite;
use wealthfolio_core::quotes::{ProviderSyncStats, QuoteSyncState, SyncStateStore};
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
impl SyncStateStore for QuoteSyncStateRepository {
    fn get_provider_sync_stats(&self) -> Result<Vec<ProviderSyncStats>> {
        use diesel::sql_types::{BigInt, Nullable, Text};

        #[derive(QueryableByName)]
        struct ProviderSyncStatsRow {
            #[diesel(sql_type = Text)]
            provider_id: String,
            #[diesel(sql_type = BigInt)]
            asset_count: i64,
            #[diesel(sql_type = BigInt)]
            error_count: i64,
            #[diesel(sql_type = Nullable<Text>)]
            last_synced_at: Option<String>,
            #[diesel(sql_type = Nullable<Text>)]
            last_error: Option<String>,
            #[diesel(sql_type = Nullable<Text>)]
            unique_errors: Option<String>,
        }

        let mut conn = get_connection(&self.pool)?;

        let results: Vec<ProviderSyncStatsRow> = diesel::sql_query(
            r#"
            SELECT
                data_source as provider_id,
                COUNT(*) as asset_count,
                SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) as error_count,
                MAX(last_synced_at) as last_synced_at,
                (
                    SELECT qss2.last_error
                    FROM quote_sync_state qss2
                    WHERE qss2.data_source = quote_sync_state.data_source
                      AND qss2.last_error IS NOT NULL
                    ORDER BY qss2.updated_at DESC
                    LIMIT 1
                ) as last_error,
                (
                    SELECT GROUP_CONCAT(DISTINCT qss3.last_error)
                    FROM quote_sync_state qss3
                    WHERE qss3.data_source = quote_sync_state.data_source
                      AND qss3.last_error IS NOT NULL
                ) as unique_errors
            FROM quote_sync_state
            GROUP BY data_source
            ORDER BY data_source
            "#,
        )
        .load(&mut conn)
        .map_err(StorageError::from)?;

        Ok(results
            .into_iter()
            .map(|row| {
                let last_synced_at = row
                    .last_synced_at
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc));

                // GROUP_CONCAT uses comma as default separator
                let unique_errors: Vec<String> = row
                    .unique_errors
                    .map(|s| s.split(',').map(|e| e.trim().to_string()).collect())
                    .unwrap_or_default();

                ProviderSyncStats {
                    provider_id: row.provider_id,
                    asset_count: row.asset_count,
                    error_count: row.error_count,
                    last_synced_at,
                    last_error: row.last_error,
                    unique_errors,
                }
            })
            .collect())
    }

    fn get_all(&self) -> Result<Vec<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let results = qss_dsl::quote_sync_state
            .order(qss_dsl::sync_priority.desc())
            .load::<QuoteSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(QuoteSyncState::from).collect())
    }

    fn get_by_asset_id(&self, asset_id: &str) -> Result<Option<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let result = qss_dsl::quote_sync_state
            .filter(qss_dsl::asset_id.eq(asset_id))
            .first::<QuoteSyncStateDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(QuoteSyncState::from))
    }

    fn get_by_asset_ids(&self, asset_ids: &[String]) -> Result<HashMap<String, QuoteSyncState>> {
        if asset_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let mut conn = get_connection(&self.pool)?;
        let mut result_map = HashMap::new();

        // Chunk the asset_ids to avoid SQLite parameter limits
        for chunk in chunk_for_sqlite(asset_ids) {
            let results = qss_dsl::quote_sync_state
                .filter(qss_dsl::asset_id.eq_any(chunk))
                .load::<QuoteSyncStateDB>(&mut conn)
                .map_err(StorageError::from)?;

            for db in results {
                let state = QuoteSyncState::from(db);
                result_map.insert(state.asset_id.clone(), state);
            }
        }

        Ok(result_map)
    }

    fn get_active_assets(&self) -> Result<Vec<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        let results = qss_dsl::quote_sync_state
            .filter(qss_dsl::is_active.eq(1))
            .order(qss_dsl::sync_priority.desc())
            .load::<QuoteSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(QuoteSyncState::from).collect())
    }

    fn get_assets_needing_sync(&self, grace_period_days: i64) -> Result<Vec<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;
        let today = Utc::now().date_naive();
        let grace_cutoff = today - chrono::Duration::days(grace_period_days);
        let grace_cutoff_str = grace_cutoff.format("%Y-%m-%d").to_string();

        // Get active assets OR recently closed assets (within grace period)
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
                        .filter(qss_dsl::asset_id.eq(&db_state.asset_id))
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
        asset_id: &str,
        last_quote_date: NaiveDate,
        earliest_quote_date: Option<NaiveDate>,
        data_source: Option<&str>,
    ) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        let last_quote_str = last_quote_date.format("%Y-%m-%d").to_string();
        let earliest_quote_str = earliest_quote_date.map(|d| d.format("%Y-%m-%d").to_string());
        let data_source_owned = data_source.map(|s| s.to_string());
        let now = Utc::now().to_rfc3339();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Use a single SQL UPDATE with monotonic MIN/MAX logic
                // This ensures atomicity and prevents race conditions
                //
                // For earliest_quote_date: only update if new < existing (or existing is NULL)
                // For last_quote_date: only update if new > existing (or existing is NULL)
                //
                // This is crash-safe because the entire update is atomic within the transaction

                // Build the SQL query with optional data_source update
                let sql = if data_source_owned.is_some() {
                    r#"
                    UPDATE quote_sync_state
                    SET
                        earliest_quote_date = CASE
                            WHEN ?1 IS NOT NULL AND (earliest_quote_date IS NULL OR ?1 < earliest_quote_date)
                            THEN ?1
                            ELSE earliest_quote_date
                        END,
                        last_quote_date = CASE
                            WHEN last_quote_date IS NULL OR ?2 > last_quote_date
                            THEN ?2
                            ELSE last_quote_date
                        END,
                        last_synced_at = ?3,
                        data_source = ?4,
                        error_count = 0,
                        last_error = NULL,
                        updated_at = ?3
                    WHERE asset_id = ?5
                    "#
                } else {
                    r#"
                    UPDATE quote_sync_state
                    SET
                        earliest_quote_date = CASE
                            WHEN ?1 IS NOT NULL AND (earliest_quote_date IS NULL OR ?1 < earliest_quote_date)
                            THEN ?1
                            ELSE earliest_quote_date
                        END,
                        last_quote_date = CASE
                            WHEN last_quote_date IS NULL OR ?2 > last_quote_date
                            THEN ?2
                            ELSE last_quote_date
                        END,
                        last_synced_at = ?3,
                        error_count = 0,
                        last_error = NULL,
                        updated_at = ?3
                    WHERE asset_id = ?4
                    "#
                };

                if let Some(ref ds) = data_source_owned {
                    diesel::sql_query(sql)
                        .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(
                            earliest_quote_str,
                        )
                        .bind::<diesel::sql_types::Text, _>(&last_quote_str)
                        .bind::<diesel::sql_types::Text, _>(&now)
                        .bind::<diesel::sql_types::Text, _>(ds)
                        .bind::<diesel::sql_types::Text, _>(&asset_id_owned)
                        .execute(conn)
                        .map_err(StorageError::from)?;
                } else {
                    diesel::sql_query(sql)
                        .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(
                            earliest_quote_str,
                        )
                        .bind::<diesel::sql_types::Text, _>(&last_quote_str)
                        .bind::<diesel::sql_types::Text, _>(&now)
                        .bind::<diesel::sql_types::Text, _>(&asset_id_owned)
                        .execute(conn)
                        .map_err(StorageError::from)?;
                }

                Ok(())
            })
            .await
    }

    async fn update_after_failure(&self, asset_id: &str, error: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        let error_owned = error.to_string();
        let now = Utc::now().to_rfc3339();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // First get current error count
                let current: Option<QuoteSyncStateDB> = qss_dsl::quote_sync_state
                    .filter(qss_dsl::asset_id.eq(&asset_id_owned))
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

                diesel::update(
                    qss_dsl::quote_sync_state.filter(qss_dsl::asset_id.eq(&asset_id_owned)),
                )
                .set(&update)
                .execute(conn)
                .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn update_quote_bounds_monotonic(
        &self,
        asset_id: &str,
        new_earliest: Option<NaiveDate>,
        new_latest: Option<NaiveDate>,
    ) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        let earliest_str = new_earliest.map(|d| d.format("%Y-%m-%d").to_string());
        let latest_str = new_latest.map(|d| d.format("%Y-%m-%d").to_string());
        let now = Utc::now().to_rfc3339();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Use SQL CASE expressions for monotonic updates:
                // - earliest_quote_date: MIN(existing, new) - only update if new < existing
                // - last_quote_date: MAX(existing, new) - only update if new > existing
                //
                // This is atomic and crash-safe within the transaction
                diesel::sql_query(
                    r#"
                    UPDATE quote_sync_state
                    SET
                        earliest_quote_date = CASE
                            WHEN ?1 IS NOT NULL AND (earliest_quote_date IS NULL OR ?1 < earliest_quote_date)
                            THEN ?1
                            ELSE earliest_quote_date
                        END,
                        last_quote_date = CASE
                            WHEN ?2 IS NOT NULL AND (last_quote_date IS NULL OR ?2 > last_quote_date)
                            THEN ?2
                            ELSE last_quote_date
                        END,
                        updated_at = ?3
                    WHERE asset_id = ?4
                    "#,
                )
                .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(earliest_str)
                .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(latest_str)
                .bind::<diesel::sql_types::Text, _>(&now)
                .bind::<diesel::sql_types::Text, _>(&asset_id_owned)
                .execute(conn)
                .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn mark_inactive(&self, asset_id: &str, closed_date: NaiveDate) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        let closed_date_str = closed_date.format("%Y-%m-%d").to_string();
        let now = Utc::now().to_rfc3339();

        debug!(
            "Marking asset {} as inactive (closed: {})",
            asset_id, closed_date
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

                diesel::update(
                    qss_dsl::quote_sync_state.filter(qss_dsl::asset_id.eq(&asset_id_owned)),
                )
                .set(&update)
                .execute(conn)
                .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn mark_active(&self, asset_id: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        let now = Utc::now().to_rfc3339();

        debug!("Marking asset {} as active", asset_id);

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                let update = QuoteSyncStateUpdateDB {
                    is_active: Some(1),
                    position_closed_date: Some(None),
                    sync_priority: Some(100), // Active priority
                    updated_at: Some(now),
                    ..Default::default()
                };

                diesel::update(
                    qss_dsl::quote_sync_state.filter(qss_dsl::asset_id.eq(&asset_id_owned)),
                )
                .set(&update)
                .execute(conn)
                .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn update_activity_dates(
        &self,
        asset_id: &str,
        first_date: Option<NaiveDate>,
        last_date: Option<NaiveDate>,
    ) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        let now = Utc::now().to_rfc3339();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Get current state
                let current: Option<QuoteSyncStateDB> = qss_dsl::quote_sync_state
                    .filter(qss_dsl::asset_id.eq(&asset_id_owned))
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

                diesel::update(
                    qss_dsl::quote_sync_state.filter(qss_dsl::asset_id.eq(&asset_id_owned)),
                )
                .set(&update)
                .execute(conn)
                .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn delete(&self, asset_id: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::delete(
                    qss_dsl::quote_sync_state.filter(qss_dsl::asset_id.eq(&asset_id_owned)),
                )
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

    async fn refresh_activity_dates_from_activities(&self) -> Result<usize> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                // Update first_activity_date and last_activity_date from activities table
                // This uses a subquery to get min/max activity dates per asset_id
                let updated = diesel::sql_query(
                    r#"
                    UPDATE quote_sync_state
                    SET
                        first_activity_date = (
                            SELECT MIN(date(a.activity_date))
                            FROM activities a
                            INNER JOIN accounts acc ON a.account_id = acc.id
                            WHERE a.asset_id = quote_sync_state.asset_id
                            AND acc.is_active = 1
                        ),
                        last_activity_date = (
                            SELECT MAX(date(a.activity_date))
                            FROM activities a
                            INNER JOIN accounts acc ON a.account_id = acc.id
                            WHERE a.asset_id = quote_sync_state.asset_id
                            AND acc.is_active = 1
                        ),
                        updated_at = datetime('now')
                    WHERE EXISTS (
                        SELECT 1 FROM activities a
                        INNER JOIN accounts acc ON a.account_id = acc.id
                        WHERE a.asset_id = quote_sync_state.asset_id
                        AND acc.is_active = 1
                    )
                    "#,
                )
                .execute(conn)
                .map_err(StorageError::from)?;

                debug!(
                    "Refreshed activity dates for {} sync states from activities",
                    updated
                );
                Ok(updated)
            })
            .await
    }

    async fn refresh_earliest_quote_dates(&self) -> Result<usize> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                // Update earliest_quote_date from quotes table
                // This ensures it reflects the actual minimum quote date
                let updated = diesel::sql_query(
                    r#"
                    UPDATE quote_sync_state
                    SET
                        earliest_quote_date = (
                            SELECT MIN(q.day)
                            FROM quotes q
                            WHERE q.asset_id = quote_sync_state.asset_id
                        ),
                        updated_at = datetime('now')
                    WHERE EXISTS (
                        SELECT 1 FROM quotes q
                        WHERE q.asset_id = quote_sync_state.asset_id
                    )
                    "#,
                )
                .execute(conn)
                .map_err(StorageError::from)?;

                debug!(
                    "Refreshed earliest_quote_date for {} sync states from quotes",
                    updated
                );
                Ok(updated)
            })
            .await
    }

    async fn mark_profile_enriched(&self, asset_id: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        let now = Utc::now().to_rfc3339();

        debug!("Marking profile enriched for asset {}", asset_id);

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                let update = QuoteSyncStateUpdateDB {
                    profile_enriched_at: Some(Some(now.clone())),
                    updated_at: Some(now),
                    ..Default::default()
                };

                diesel::update(
                    qss_dsl::quote_sync_state.filter(qss_dsl::asset_id.eq(&asset_id_owned)),
                )
                .set(&update)
                .execute(conn)
                .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    fn get_assets_needing_profile_enrichment(&self) -> Result<Vec<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        // Get assets where profile_enriched_at is NULL
        let results = qss_dsl::quote_sync_state
            .filter(qss_dsl::profile_enriched_at.is_null())
            .order(qss_dsl::sync_priority.desc())
            .load::<QuoteSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(QuoteSyncState::from).collect())
    }

    fn get_with_errors(&self) -> Result<Vec<QuoteSyncState>> {
        let mut conn = get_connection(&self.pool)?;

        // Get sync states where error_count > 0
        let results = qss_dsl::quote_sync_state
            .filter(qss_dsl::error_count.gt(0))
            .order(qss_dsl::error_count.desc())
            .load::<QuoteSyncStateDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(QuoteSyncState::from).collect())
    }
}
