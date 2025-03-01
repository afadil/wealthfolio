use crate::errors::{Error, Result, DatabaseError};
use crate::models::PortfolioHistory;
use crate::accounts::accounts_model::Account;
use diesel::prelude::*;
use diesel::r2d2::{Pool, ConnectionManager};
use diesel::SqliteConnection;
use diesel::connection::Connection;
use diesel::result::Error as DieselError;
use diesel::sql_types::Text;
use std::collections::HashMap;
use std::sync::Arc;
use log;

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
        let result = portfolio_history.load::<PortfolioHistory>(&mut conn)?;
        Ok(result)
    }

    pub fn get_by_account(&self, input_account_id: Option<&str>) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        let mut query = portfolio_history.into_boxed();

        if let Some(other_id) = input_account_id {
            query = query.filter(account_id.eq(other_id));
        }

        let result = query.order(date.asc()).load::<PortfolioHistory>(&mut conn)?;
        Ok(result)
    }

    pub fn get_latest_by_account(&self, input_account_id: &str) -> Result<PortfolioHistory> {
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        let result = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.desc())
            .first(&mut conn)?;

        Ok(result)
    }

    pub fn save_batch(&self, history_data: &[PortfolioHistory]) -> Result<()> {
        use crate::schema::portfolio_history::dsl::*;

        let mut conn = self.get_connection()?;
        conn.transaction(|conn| -> std::result::Result<(), DieselError> {
            // Process in chunks to avoid memory issues
            for history in history_data {
                diesel::insert_into(portfolio_history)
                    .values(history)
                    .on_conflict(id)
                    .do_nothing()
                    .execute(conn)?;
            }
            Ok(())
        })?;
        
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
        let query = "
            SELECT ph.*
            FROM portfolio_history ph
            INNER JOIN (
                SELECT account_id, MAX(date) as max_date
                FROM portfolio_history
                WHERE account_id = ?
                GROUP BY account_id
            ) latest
            ON ph.account_id = latest.account_id AND ph.date = latest.max_date
        ";

        let mut conn = self.get_connection()?;
        let mut last_histories = Vec::new();

        for account_id in account_ids {
            let history = diesel::sql_query(query)
                .bind::<Text, _>(account_id)
                .get_result::<PortfolioHistory>(&mut conn);

            match history {
                Ok(history) => {
                    last_histories.push(history);
                }
                Err(DieselError::NotFound) => {
                    // Skip if no history found for this account
                    log::warn!("No history found for account {}", account_id);
                }
                Err(e) => {
                    return Err(Error::Database(DatabaseError::QueryFailed(e)));
                }
            }
        }

        let result: HashMap<String, Option<PortfolioHistory>> = last_histories
            .into_iter()
            .map(|history| (history.account_id.clone(), Some(history)))
            .collect();

        Ok(result)
    }
} 