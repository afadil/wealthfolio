use crate::errors::{Error, Result, DatabaseError};
use crate::models::PortfolioHistory;
use crate::accounts::accounts_model::Account;
use diesel::prelude::*;
use diesel::r2d2::{Pool, ConnectionManager};
use diesel::SqliteConnection;
use diesel::connection::Connection;
use diesel::result::Error as DieselError;
use log::info;
use std::collections::HashMap;
use std::sync::Arc;

use crate::models::PortfolioHistoryDB;

pub struct HistoryRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl HistoryRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }

    fn get_connection(&self) -> Result<r2d2::PooledConnection<ConnectionManager<SqliteConnection>>> {
        self.pool
            .get()
            .map_err(|e| Error::Database(DatabaseError::PoolCreationFailed(e.into())))
    }

    pub fn get_all(&self) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        let result = portfolio_history.load::<PortfolioHistoryDB>(&mut conn)?;
        Ok(result.into_iter().map(PortfolioHistory::from).collect())
    }

    pub fn get_by_account(&self, input_account_id: Option<&str>) -> Result<Vec<PortfolioHistory>> {

        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        let mut query = portfolio_history.into_boxed();

        if let Some(other_id) = input_account_id {
            query = query.filter(account_id.eq(other_id));
        }

        let result = query.order(date.asc()).load::<PortfolioHistoryDB>(&mut conn)?;
        Ok(result.into_iter().map(PortfolioHistory::from).collect())
    }

    pub fn get_latest_by_account(&self, input_account_id: &str) -> Result<PortfolioHistory> {
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        let result = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.desc())
            .first::<PortfolioHistoryDB>(&mut conn)?;
        Ok(PortfolioHistory::from(result))
    }

    pub fn save_batch(&self, history_data: &[PortfolioHistory]) -> Result<()> {
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;

        // Convert domain models to DB models
        let db_models: Vec<PortfolioHistoryDB> = history_data
            .iter()
            .cloned()
            .map(PortfolioHistoryDB::from)
            .collect();

        diesel::replace_into(portfolio_history)
            .values(&db_models)
            .execute(&mut conn)?;

        Ok(())
    }

    pub fn delete_by_accounts(&self, accounts: &[Account]) -> Result<()> {
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        conn.transaction(|conn| -> std::result::Result<(), DieselError> {
            let mut account_ids: Vec<String> = accounts.iter().map(|a| a.id.clone()).collect();
            account_ids.push("TOTAL".to_string());

            // Ensure deletion completes before any new inserts
            diesel::delete(portfolio_history.filter(account_id.eq_any(account_ids)))
                .execute(conn)?;
            
            Ok(())
        })?;

        Ok(())
    }

    pub fn get_all_last_histories(
        &self,
        account_ids: &[String],
    ) -> Result<HashMap<String, Option<PortfolioHistory>>> {
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        let mut results = HashMap::new();

        for acc_id in account_ids {
            let last_history = portfolio_history
                .filter(account_id.eq(acc_id))
                .order(date.desc())
                .first::<PortfolioHistoryDB>(&mut conn)
                .optional()?;

            results.insert(
                acc_id.to_string(),
                last_history.map(PortfolioHistory::from),
            );
        }

        Ok(results)
    }


    /// Get all portfolio histories for active accounts, excluding the TOTAL account
    pub fn get_all_active_account_histories(&self) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::accounts::dsl as accounts_dsl;
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        
        // Get active account IDs
        let active_account_ids: Vec<String> = accounts_dsl::accounts
            .filter(accounts_dsl::is_active.eq(true))
            .select(accounts_dsl::id)
            .load::<String>(&mut conn)?;

        // Get all histories for active accounts, excluding TOTAL
        let result = portfolio_history
            .filter(account_id.ne("TOTAL"))
            .filter(account_id.eq_any(active_account_ids))
            .order(date.asc())
            .load::<PortfolioHistoryDB>(&mut conn)?;

        Ok(result.into_iter().map(PortfolioHistory::from).collect())
    }
} 