//! Persisted tax lots.
//!
//! A [`LotRecord`] is the durable, relational form of a tax lot: one row per
//! acquisition (or transferred sub-lot), updated in-place as shares are disposed.
//! This is distinct from the in-memory [`crate::portfolio::snapshot::Lot`], which
//! is a computation intermediate produced by the holdings calculator.
//!
//! Lot rows are initially written alongside the existing JSON snapshot path as a
//! parallel record. Quantity mismatches between the two representations are logged
//! at CRITICAL severity so they can be caught before the lots table becomes
//! the authoritative source.
//!
//! `open_activity_id` is intentionally left NULL in this parallel-write phase.
//! Transferred sub-lots use composite IDs (e.g. `<activity_id>_lot2`) that do not
//! correspond to any row in the `activities` table, so linking them would violate
//! the foreign-key constraint. The column will be populated once incremental lot
//! maintenance replaces the full-replay approach.

use async_trait::async_trait;
use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;

use crate::errors::Result;
use crate::portfolio::snapshot::AccountStateSnapshot;

// ── Repository trait ──────────────────────────────────────────────────────────

/// Persistence interface for lot rows.
#[async_trait]
pub trait LotRepositoryTrait: Send + Sync {
    /// Replaces all open lot rows for the given account with the provided records.
    /// Existing rows for the account are deleted before inserting new ones.
    async fn replace_lots_for_account(&self, account_id: &str, lots: &[LotRecord]) -> Result<()>;
}

// ── Domain types ──────────────────────────────────────────────────────────────

/// A row in the `lots` table — a persisted tax lot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotRecord {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,

    /// Date the lot was opened (ISO 8601, e.g. "2024-03-15").
    pub open_date: String,
    /// The activity that created this lot. NULL when the lot originates from a
    /// transferred sub-lot whose ID does not directly correspond to an activity row.
    pub open_activity_id: Option<String>,

    /// Total quantity acquired. Never changes after creation.
    pub original_quantity: String,
    /// Quantity still held. Reduced on each disposal.
    pub remaining_quantity: String,

    /// Cost per unit in the asset's quote currency.
    pub cost_per_unit: String,
    /// Total cost basis (cost_per_unit × original_quantity + fee_allocated).
    pub total_cost_basis: String,
    /// Transaction fees allocated to this lot.
    pub fee_allocated: String,

    /// Cost basis disposal method for this lot.
    pub disposal_method: DisposalMethod,

    /// True once remaining_quantity reaches zero.
    pub is_closed: bool,

    /// Date the lot was fully disposed (ISO 8601). None if still open.
    pub close_date: Option<String>,
    /// The activity that fully closed this lot. None if still open.
    pub close_activity_id: Option<String>,

    /// Tax flags — not yet populated; reserved for future tax-lot analysis.
    pub is_wash_sale: bool,
    pub holding_period: Option<HoldingPeriod>,

    pub created_at: String,
    pub updated_at: String,
}

/// Cost basis disposal method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DisposalMethod {
    /// First in, first out (default).
    #[default]
    Fifo,
    /// Last in, first out.
    Lifo,
    /// Highest cost first (tax-loss harvesting).
    Hifo,
    /// Weighted average cost (Canada ACB, many international jurisdictions).
    AvgCost,
    /// User selects specific lots.
    SpecificId,
}

impl DisposalMethod {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fifo => "FIFO",
            Self::Lifo => "LIFO",
            Self::Hifo => "HIFO",
            Self::AvgCost => "AVG_COST",
            Self::SpecificId => "SPECIFIC_ID",
        }
    }
}

/// Holding period for capital gains classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HoldingPeriod {
    ShortTerm,
    LongTerm,
}

// ── Extraction helpers ────────────────────────────────────────────────────────

/// Converts the in-memory lots from a holdings snapshot into [`LotRecord`]s
/// suitable for persisting to the `lots` table.
///
/// Each open lot in every position of the snapshot becomes one row.
/// `open_activity_id` is always `None` — see the module-level doc for the reason.
/// `original_quantity` equals `remaining_quantity` because the snapshot only
/// carries the still-open portion of each lot.
pub fn extract_lot_records(snapshot: &AccountStateSnapshot) -> Vec<LotRecord> {
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let mut records = Vec::new();

    for position in snapshot.positions.values() {
        for lot in &position.lots {
            records.push(LotRecord {
                id: lot.id.clone(),
                account_id: snapshot.account_id.clone(),
                asset_id: position.asset_id.clone(),
                open_date: lot.acquisition_date.format("%Y-%m-%d").to_string(),
                open_activity_id: None,
                original_quantity: lot.quantity.to_string(),
                remaining_quantity: lot.quantity.to_string(),
                cost_per_unit: lot.acquisition_price.to_string(),
                total_cost_basis: lot.cost_basis.to_string(),
                fee_allocated: lot.acquisition_fees.to_string(),
                disposal_method: DisposalMethod::Fifo,
                is_closed: false,
                close_date: None,
                close_activity_id: None,
                is_wash_sale: false,
                holding_period: None,
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        }
    }

    records
}

/// Checks that the lot quantities extracted from a snapshot are consistent with
/// the position quantities stored in that same snapshot.
///
/// Any discrepancy is logged at ERROR severity so it can be investigated before
/// the lots table is relied upon for live calculations.
pub fn check_lot_quantity_consistency(snapshot: &AccountStateSnapshot, lot_records: &[LotRecord]) {
    let mut lot_qty_by_asset: HashMap<&str, Decimal> = HashMap::new();
    for record in lot_records {
        let qty = Decimal::from_str(&record.remaining_quantity).unwrap_or(Decimal::ZERO);
        *lot_qty_by_asset
            .entry(record.asset_id.as_str())
            .or_insert(Decimal::ZERO) += qty;
    }

    for (asset_id, position) in &snapshot.positions {
        let lot_qty = lot_qty_by_asset
            .get(asset_id.as_str())
            .copied()
            .unwrap_or(Decimal::ZERO);
        if lot_qty != position.quantity {
            log::error!(
                "CRITICAL: lot quantity mismatch for account {} asset {}: \
                 lots sum to {}, position reports {}",
                snapshot.account_id,
                asset_id,
                lot_qty,
                position.quantity
            );
        }
    }
}
