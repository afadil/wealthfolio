use chrono::{NaiveDate, NaiveDateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr; 

use diesel::prelude::*;
use diesel::sql_types::Text;

use crate::constants::DECIMAL_PRECISION;

use super::Position;

// Represents the comprehensive state of an account at the close of a specific day.
// This becomes the primary data structure stored and retrieved by the ValuationRepository.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)] // Added PartialEq for easier testing/comparison
#[serde(rename_all = "camelCase")]
pub struct AccountStateSnapshot {
    pub id: String, // e.g., "ACCOUNTID_YYYY-MM-DD" or unique DB ID
    pub account_id: String,
    pub snapshot_date: NaiveDate,
    pub currency: String, // Account's reporting currency

    // --- Core State ---
    // Use the detailed Position struct for accuracy, including lots.
    #[serde(default)]
    pub positions: HashMap<String, Position>, // asset_id -> Position (holds quantity, lots, cost basis info)

    #[serde(default)]
    pub cash_balances: HashMap<String, Decimal>, // currency -> amount

    // --- Calculated Aggregates (Account Currency) ---
    #[serde(default)]
    pub cost_basis: Decimal, // Sum of cost basis of all positions
    #[serde(default)]
    pub net_contribution: Decimal, // Cumulative net deposits in account currency

    pub calculated_at: NaiveDateTime, // When this snapshot was generated
}

impl Default for AccountStateSnapshot {
    fn default() -> Self {
        AccountStateSnapshot {
            id: String::new(),
            account_id: String::new(),
            snapshot_date: NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(),
            currency: String::new(),
            positions: HashMap::new(),
            cash_balances: HashMap::new(),
            cost_basis: Decimal::ZERO,
            net_contribution: Decimal::ZERO,
            calculated_at: Utc::now().naive_utc(),
        }
    }
}

// --- DB Representation ---

#[derive(Debug, Clone, Queryable, QueryableByName, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::holdings_snapshots)] // Point to the schema table
#[diesel(check_for_backend(diesel::sqlite::Sqlite))] // Specify backend if needed
#[serde(rename_all = "camelCase")]
pub struct AccountStateSnapshotDB {
    #[diesel(sql_type = Text)]
    pub id: String, // PK: "ACCOUNTID_YYYY-MM-DD"
    #[diesel(sql_type = Text)]
    pub account_id: String,
    #[diesel(sql_type = Text)] // Store date as YYYY-MM-DD string
    pub snapshot_date: String,
    #[diesel(sql_type = Text)]
    pub currency: String,

    // Store complex types as JSON strings
    #[diesel(sql_type = Text)] // Store HashMap<String, Position> as JSON
    pub positions: String,
    #[diesel(sql_type = Text)] // Store HashMap<String, Decimal> as JSON
    pub cash_balances: String,

    // Store Decimals as TEXT
    #[diesel(sql_type = Text)]
    pub cost_basis: String,
    #[diesel(sql_type = Text)]
    pub net_contribution: String,

    #[diesel(sql_type = Text)]
    pub calculated_at: String,
}

// --- Conversions ---

// Conversion from DB model to Domain model
impl From<AccountStateSnapshotDB> for AccountStateSnapshot {
    fn from(db: AccountStateSnapshotDB) -> Self {
        Self {
            id: db.id.clone(),
            account_id: db.account_id,
            snapshot_date: NaiveDate::parse_from_str(&db.snapshot_date, "%Y-%m-%d")
                .unwrap_or_default(),
            currency: db.currency,
            positions: serde_json::from_str(&db.positions).unwrap_or_default(),
            cash_balances: serde_json::from_str(&db.cash_balances).unwrap_or_default(),
            cost_basis: Decimal::from_str(&db.cost_basis).unwrap_or_default(),
            net_contribution: Decimal::from_str(&db.net_contribution).unwrap_or_default(),
            calculated_at: NaiveDateTime::parse_from_str(
                &db.calculated_at,
                "%Y-%m-%dT%H:%M:%S%.fZ",
            )
            .unwrap_or_else(|e| {
                log::error!(
                    "Failed to parse DB calculated_at '{}': {}",
                    db.calculated_at,
                    e
                );
                Utc::now().naive_utc() // Fallback to current time
            }),
        }
    }
}

// Conversion from Domain model to DB model
impl From<AccountStateSnapshot> for AccountStateSnapshotDB {
    fn from(domain: AccountStateSnapshot) -> Self {
        Self {
            id: domain.id.clone(),
            account_id: domain.account_id,
            snapshot_date: domain.snapshot_date.format("%Y-%m-%d").to_string(),
            currency: domain.currency,
            positions: serde_json::to_string(&domain.positions)
                .unwrap_or_else(|_| "{}".to_string()),
            cash_balances: serde_json::to_string(&domain.cash_balances)
                .unwrap_or_else(|_| "{}".to_string()),
            cost_basis: domain.cost_basis.round_dp(DECIMAL_PRECISION).to_string(),
            net_contribution: domain
                .net_contribution
                .round_dp(DECIMAL_PRECISION)
                .to_string(),
            calculated_at: domain
                .calculated_at
                .format("%Y-%m-%dT%H:%M:%S%.fZ")
                .to_string(),
        }
    }
}
