use crate::constants::PORTFOLIO_TOTAL_ACCOUNT_ID;
use crate::errors::{Error, Result};
use crate::portfolio::snapshot::AccountStateSnapshot;
use crate::portfolio::snapshot::AccountStateSnapshotDB;
use async_trait::async_trait;
use chrono::NaiveDate;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sql_query;
use diesel::sql_types::Text;
use diesel::sqlite::Sqlite;
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::Arc;

use crate::db::{get_connection, WriteHandle};
use log::{debug, warn};

#[async_trait]
pub trait SnapshotRepositoryTrait: Send + Sync {
    async fn save_snapshots(&self, snapshots: &[AccountStateSnapshot]) -> Result<()>;

    fn get_snapshots_by_account(
        &self,
        account_id: &str,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>>;

    fn get_latest_snapshot_before_date(
        &self,
        account_id: &str,
        date: NaiveDate,
    ) -> Result<Option<AccountStateSnapshot>>;

    fn get_latest_snapshots_before_date(
        &self,
        account_ids: &[String],
        date: NaiveDate,
    ) -> Result<HashMap<String, AccountStateSnapshot>>;

    fn get_all_latest_snapshots(
        &self,
        account_ids: &[String],
    ) -> Result<HashMap<String, AccountStateSnapshot>>;

    async fn delete_snapshots_by_account_ids(&self, account_ids: &[String]) -> Result<usize>;

    async fn delete_snapshots_for_account_and_dates(
        &self,
        account_id: &str,
        dates_to_delete: &[NaiveDate],
    ) -> Result<()>;

    async fn delete_snapshots_for_account_in_range(
        &self,
        account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<()>;

    /// Deletes all snapshots for a specific account within a given date range,
    /// and then saves the provided new snapshots for that account.
    /// If `snapshots_to_save` is empty, it effectively only deletes snapshots in the range.
    async fn overwrite_snapshots_for_account_in_range(
        &self,
        account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
        snapshots_to_save: &[AccountStateSnapshot],
    ) -> Result<()>;

    /// Iterates through the provided snapshots, groups them by account,
    /// determines the min/max date range for each account's new snapshots,
    /// and then calls `overwrite_snapshots_for_account_in_range` for each account.
    async fn overwrite_multiple_account_snapshot_ranges(
        &self,
        new_snapshots: &[AccountStateSnapshot],
    ) -> Result<()>;

    fn get_total_portfolio_snapshots(
        &self,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>>;

    fn get_all_active_account_snapshots(
        &self,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>>;

    /// Retrieves the date of the earliest snapshot for a given account.
    fn get_earliest_snapshot_date(&self, account_id: &str) -> Result<Option<NaiveDate>>;

    /// Deletes all existing snapshots for a given account and saves the new ones
    /// in a single transaction.
    async fn overwrite_all_snapshots_for_account(
        &self,
        account_id: &str,
        snapshots_to_save: &[AccountStateSnapshot],
    ) -> Result<()>;
}

pub struct SnapshotRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl SnapshotRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }

    // --- Implement Snapshot Storage/Retrieval Logic ---
    // Methods adapted from the intended ValuationRepository implementation

    pub async fn save_snapshots(&self, snapshots: &[AccountStateSnapshot]) -> Result<()> {
        use crate::schema::holdings_snapshots::dsl::*;

        if snapshots.is_empty() {
            debug!("save_snapshots called with no snapshots. Nothing to save.");
            return Ok(());
        }

        let db_models: Vec<AccountStateSnapshotDB> = snapshots
            .iter()
            .cloned()
            .map(AccountStateSnapshotDB::from)
            .collect();
        debug!(
            "Saving {} snapshots to DB via SnapshotRepository",
            db_models.len()
        );
        self.writer
            .exec(move |conn| {
                diesel::replace_into(holdings_snapshots)
                    .values(&db_models)
                    .execute(conn)?;
                Ok(())
            })
            .await
    }

    pub fn get_snapshots_by_account(
        &self,
        input_account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        use crate::schema::holdings_snapshots::dsl::*;
        let mut conn = get_connection(&self.pool)?;
        let mut query = holdings_snapshots
            .into_boxed()
            .filter(account_id.eq(input_account_id));
        if let Some(start) = start_date_opt {
            query = query.filter(snapshot_date.ge(start.format("%Y-%m-%d").to_string()));
        }
        if let Some(end) = end_date_opt {
            query = query.filter(snapshot_date.le(end.format("%Y-%m-%d").to_string()));
        }
        let result_db = query
            .order(snapshot_date.asc())
            .load::<AccountStateSnapshotDB>(&mut conn)?;
        debug!(
            "Loaded {} snapshots for account {} from DB via SnapshotRepository",
            result_db.len(),
            input_account_id
        );
        Ok(result_db
            .into_iter()
            .map(AccountStateSnapshot::from)
            .collect())
    }

    pub fn get_latest_snapshot_before_date(
        &self,
        input_account_id: &str,
        target_date: NaiveDate,
    ) -> Result<Option<AccountStateSnapshot>> {
        use crate::schema::holdings_snapshots::dsl::*;
        let mut conn = get_connection(&self.pool)?;
        let target_date_str = target_date.format("%Y-%m-%d").to_string();
        let result_db = holdings_snapshots
            .filter(account_id.eq(input_account_id))
            .filter(snapshot_date.le(&target_date_str))
            .order(snapshot_date.desc())
            .first::<AccountStateSnapshotDB>(&mut conn)
            .optional()?;
        Ok(result_db.map(AccountStateSnapshot::from))
    }

    pub fn get_latest_snapshots_before_date(
        &self,
        account_ids_vec: &[String],
        target_date: NaiveDate,
    ) -> Result<HashMap<String, AccountStateSnapshot>> {
        if account_ids_vec.is_empty() {
            return Ok(HashMap::new());
        }

        let mut conn = get_connection(&self.pool)?;
        let target_date_str = target_date.format("%Y-%m-%d").to_string(); // SQLite expects date strings

        let placeholders: String = account_ids_vec
            .iter()
            .map(|_| "?")
            .collect::<Vec<&str>>()
            .join(", ");

        // Fields: id, account_id, snapshot_date, currency, positions, cash_balances, cost_basis, net_contribution, calculated_at
        let sql = format!(
            "WITH RankedSnapshots AS ( \
                SELECT \
                    id, account_id, snapshot_date, currency, positions, \
                    cash_balances, cost_basis, net_contribution, net_contribution_base, calculated_at, \
                    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY snapshot_date DESC) as rn \
                FROM {} \
                WHERE account_id IN ({}) AND snapshot_date <= ? \
            ) \
            SELECT \
                id, account_id, snapshot_date, currency, positions, \
                cash_balances, cost_basis, net_contribution, net_contribution_base, calculated_at \
            FROM RankedSnapshots \
            WHERE rn = 1",
            "holdings_snapshots", // Use direct table name string
            placeholders
        );

        let mut query_builder = sql_query(sql).into_boxed::<Sqlite>();

        for acc_id_str in account_ids_vec {
            query_builder = query_builder.bind::<Text, _>(acc_id_str);
        }
        // Bind the target_date_str as the last parameter
        query_builder = query_builder.bind::<Text, _>(target_date_str); // SQLite uses TEXT for dates

        let latest_snapshots_db: Vec<AccountStateSnapshotDB> =
            query_builder.load::<AccountStateSnapshotDB>(&mut conn)?;

        let results_map: HashMap<String, AccountStateSnapshot> = latest_snapshots_db
            .into_iter()
            .map(|db_item| {
                (
                    db_item.account_id.clone(),
                    AccountStateSnapshot::from(db_item),
                )
            })
            .collect();

        Ok(results_map)
    }

    pub fn get_all_latest_snapshots(
        &self,
        account_ids_vec: &[String],
    ) -> Result<HashMap<String, AccountStateSnapshot>> {
        if account_ids_vec.is_empty() {
            return Ok(HashMap::new());
        }

        let mut conn = get_connection(&self.pool)?;

        let placeholders: String = account_ids_vec
            .iter()
            .map(|_| "?")
            .collect::<Vec<&str>>()
            .join(", ");

        // Fields: id, account_id, snapshot_date, currency, positions, cash_balances, cost_basis, net_contribution, calculated_at
        let sql = format!(
            "WITH RankedSnapshots AS ( \
                SELECT \
                    id, account_id, snapshot_date, currency, positions, \
                    cash_balances, cost_basis, net_contribution,  calculated_at, net_contribution_base,\
                    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY snapshot_date DESC) as rn \
                FROM {} \
                WHERE account_id IN ({}) \
            ) \
            SELECT \
                id, account_id, snapshot_date, currency, positions, \
                cash_balances, cost_basis, net_contribution, calculated_at, net_contribution_base \
            FROM RankedSnapshots \
            WHERE rn = 1",
            "holdings_snapshots",
            placeholders
        );

        let mut query_builder = sql_query(sql).into_boxed::<Sqlite>();

        for acc_id_str in account_ids_vec {
            query_builder = query_builder.bind::<Text, _>(acc_id_str);
        }

        let latest_snapshots_db: Vec<AccountStateSnapshotDB> =
            query_builder.load::<AccountStateSnapshotDB>(&mut conn)?;

        let results_map: HashMap<String, AccountStateSnapshot> = latest_snapshots_db
            .into_iter()
            .map(|db_item| {
                (
                    db_item.account_id.clone(),
                    AccountStateSnapshot::from(db_item),
                )
            })
            .collect();

        Ok(results_map)
    }

    pub async fn delete_snapshots_by_account_ids(
        &self,
        account_ids_to_delete: &[String],
    ) -> Result<usize> {
        use crate::schema::holdings_snapshots::dsl::*;
        if account_ids_to_delete.is_empty() {
            return Ok(0);
        }

        // Clone the input slice
        let final_ids = account_ids_to_delete.to_vec();

        self.writer
            .exec(move |conn| {
                let deleted_count =
                    diesel::delete(holdings_snapshots.filter(account_id.eq_any(final_ids)))
                        .execute(conn)?;
                Ok(deleted_count)
            })
            .await
    }

    pub async fn delete_snapshots_for_account_and_dates(
        &self,
        input_account_id: &str,
        dates_to_delete: &[NaiveDate],
    ) -> Result<()> {
        use crate::schema::holdings_snapshots::dsl::*;
        if dates_to_delete.is_empty() {
            debug!("delete_snapshots_for_account_and_dates: No dates specified for account {}. Nothing to delete.", input_account_id);
            return Ok(());
        }

        let account_id_owned = input_account_id.to_string();
        let date_strings: Vec<String> = dates_to_delete
            .iter()
            .map(|d| d.format("%Y-%m-%d").to_string())
            .collect();

        self.writer
            .exec(move |conn| {
                debug!(
                    "Deleting snapshots for account {} on dates: {:?} via SnapshotRepository",
                    account_id_owned,
                    date_strings // Use the moved date_strings
                );
                diesel::delete(
                    holdings_snapshots
                        .filter(account_id.eq(account_id_owned))
                        .filter(snapshot_date.eq_any(date_strings)),
                )
                .execute(conn)?;
                Ok(())
            })
            .await
    }

    pub async fn delete_snapshots_for_account_in_range(
        &self,
        input_account_id: &str,
        start_date_val: NaiveDate,
        end_date_val: NaiveDate,
    ) -> Result<()> {
        use crate::schema::holdings_snapshots::dsl::*;

        let account_id_owned = input_account_id.to_string();
        let start_date_str = start_date_val.format("%Y-%m-%d").to_string();
        let end_date_str = end_date_val.format("%Y-%m-%d").to_string();

        self.writer
            .exec(move |conn| {
                diesel::delete(
                    holdings_snapshots
                        .filter(account_id.eq(account_id_owned))
                        .filter(snapshot_date.ge(start_date_str))
                        .filter(snapshot_date.le(end_date_str)),
                )
                .execute(conn)?;
                Ok(())
            })
            .await
    }

    pub async fn overwrite_snapshots_for_account_in_range(
        &self,
        target_account_id: &str,
        range_start_date: NaiveDate,
        range_end_date: NaiveDate,
        snapshots_to_save: &[AccountStateSnapshot],
    ) -> Result<()> {
        // It's crucial that these operations appear atomic for a given account's range.
        // The current writer.exec handles individual Diesel calls transactionally.
        // For true atomicity of delete + save, this whole block should be one transaction.
        // However, self.writer.exec itself creates a transaction for each call.
        // For now, we rely on sequential execution. A deeper refactor of WriteHandle might be needed for true multi-statement transactions.

        self.delete_snapshots_for_account_in_range(
            target_account_id,
            range_start_date,
            range_end_date,
        )
        .await?;

        if !snapshots_to_save.is_empty() {
            // Filter snapshots_to_save to ensure they are indeed for the target_account_id
            // although the caller should guarantee this.
            let account_specific_snapshots: Vec<AccountStateSnapshot> = snapshots_to_save
                .iter()
                .filter(|s| s.account_id == target_account_id)
                .cloned()
                .collect();

            if account_specific_snapshots.len() != snapshots_to_save.len() {
                warn!(
                    "overwrite_snapshots_for_account_in_range: Mismatch between provided snapshots and target_account_id {}. Expected all {} for this account.",
                    target_account_id, snapshots_to_save.len()
                );
                // Decide on error handling: proceed with filtered, or error out?
                // For now, proceed with filtered, but this indicates a caller issue.
            }

            if !account_specific_snapshots.is_empty() {
                self.save_snapshots(&account_specific_snapshots).await?;
            } else if snapshots_to_save.is_empty() {
                debug!("overwrite_snapshots_for_account_in_range: No new snapshots provided for account {} after deleting range. Only delete was performed.", target_account_id);
            } else {
                warn!("overwrite_snapshots_for_account_in_range: All provided snapshots were filtered out for account {}. No save performed after delete.", target_account_id);
            }
        } else {
            debug!("overwrite_snapshots_for_account_in_range: No new snapshots provided for account {}. Only delete was performed for range [{}, {}].", target_account_id, range_start_date, range_end_date);
        }
        Ok(())
    }

    pub async fn overwrite_multiple_account_snapshot_ranges(
        &self,
        new_snapshots: &[AccountStateSnapshot],
    ) -> Result<()> {
        if new_snapshots.is_empty() {
            return Ok(());
        }

        let mut snapshots_by_account: HashMap<String, Vec<AccountStateSnapshot>> = HashMap::new();
        for snapshot in new_snapshots {
            snapshots_by_account
                .entry(snapshot.account_id.clone())
                .or_default()
                .push(snapshot.clone());
        }

        for (acc_id, acc_snapshots) in snapshots_by_account {
            if acc_snapshots.is_empty() {
                // Should not happen if new_snapshots was not empty
                continue;
            }

            // Determine min/max date for this account's specific snapshots
            // Panics if acc_snapshots is empty, but we checked above.
            let mut min_date = acc_snapshots.first().unwrap().snapshot_date;
            let mut max_date = acc_snapshots.first().unwrap().snapshot_date;

            for snapshot in acc_snapshots.iter().skip(1) {
                if snapshot.snapshot_date < min_date {
                    min_date = snapshot.snapshot_date;
                }
                if snapshot.snapshot_date > max_date {
                    max_date = snapshot.snapshot_date;
                }
            }

            // Now call the per-account overwrite method
            self.overwrite_snapshots_for_account_in_range(
                &acc_id,
                min_date,
                max_date,
                &acc_snapshots, // Pass the already filtered and cloned vec for this account
            )
            .await?;
        }
        Ok(())
    }

    pub fn get_total_portfolio_snapshots(
        &self,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        self.get_snapshots_by_account(PORTFOLIO_TOTAL_ACCOUNT_ID, start_date_opt, end_date_opt)
    }

    pub fn get_all_active_account_snapshots(
        &self,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        use crate::schema::accounts::dsl as accounts_dsl;
        use crate::schema::holdings_snapshots::dsl::*;
        let mut conn = get_connection(&self.pool)?;
        let active_account_ids: Vec<String> = accounts_dsl::accounts
            .filter(accounts_dsl::is_active.eq(true))
            .select(accounts_dsl::id)
            .load::<String>(&mut conn)?;
        if active_account_ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut query = holdings_snapshots
            .into_boxed()
            .filter(account_id.ne("TOTAL"))
            .filter(account_id.eq_any(active_account_ids));
        if let Some(start) = start_date_opt {
            query = query.filter(snapshot_date.ge(start.format("%Y-%m-%d").to_string()));
        }
        if let Some(end) = end_date_opt {
            query = query.filter(snapshot_date.le(end.format("%Y-%m-%d").to_string()));
        }
        let result_db = query
            .order(snapshot_date.asc())
            .load::<AccountStateSnapshotDB>(&mut conn)?;
        Ok(result_db
            .into_iter()
            .map(AccountStateSnapshot::from)
            .collect())
    }

    pub fn get_earliest_snapshot_date(&self, input_account_id: &str) -> Result<Option<NaiveDate>> {
        use crate::schema::holdings_snapshots::dsl::*;
        let mut conn = get_connection(&self.pool)?;

        let earliest_date_str = holdings_snapshots
            .filter(account_id.eq(input_account_id))
            .select(snapshot_date)
            .order(snapshot_date.asc())
            .first::<String>(&mut conn)
            .optional()?;

        match earliest_date_str {
            Some(date_str) => NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .map(Some)
                .map_err(|e| {
                    Error::Unexpected(format!(
                        "Failed to parse earliest date '{}': {}",
                        date_str, e
                    ))
                }),
            None => Ok(None), // No snapshots found for this account
        }
    }

    pub async fn overwrite_all_snapshots_for_account(
        &self,
        target_account_id: &str,
        snapshots_to_save: &[AccountStateSnapshot],
    ) -> Result<()> {
        use crate::schema::holdings_snapshots::dsl::*;
        let account_id_owned = target_account_id.to_string();
        let db_models: Vec<AccountStateSnapshotDB> = snapshots_to_save
            .iter()
            .cloned()
            .map(AccountStateSnapshotDB::from)
            .collect();

        self.writer
            .exec(move |conn| {
                // Delete all for this account
                diesel::delete(holdings_snapshots.filter(account_id.eq(&account_id_owned)))
                    .execute(conn)?;

                // Save new ones
                if !db_models.is_empty() {
                    diesel::replace_into(holdings_snapshots)
                        .values(&db_models)
                        .execute(conn)?;
                }
                Ok(())
            })
            .await
    }
}

// Implement the trait methods for SnapshotRepository
#[async_trait]
impl SnapshotRepositoryTrait for SnapshotRepository {
    async fn save_snapshots(&self, snapshots: &[AccountStateSnapshot]) -> Result<()> {
        SnapshotRepository::save_snapshots(self, snapshots).await
    }

    fn get_snapshots_by_account(
        &self,
        account_id_param: &str,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        self.get_snapshots_by_account(account_id_param, start_date, end_date)
    }

    fn get_latest_snapshot_before_date(
        &self,
        account_id_param: &str,
        date: NaiveDate,
    ) -> Result<Option<AccountStateSnapshot>> {
        self.get_latest_snapshot_before_date(account_id_param, date)
    }

    fn get_latest_snapshots_before_date(
        &self,
        account_ids_param: &[String],
        date: NaiveDate,
    ) -> Result<HashMap<String, AccountStateSnapshot>> {
        self.get_latest_snapshots_before_date(account_ids_param, date)
    }

    fn get_all_latest_snapshots(
        &self,
        account_ids_param: &[String],
    ) -> Result<HashMap<String, AccountStateSnapshot>> {
        self.get_all_latest_snapshots(account_ids_param)
    }

    async fn delete_snapshots_by_account_ids(&self, account_ids_param: &[String]) -> Result<usize> {
        Ok(self
            .delete_snapshots_by_account_ids(account_ids_param)
            .await?)
    }

    async fn delete_snapshots_for_account_and_dates(
        &self,
        account_id_param: &str,
        dates_to_delete: &[NaiveDate],
    ) -> Result<()> {
        self.delete_snapshots_for_account_and_dates(account_id_param, dates_to_delete)
            .await
    }

    async fn delete_snapshots_for_account_in_range(
        &self,
        account_id_param: &str,
        start_date_param: NaiveDate,
        end_date_param: NaiveDate,
    ) -> Result<()> {
        self.delete_snapshots_for_account_in_range(
            account_id_param,
            start_date_param,
            end_date_param,
        )
        .await
    }

    async fn overwrite_snapshots_for_account_in_range(
        &self,
        target_account_id: &str,
        range_start_date: NaiveDate,
        range_end_date: NaiveDate,
        snapshots_to_save: &[AccountStateSnapshot],
    ) -> Result<()> {
        self.overwrite_snapshots_for_account_in_range(
            target_account_id,
            range_start_date,
            range_end_date,
            snapshots_to_save,
        )
        .await
    }

    async fn overwrite_multiple_account_snapshot_ranges(
        &self,
        new_snapshots: &[AccountStateSnapshot],
    ) -> Result<()> {
        self.overwrite_multiple_account_snapshot_ranges(new_snapshots)
            .await
    }

    fn get_total_portfolio_snapshots(
        &self,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        self.get_total_portfolio_snapshots(start_date, end_date)
    }

    fn get_all_active_account_snapshots(
        &self,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        self.get_all_active_account_snapshots(start_date, end_date)
    }

    fn get_earliest_snapshot_date(&self, account_id_param: &str) -> Result<Option<NaiveDate>> {
        self.get_earliest_snapshot_date(account_id_param)
    }

    async fn overwrite_all_snapshots_for_account(
        &self,
        account_id: &str,
        snapshots_to_save: &[AccountStateSnapshot],
    ) -> Result<()> {
        self.overwrite_all_snapshots_for_account(account_id, snapshots_to_save)
            .await
    }
}
