use crate::errors::{Error, Result};
use crate::portfolio::snapshot::AccountStateSnapshot;
use crate::portfolio::snapshot::AccountStateSnapshotDB;
use chrono::NaiveDate;
use diesel::connection::Connection;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::Arc;
use diesel::sql_query;
use diesel::sql_types::Text; 
use diesel::sqlite::Sqlite; 

use crate::db::get_connection;
use log::debug;

pub trait SnapshotRepositoryTrait: Send + Sync {
    fn save_snapshots(&self, snapshots: &[AccountStateSnapshot]) -> Result<()>;

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

    fn delete_snapshots_by_account_ids(&self, account_ids: &[String]) -> Result<()>;

    fn delete_snapshots_for_account_and_dates(
        &self,
        account_id: &str,
        dates_to_delete: &[NaiveDate],
    ) -> Result<()>;

    fn delete_snapshots_for_account_in_range(
        &self,
        account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
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

    /// Replaces all snapshots for multiple accounts within a single transaction.
    /// If `is_full_recalc_delete_done` is true, assumes a global delete occurred and skips ranged deletes.
    fn replace_all_snapshots(
        &self,
        all_keyframes: &[AccountStateSnapshot],
        is_full_recalc_delete_done: bool,
    ) -> Result<()>;
}

pub struct SnapshotRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl SnapshotRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }

    // --- Implement Snapshot Storage/Retrieval Logic ---
    // Methods adapted from the intended ValuationRepository implementation

    pub fn save_snapshots(&self, snapshots: &[AccountStateSnapshot]) -> Result<()> {
        use crate::schema::holdings_snapshots::dsl::*;

        if snapshots.is_empty() {
            return Ok(());
        }
        let mut conn = get_connection(&self.pool)?;
        let db_models: Vec<AccountStateSnapshotDB> = snapshots
            .iter()
            .cloned()
            .map(AccountStateSnapshotDB::from)
            .collect();
        debug!(
            "Saving {} snapshots to DB via SnapshotRepository",
            db_models.len()
        );
        diesel::replace_into(holdings_snapshots)
            .values(&db_models)
            .execute(&mut conn)?;
        Ok(())
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
                    cash_balances, cost_basis, net_contribution, calculated_at, \
                    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY snapshot_date DESC) as rn \
                FROM {} \
                WHERE account_id IN ({}) AND snapshot_date <= ? \
            ) \
            SELECT \
                id, account_id, snapshot_date, currency, positions, \
                cash_balances, cost_basis, net_contribution, calculated_at \
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

        let latest_snapshots_db: Vec<AccountStateSnapshotDB> = query_builder
            .load::<AccountStateSnapshotDB>(&mut conn)?;

        let results_map: HashMap<String, AccountStateSnapshot> = latest_snapshots_db
            .into_iter()
            .map(|db_item| (db_item.account_id.clone(), AccountStateSnapshot::from(db_item)))
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
                    cash_balances, cost_basis, net_contribution, calculated_at, \
                    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY snapshot_date DESC) as rn \
                FROM {} \
                WHERE account_id IN ({}) \
            ) \
            SELECT \
                id, account_id, snapshot_date, currency, positions, \
                cash_balances, cost_basis, net_contribution, calculated_at \
            FROM RankedSnapshots \
            WHERE rn = 1",
            "holdings_snapshots",
            placeholders
        );

        let mut query_builder = sql_query(sql).into_boxed::<Sqlite>();

        for acc_id_str in account_ids_vec {
            query_builder = query_builder.bind::<Text, _>(acc_id_str);
        }

        let latest_snapshots_db: Vec<AccountStateSnapshotDB> = query_builder
            .load::<AccountStateSnapshotDB>(&mut conn)?;

        let results_map: HashMap<String, AccountStateSnapshot> = latest_snapshots_db
            .into_iter()
            .map(|db_item| (db_item.account_id.clone(), AccountStateSnapshot::from(db_item)))
            .collect();

        Ok(results_map)
    }

    pub fn delete_snapshots_by_account_ids(&self, account_ids_to_delete: &[String]) -> Result<()> {
        use crate::schema::holdings_snapshots::dsl::*;
        if account_ids_to_delete.is_empty() {
            return Ok(());
        }
        let mut conn = get_connection(&self.pool)?;
        conn.transaction(|conn_tx| -> Result<()> {
            // Clone the input slice to potentially add "TOTAL"
            let final_ids = account_ids_to_delete.to_vec();
            if final_ids.is_empty() {
                return Ok(());
            } // Check again if only "TOTAL" was potentially added
            debug!(
                "Deleting snapshots for account IDs: {:?} via SnapshotRepository",
                final_ids
            );
            diesel::delete(holdings_snapshots.filter(account_id.eq_any(final_ids)))
                .execute(conn_tx)?;
            Ok(())
        })
        .map_err(Error::from)
    }

    pub fn delete_snapshots_for_account_and_dates(
        &self,
        input_account_id: &str,
        dates_to_delete: &[NaiveDate],
    ) -> Result<()> {
        use crate::schema::holdings_snapshots::dsl::*;
        if dates_to_delete.is_empty() {
            return Ok(());
        }
        let mut conn = get_connection(&self.pool)?;
        let date_strings: Vec<String> = dates_to_delete
            .iter()
            .map(|d| d.format("%Y-%m-%d").to_string())
            .collect();
        debug!(
            "Deleting snapshots for account {} on dates: {:?} via SnapshotRepository",
            input_account_id, date_strings
        );
        diesel::delete(
            holdings_snapshots
                .filter(account_id.eq(input_account_id))
                .filter(snapshot_date.eq_any(date_strings)),
        )
        .execute(&mut conn)?;
        Ok(())
    }

    pub fn delete_snapshots_for_account_in_range(
        &self,
        input_account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<()> {
        use crate::schema::holdings_snapshots::dsl::*;
        let mut conn = get_connection(&self.pool)?;
        let start_date_str = start_date.format("%Y-%m-%d").to_string();
        let end_date_str = end_date.format("%Y-%m-%d").to_string();
        debug!(
            "Deleting snapshots for account {} from {} to {} via SnapshotRepository",
            input_account_id, start_date_str, end_date_str
        );
        diesel::delete(
            holdings_snapshots
                .filter(account_id.eq(input_account_id))
                .filter(snapshot_date.ge(start_date_str))
                .filter(snapshot_date.le(end_date_str)),
        )
        .execute(&mut conn)?;
        Ok(())
    }

    pub fn get_total_portfolio_snapshots(
        &self,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        self.get_snapshots_by_account("TOTAL", start_date_opt, end_date_opt)
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

    pub fn replace_all_snapshots(
        &self,
        all_keyframes: &[AccountStateSnapshot],
        is_full_recalc_delete_done: bool,
    ) -> Result<()> {
        use crate::schema::holdings_snapshots;
        use crate::schema::holdings_snapshots::dsl::*;

        if all_keyframes.is_empty() {
            debug!("replace_all_snapshots called with no keyframes. Nothing to do.");
            return Ok(());
        }

        let mut conn = get_connection(&self.pool)?;

        conn.transaction(|conn_tx| {
            if !is_full_recalc_delete_done {
                // Group keyframes by account ID to determine per-account deletion ranges for incremental updates
                let mut keyframes_by_account_for_delete: HashMap<String, Vec<&AccountStateSnapshot>> = HashMap::new();
                for kf in all_keyframes {
                    keyframes_by_account_for_delete
                        .entry(kf.account_id.clone())
                        .or_default()
                        .push(kf);
                }

                for (acc_id_str, acc_keyframes) in keyframes_by_account_for_delete {
                    if acc_keyframes.is_empty() { continue; }

                    // Sort snapshots by date to correctly determine range for this account
                    let mut sorted_acc_keyframes = acc_keyframes.to_vec(); // Clone refs for sorting
                    sorted_acc_keyframes.sort_by_key(|s| s.snapshot_date);

                    if let (Some(min_date), Some(max_date)) = (
                        sorted_acc_keyframes.first().map(|s| s.snapshot_date),
                        sorted_acc_keyframes.last().map(|s| s.snapshot_date),
                    ) {
                        debug!(
                            "Replace all snapshots (incremental part for account {}): Deleting existing snapshots from {} to {} in transaction",
                            acc_id_str, min_date, max_date
                        );
                        let start_date_str = min_date.format("%Y-%m-%d").to_string();
                        let end_date_str = max_date.format("%Y-%m-%d").to_string();
                        diesel::delete(
                            holdings_snapshots::table
                                .filter(account_id.eq(acc_id_str))
                                .filter(snapshot_date.ge(start_date_str))
                                .filter(snapshot_date.le(end_date_str)),
                        )
                        .execute(conn_tx)?;
                    }
                }
            } else {
                debug!(
                    "Replace all snapshots (full recalc): Skipping all per-account range deletes as full delete already occurred."
                );
            }

            // Save all new keyframes in a single batch operation
            let db_models_to_save: Vec<AccountStateSnapshotDB> = all_keyframes
                .iter()
                .cloned()
                .map(AccountStateSnapshotDB::from)
                .collect();
            
            if !db_models_to_save.is_empty() {
                debug!(
                    "Replace all snapshots: Saving {} snapshots to DB in a single batch (transactional)",
                    db_models_to_save.len()
                );
                diesel::replace_into(holdings_snapshots::table)
                    .values(&db_models_to_save)
                    .execute(conn_tx)?;
            } else {
                debug!("Replace all snapshots: No actual DB models to save after processing.");
            }

            Ok::<(), Error>(())
        })
    }
}

// Implement the trait methods for SnapshotRepository
impl SnapshotRepositoryTrait for SnapshotRepository {
    fn save_snapshots(&self, snapshots: &[AccountStateSnapshot]) -> Result<()> {
        SnapshotRepository::save_snapshots(self, snapshots)
    }

    fn get_snapshots_by_account(
        &self,
        account_id: &str,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        SnapshotRepository::get_snapshots_by_account(self, account_id, start_date, end_date)
    }

    fn get_latest_snapshot_before_date(
        &self,
        account_id: &str,
        date: NaiveDate,
    ) -> Result<Option<AccountStateSnapshot>> {
        SnapshotRepository::get_latest_snapshot_before_date(self, account_id, date)
    }

    fn get_latest_snapshots_before_date(
        &self,
        account_ids: &[String],
        date: NaiveDate,
    ) -> Result<HashMap<String, AccountStateSnapshot>> {
        SnapshotRepository::get_latest_snapshots_before_date(self, account_ids, date)
    }

    fn get_all_latest_snapshots(
        &self,
        account_ids: &[String],
    ) -> Result<HashMap<String, AccountStateSnapshot>> {
        SnapshotRepository::get_all_latest_snapshots(self, account_ids)
    }

    fn delete_snapshots_by_account_ids(&self, account_ids: &[String]) -> Result<()> {
        SnapshotRepository::delete_snapshots_by_account_ids(self, account_ids)
    }

    fn delete_snapshots_for_account_and_dates(
        &self,
        account_id: &str,
        dates_to_delete: &[NaiveDate],
    ) -> Result<()> {
        SnapshotRepository::delete_snapshots_for_account_and_dates(
            self,
            account_id,
            dates_to_delete,
        )
    }

    fn delete_snapshots_for_account_in_range(
        &self,
        account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<()> {
        SnapshotRepository::delete_snapshots_for_account_in_range(
            self, account_id, start_date, end_date,
        )
    }

    fn get_total_portfolio_snapshots(
        &self,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        SnapshotRepository::get_total_portfolio_snapshots(self, start_date, end_date)
    }

    fn get_all_active_account_snapshots(
        &self,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<AccountStateSnapshot>> {
        SnapshotRepository::get_all_active_account_snapshots(self, start_date, end_date)
    }

    fn get_earliest_snapshot_date(&self, account_id: &str) -> Result<Option<NaiveDate>> {
        SnapshotRepository::get_earliest_snapshot_date(self, account_id)
    }

    fn replace_all_snapshots(
        &self,
        all_keyframes: &[AccountStateSnapshot],
        is_full_recalc_delete_done: bool,
    ) -> Result<()> {
        SnapshotRepository::replace_all_snapshots(self, all_keyframes, is_full_recalc_delete_done)
    }
}
