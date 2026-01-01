//! Database model for account state snapshots.

use chrono::{NaiveDate, NaiveDateTime, Utc};
use diesel::prelude::*;
use diesel::sql_types::Text;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use wealthfolio_core::constants::DECIMAL_PRECISION;
use wealthfolio_core::portfolio::snapshot::AccountStateSnapshot;

/// Database model for account state snapshots
#[derive(Debug, Clone, Queryable, QueryableByName, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::holdings_snapshots)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct AccountStateSnapshotDB {
    #[diesel(sql_type = Text)]
    pub id: String,
    #[diesel(sql_type = Text)]
    pub account_id: String,
    #[diesel(sql_type = Text)]
    pub snapshot_date: String,
    #[diesel(sql_type = Text)]
    pub currency: String,
    #[diesel(sql_type = Text)]
    pub positions: String,
    #[diesel(sql_type = Text)]
    pub cash_balances: String,
    #[diesel(sql_type = Text)]
    pub cost_basis: String,
    #[diesel(sql_type = Text)]
    pub net_contribution: String,
    #[diesel(sql_type = Text)]
    pub calculated_at: String,
    #[diesel(sql_type = Text)]
    pub net_contribution_base: String,
    #[diesel(sql_type = Text)]
    pub cash_total_account_currency: String,
    #[diesel(sql_type = Text)]
    pub cash_total_base_currency: String,
}

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
            net_contribution_base: Decimal::from_str(&db.net_contribution_base).unwrap_or_default(),
            cash_total_account_currency: Decimal::from_str(&db.cash_total_account_currency)
                .unwrap_or_default(),
            cash_total_base_currency: Decimal::from_str(&db.cash_total_base_currency)
                .unwrap_or_default(),
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
                Utc::now().naive_utc()
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
            net_contribution_base: domain
                .net_contribution_base
                .round_dp(DECIMAL_PRECISION)
                .to_string(),
            cash_total_account_currency: domain
                .cash_total_account_currency
                .round_dp(DECIMAL_PRECISION)
                .to_string(),
            cash_total_base_currency: domain
                .cash_total_base_currency
                .round_dp(DECIMAL_PRECISION)
                .to_string(),
            calculated_at: domain
                .calculated_at
                .format("%Y-%m-%dT%H:%M:%S%.fZ")
                .to_string(),
        }
    }
}
