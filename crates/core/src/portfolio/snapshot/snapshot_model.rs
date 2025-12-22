//! Portfolio snapshot domain models.

use chrono::{NaiveDate, NaiveDateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::Position;

/// Represents a warning that occurred during holdings calculation.
/// These are non-fatal issues where calculation continued but with potential data quality concerns.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingsCalculationWarning {
    pub activity_id: String,
    pub account_id: String,
    pub date: NaiveDate,
    pub message: String,
}

impl std::fmt::Display for HoldingsCalculationWarning {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Activity {} (account: {}, date: {}): {}",
            self.activity_id, self.account_id, self.date, self.message
        )
    }
}

/// Result of holdings calculation containing both the snapshot and any warnings.
/// The snapshot is always returned (even on partial failures), but warnings indicate
/// which activities could not be processed correctly.
#[derive(Debug, Clone)]
pub struct HoldingsCalculationResult {
    pub snapshot: AccountStateSnapshot,
    pub warnings: Vec<HoldingsCalculationWarning>,
}

impl HoldingsCalculationResult {
    pub fn new(snapshot: AccountStateSnapshot) -> Self {
        Self {
            snapshot,
            warnings: Vec::new(),
        }
    }

    pub fn with_warnings(
        snapshot: AccountStateSnapshot,
        warnings: Vec<HoldingsCalculationWarning>,
    ) -> Self {
        Self { snapshot, warnings }
    }

    pub fn has_warnings(&self) -> bool {
        !self.warnings.is_empty()
    }
}

/// Represents the comprehensive state of an account at the close of a specific day.
/// This becomes the primary data structure stored and retrieved by the ValuationRepository.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    #[serde(default)]
    pub net_contribution_base: Decimal, // portfolio base currency

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
            net_contribution_base: Decimal::ZERO,
            calculated_at: Utc::now().naive_utc(),
        }
    }
}
