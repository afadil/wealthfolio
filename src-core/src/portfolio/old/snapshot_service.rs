use crate::errors::{Result, Error};
use crate::models::{Portfolio, PortfolioSnapshotDB};
use crate::schema::portfolio_snapshots::dsl::*;
use chrono::NaiveDate;
use diesel::prelude::*;
use diesel::r2d2::{Pool, ConnectionManager};
use diesel::SqliteConnection;
use log::{error, info, warn};
use std::sync::Arc;

pub struct SnapshotService {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl SnapshotService {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        SnapshotService { pool }
    }

    // Get the latest snapshot for a given account (e.g., "TOTAL")
    pub fn get_latest_snapshot(&self, target_account_id: &str) -> Result<Option<Portfolio>> {
        info!("Fetching latest snapshot for account: {}", target_account_id);
        let mut conn = self.pool.get()
            .map_err(|e| Error::Database(format!("Failed to get DB connection: {}", e)))?;

        match portfolio_snapshots
            .filter(account_id.eq(target_account_id))
            .order(snapshot_date.desc()) // Order by date string YYYY-MM-DD desc
            .first::<PortfolioSnapshotDB>(&mut conn)
            .optional()
        {
            Ok(Some(snapshot_db)) => {
                info!("Found latest snapshot ID: {} dated {}", snapshot_db.id, snapshot_db.snapshot_date);
                match serde_json::from_str(&snapshot_db.portfolio_state_json) {
                    Ok(portfolio) => Ok(Some(portfolio)),
                    Err(e) => {
                        error!(
                            "Failed to deserialize latest snapshot {} for account '{}': {}",
                            snapshot_db.id, target_account_id, e
                        );
                        // Consider deleting or marking the corrupted snapshot?
                        Err(Error::Serialization(format!("Corrupted snapshot data for ID {}: {}", snapshot_db.id, e)))
                    }
                }
            }
            Ok(None) => {
                 info!("No snapshot found for account: {}", target_account_id);
                 Ok(None) // No snapshot found is not an error
            }
            Err(diesel::NotFound) => { // Explicitly handle NotFound if needed, though optional() covers it
                 info!("No snapshot found (NotFound) for account: {}", target_account_id);
                 Ok(None)
            }
            Err(e) => {
                error!("Database error fetching latest snapshot for account '{}': {}", target_account_id, e);
                 Err(Error::Database(e.to_string()))
            }
        }
    }

     // Get snapshots within a date range
     pub fn get_snapshots_in_range(
        &self,
        target_account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Portfolio>> {
        info!(
            "Fetching snapshots for account: {} from {} to {}",
            target_account_id, start_date, end_date
        );
        let mut conn = self.pool.get()
             .map_err(|e| Error::Database(format!("Failed to get DB connection: {}", e)))?;

        let start_date_str = start_date.format("%Y-%m-%d").to_string();
        let end_date_str = end_date.format("%Y-%m-%d").to_string();

        match portfolio_snapshots
            .filter(account_id.eq(target_account_id))
            .filter(snapshot_date.ge(start_date_str))
            .filter(snapshot_date.le(end_date_str))
            .order(snapshot_date.asc()) // Order chronologically
            .load::<PortfolioSnapshotDB>(&mut conn)
        {
            Ok(snapshots_db) => {
                info!("Found {} snapshots in DB for range.", snapshots_db.len());
                let mut portfolios = Vec::with_capacity(snapshots_db.len());
                for snapshot_db in snapshots_db {
                    match serde_json::from_str(&snapshot_db.portfolio_state_json) {
                        Ok(portfolio) => portfolios.push(portfolio),
                        Err(e) => {
                            warn!(
                                "Failed to deserialize snapshot {} (date {}) for account '{}': {}. Skipping.",
                                snapshot_db.id, snapshot_db.snapshot_date, target_account_id, e
                            );
                            // Continue processing other valid snapshots
                        }
                    }
                }
                Ok(portfolios)
            }
            Err(e) => {
                 error!(
                    "Database error fetching snapshots for account '{}' in range {} - {}: {}",
                    target_account_id, start_date, end_date, e
                );
                Err(Error::Database(e.to_string()))
            }
        }
    }

     // Add more functions as needed, e.g., get specific snapshot by date
     pub fn get_snapshot_by_date(&self, target_account_id: &str, date: NaiveDate) -> Result<Option<Portfolio>> {
         info!("Fetching snapshot for account: {} on date {}", target_account_id, date);
         let mut conn = self.pool.get()
            .map_err(|e| Error::Database(format!("Failed to get DB connection: {}", e)))?;
         let date_str = date.format("%Y-%m-%d").to_string();

         match portfolio_snapshots
            .filter(account_id.eq(target_account_id))
            .filter(snapshot_date.eq(date_str))
            .first::<PortfolioSnapshotDB>(&mut conn)
            .optional()
         {
             Ok(Some(snapshot_db)) => {
                 info!("Found snapshot ID: {}", snapshot_db.id);
                match serde_json::from_str(&snapshot_db.portfolio_state_json) {
                    Ok(portfolio) => Ok(Some(portfolio)),
                    Err(e) => {
                        error!(
                            "Failed to deserialize snapshot {} for account '{}' on date {}: {}",
                            snapshot_db.id, target_account_id, date, e
                        );
                         Err(Error::Serialization(format!("Corrupted snapshot data for ID {}: {}", snapshot_db.id, e)))
                    }
                }
            }
            Ok(None) => {
                 info!("No snapshot found for account: {} on date {}", target_account_id, date);
                 Ok(None)
            }
            Err(e) => {
                 error!(
                    "Database error fetching snapshot for account '{}' on date {}: {}",
                    target_account_id, date, e
                );
                Err(Error::Database(e.to_string()))
            }
         }
     }
} 