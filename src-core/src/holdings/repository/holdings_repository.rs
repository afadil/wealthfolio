use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel::r2d2::{Pool, ConnectionManager, PooledConnection};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use std::str::FromStr;
use std::sync::Arc;
use log::{debug, error, info};

// Use your domain models
use crate::holdings::{Position, Lot, CashHolding, Holding};
// Use your generated schema
use crate::{schema, Result, Error};
// Use the DB model structs
use crate::holdings::repository::db_models::{PositionDb, LotDb, CashHoldingDb}; 

pub trait HoldingsRepositoryTrait {
    fn save_account_holdings(&self, account_id: &str, holdings: Vec<Holding>) -> Result<()>;
    fn get_account_holdings(&self, account_id: &str) -> Result<Vec<Holding>>;
    fn get_all_holdings(&self) -> Result<Vec<Holding>>;
}

// --- SQLite Implementation ---

#[derive(Clone)] // Add Clone if you need to clone the repository instance
pub struct HoldingsRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, // Store the pool wrapped in Arc
}

impl HoldingsRepository {
    /// Creates a new repository instance with the database connection pool.
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }

    /// Helper to get a connection from the pool.
    fn establish_connection(&self) -> Result<PooledConnection<ConnectionManager<SqliteConnection>>> {
        self.pool.get().map_err(|e| Error::Database(e.into()))
    }

    // --- Data Conversion Helpers ---

    fn position_to_db(pos: &Position, now_str: &str) -> PositionDb {
        PositionDb {
            id: pos.id.clone(),
            account_id: pos.account_id.clone(),
            asset_id: pos.asset_id.clone(),
            currency: pos.currency.clone(),
            quantity: pos.quantity.to_string(),
            average_cost: pos.average_cost.to_string(),
            total_cost_basis: pos.total_cost_basis.to_string(),
            inception_date: pos.inception_date.to_rfc3339(),
            last_updated: now_str.to_string(),
        }
    }

    fn lot_to_db(lot: &Lot, now_str: &str) -> LotDb {
        LotDb {
            id: lot.id.clone(),
            position_id: lot.position_id.clone(),
            acquisition_date: lot.acquisition_date.to_rfc3339(),
            quantity: lot.quantity.to_string(),
            cost_basis: lot.cost_basis.to_string(),
            acquisition_price: lot.acquisition_price.to_string(),
            acquisition_fees: lot.acquisition_fees.to_string(),
            last_updated: now_str.to_string(),
        }
    }

     fn cash_to_db(cash: &CashHolding, now_str: &str) -> CashHoldingDb {
        CashHoldingDb {
            id: cash.id.clone(),
            account_id: cash.account_id.clone(),
            currency: cash.currency.clone(),
            amount: cash.amount.to_string(),
            last_updated: now_str.to_string(), // Use provided timestamp
        }
    }

     fn position_from_db(pos_db: PositionDb, lots_db: Vec<LotDb>) -> Result<Position> {
        let quantity = Decimal::from_str(&pos_db.quantity)?;
        let average_cost = Decimal::from_str(&pos_db.average_cost)?;
        let total_cost_basis = Decimal::from_str(&pos_db.total_cost_basis)?;
        let inception_date = DateTime::parse_from_rfc3339(&pos_db.inception_date)?
            .with_timezone(&Utc);

         let lots = lots_db.into_iter()
            .map(|lot_db| Self::lot_from_db(lot_db))
            .collect::<Result<Vec<Lot>>>()?; // Collect results, propagate error

        Ok(Position {
            id: pos_db.id,
            account_id: pos_db.account_id,
            asset_id: pos_db.asset_id,
            currency: pos_db.currency,
            quantity,
            average_cost,
            total_cost_basis,
            inception_date,
            lots,
        })
    }

     fn lot_from_db(lot_db: LotDb) -> Result<Lot> {
         let quantity = Decimal::from_str(&lot_db.quantity)?;
         let cost_basis = Decimal::from_str(&lot_db.cost_basis)?;
         let acquisition_price = Decimal::from_str(&lot_db.acquisition_price)?;
         let acquisition_fees = Decimal::from_str(&lot_db.acquisition_fees)?;
         let acquisition_date = DateTime::parse_from_rfc3339(&lot_db.acquisition_date)?
              .with_timezone(&Utc);

         Ok(Lot {
             id: lot_db.id,
             position_id: lot_db.position_id,
             acquisition_date,
             quantity,
             cost_basis,
             acquisition_price,
             acquisition_fees,
         })
    }

     fn cash_from_db(cash_db: CashHoldingDb) -> Result<CashHolding> {
         let amount = Decimal::from_str(&cash_db.amount)?;
         let last_updated = DateTime::parse_from_rfc3339(&cash_db.last_updated)?
              .with_timezone(&Utc);

         Ok(CashHolding {
             id: cash_db.id,
             account_id: cash_db.account_id,
             currency: cash_db.currency,
             amount,
             last_updated,
         })
    }
}


impl HoldingsRepositoryTrait for HoldingsRepository {
    /// Saves the complete current holdings state for ONE account.
    /// Implements a "delete-then-insert-all" strategy within a transaction.
    fn save_account_holdings(&self, target_account_id: &str, holdings: Vec<Holding>) -> Result<()> {
        debug!("Saving holdings for account {}", target_account_id);
        let mut conn = self.establish_connection()?;

        conn.transaction(|tx_conn| {
            // 1. Delete existing holdings for this account
            debug!("Deleting existing holdings data for account {}", target_account_id);

            // Delete Lots first (due to FK constraint) associated with positions of this account
            let positions_to_delete = schema::positions::table
                .filter(schema::positions::account_id.eq(target_account_id))
                .select(schema::positions::id); // Select IDs to use in Lot deletion

            diesel::delete(schema::lots::table.filter(schema::lots::position_id.eq_any(positions_to_delete)))
                .execute(tx_conn)?;

            // Delete Positions
            diesel::delete(schema::positions::table.filter(schema::positions::account_id.eq(target_account_id)))
                .execute(tx_conn)?;

            // Delete Cash Holdings
            diesel::delete(schema::cash_holdings::table.filter(schema::cash_holdings::account_id.eq(target_account_id)))
                .execute(tx_conn)?;

            // 2. Prepare and Insert New Holdings data
            if holdings.is_empty() {
                 info!("No holdings provided for account {}, state cleared.", target_account_id);
                 return Ok(()); // Nothing more to do
            }

            let mut positions_to_insert = Vec::new();
            let mut lots_to_insert = Vec::new();
            let mut cash_to_insert = Vec::new();
            let now_str = Utc::now().to_rfc3339(); // Consistent timestamp for this save operation

            for holding in holdings {
                match holding {
                    Holding::Security(pos) => {
                        if pos.account_id != target_account_id {
                            error!("Position {} belongs to wrong account {}", pos.id, pos.account_id);
                            return Err(Error::Repository("Position account ID mismatch".to_string()));
                        }
                        positions_to_insert.push(Self::position_to_db(&pos, &now_str));
                        for lot in pos.lots {
                             if lot.position_id != pos.id {
                                 error!("Lot {} belongs to wrong position {}", lot.id, lot.position_id);
                                 return Err(Error::Repository("Lot position ID mismatch".to_string()));
                             }
                            lots_to_insert.push(Self::lot_to_db(&lot, &now_str));
                        }
                    }
                    Holding::Cash(cash) => {
                         if cash.account_id != target_account_id {
                             error!("CashHolding {} belongs to wrong account {}", cash.id, cash.account_id);
                            return Err(Error::Repository("CashHolding account ID mismatch".to_string()));
                         }
                        // Use the cash object's last_updated if meaningful, otherwise use 'now'
                        let cash_time = cash.last_updated.to_rfc3339();
                        cash_to_insert.push(Self::cash_to_db(&cash, &cash_time)); // Use cash's time
                    }
                }
            }

            debug!("Inserting {} positions, {} lots, {} cash holdings for account {}",
                   positions_to_insert.len(), lots_to_insert.len(), cash_to_insert.len(), target_account_id);

            // Batch Insert (Diesel handles this efficiently)
            if !positions_to_insert.is_empty() {
                diesel::insert_into(schema::positions::table)
                    .values(&positions_to_insert)
                    .execute(tx_conn)?;
            }
            if !lots_to_insert.is_empty() {
                 diesel::insert_into(schema::lots::table)
                     .values(&lots_to_insert)
                     .execute(tx_conn)?;
            }
             if !cash_to_insert.is_empty() {
                  diesel::insert_into(schema::cash_holdings::table)
                      .values(&cash_to_insert)
                      .execute(tx_conn)?;
             }

            Ok(()) // Commit transaction
        }) // End transaction closure
    }


    /// Retrieves the complete current holdings state for ONE account.
    fn get_account_holdings(&self, target_account_id: &str) -> Result<Vec<Holding>> {
        debug!("Getting holdings for account {}", target_account_id);
        let mut conn = self.establish_connection()?;

        // 1. Fetch Positions for the account
        let positions_db = schema::positions::table
            .filter(schema::positions::account_id.eq(target_account_id))
            .load::<PositionDb>(&mut conn)?;

        // Fetch Cash Holdings for the specific account
        let cash_db = schema::cash_holdings::table
            .filter(schema::cash_holdings::account_id.eq(target_account_id))
            .load::<CashHoldingDb>(&mut conn)?;

        // Early return if no positions or cash found for this account
        if positions_db.is_empty() && cash_db.is_empty() {
            debug!("No holdings found for account {}", target_account_id);
            return Ok(Vec::new());
        }

        // Process positions only if they exist
        let mut security_holdings = Vec::new();
        if !positions_db.is_empty() {
             // 2. Fetch all Lots belonging to these positions efficiently
            let lots_db = LotDb::belonging_to(&positions_db)
                 .load::<LotDb>(&mut conn)?
                 .grouped_by(&positions_db); // Group lots by their parent position

            // 3. Combine Positions with their Lots
            security_holdings = positions_db.into_iter().zip(lots_db)
                 .map(|(pos_db, pos_lots_db)| {
                     Self::position_from_db(pos_db, pos_lots_db).map(Holding::Security)
                 })
                 .collect::<Result<Vec<Holding>>>()?;
        }

        // Process cash holdings
        let mut cash_holdings = cash_db.into_iter()
            .map(|ch_db| Self::cash_from_db(ch_db).map(Holding::Cash))
            .collect::<Result<Vec<Holding>>>()?;

        // 5. Combine and Return
        security_holdings.append(&mut cash_holdings);

        debug!("Retrieved {} total holdings for account {}", security_holdings.len(), target_account_id);
        Ok(security_holdings)
    }

    /// Retrieves the complete current holdings state across ALL accounts.
    fn get_all_holdings(&self) -> Result<Vec<Holding>> {
        debug!("Getting holdings for ALL accounts");
        let mut conn = self.establish_connection()?;

        // 1. Fetch ALL Positions
        let all_positions_db = schema::positions::table.load::<PositionDb>(&mut conn)?;

        // 2. Fetch ALL Cash Holdings
        let all_cash_db = schema::cash_holdings::table.load::<CashHoldingDb>(&mut conn)?;

        if all_positions_db.is_empty() && all_cash_db.is_empty() {
            debug!("No holdings found in the database.");
            return Ok(Vec::new());
        }

        // 3. Fetch all Lots efficiently (only if positions exist)
        let mut security_holdings = Vec::new();
        if !all_positions_db.is_empty() {
            let all_lots_db = LotDb::belonging_to(&all_positions_db)
                .load::<LotDb>(&mut conn)?
                .grouped_by(&all_positions_db); // Group lots by their parent position

            // 4. Combine Positions with their Lots
            security_holdings = all_positions_db.into_iter().zip(all_lots_db)
                .map(|(pos_db, pos_lots_db)| {
                    Self::position_from_db(pos_db, pos_lots_db).map(Holding::Security)
                })
                .collect::<Result<Vec<Holding>>>()?;
        }

        // 5. Convert Cash Holdings
        let mut cash_holdings = all_cash_db.into_iter()
            .map(|ch_db| Self::cash_from_db(ch_db).map(Holding::Cash))
            .collect::<Result<Vec<Holding>>>()?;

        // 6. Combine and Return
        security_holdings.append(&mut cash_holdings);

        // Optionally sort the final list here if needed before returning
        // security_holdings.sort_by(|a, b| { /* ... sort logic ... */ });

        debug!("Retrieved {} total holdings across all accounts", security_holdings.len());
        Ok(security_holdings)
    }
}

