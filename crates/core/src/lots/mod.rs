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
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;

use crate::activities::{
    Activity, ACTIVITY_TYPE_ADJUSTMENT, ACTIVITY_TYPE_SELL, ACTIVITY_TYPE_TRANSFER_OUT,
};
use crate::errors::Result;
use crate::portfolio::snapshot::AccountStateSnapshot;

// ── Repository trait ──────────────────────────────────────────────────────────

/// Records a lot that was fully disposed (remaining_quantity → 0).
///
/// Carries the full lot data so that `sync_lots_for_account` can INSERT the
/// closed lot even if it was never previously written to the database.  This
/// happens during a full recalc/replay: the lot is created and consumed
/// entirely within a single pass, so `extract_lot_records` (which only sees
/// lots still in the in-memory VecDeque) never produces a row for it.
#[derive(Debug, Clone)]
pub struct LotClosure {
    pub lot_id: String,
    /// ISO 8601 date the lot was fully consumed ("YYYY-MM-DD").
    pub close_date: String,
    /// The activity that fully disposed the lot, if known.
    pub close_activity_id: Option<String>,

    // ── Fields needed to INSERT the lot if it doesn't exist yet ──
    pub account_id: String,
    pub asset_id: String,
    /// ISO 8601 date the lot was opened ("YYYY-MM-DD").
    pub open_date: String,
    /// Quantity when the lot was first created.
    pub original_quantity: String,
    /// Cost per unit in the asset's quote currency.
    pub cost_per_unit: String,
    /// Total cost basis (cost_per_unit × original_quantity + fee).
    pub total_cost_basis: String,
    /// Transaction fees allocated to this lot.
    pub fee_allocated: String,
}

/// Persistence interface for lot rows.
#[async_trait]
pub trait LotRepositoryTrait: Send + Sync {
    /// Replaces all open lot rows for the given account with the provided records.
    /// Existing rows for the account are deleted before inserting new ones.
    async fn replace_lots_for_account(&self, account_id: &str, lots: &[LotRecord]) -> Result<()>;

    /// Returns all open (is_closed = 0) lot rows for the given account.
    async fn get_open_lots_for_account(&self, account_id: &str) -> Result<Vec<LotRecord>>;

    /// Returns all open (is_closed = 0) lot rows across all accounts.
    /// Used when building live holdings for the TOTAL pseudo-account.
    async fn get_all_open_lots(&self) -> Result<Vec<LotRecord>>;

    /// Returns all lots that were active on `date` for the specified accounts.
    /// A lot is active if: `open_date <= date AND (is_closed=0 OR close_date > date)`.
    async fn get_lots_as_of_date(
        &self,
        account_ids: &[String],
        date: NaiveDate,
    ) -> Result<Vec<LotRecord>>;

    /// Returns every lot row (open and closed) for the given account.
    /// Callers that need positions at multiple historical dates can fetch once
    /// and filter in memory using the `open_date` / `close_date` fields.
    async fn get_all_lots_for_account(&self, account_id: &str) -> Result<Vec<LotRecord>>;

    /// Returns every lot row (open and closed) across all accounts.
    /// Used when computing valuations for the TOTAL pseudo-account.
    async fn get_all_lots(&self) -> Result<Vec<LotRecord>>;

    /// Syncs the lots table for the given account without ever deleting rows:
    /// - Open lots in `open_lots` are upserted (inserted if new, remaining_quantity updated if changed).
    /// - Lots listed in `closures` are marked is_closed=1 with their close_date/activity.
    ///
    /// Replaces `replace_lots_for_account` once the transition to incremental lot maintenance
    /// is complete.
    async fn sync_lots_for_account(
        &self,
        account_id: &str,
        open_lots: &[LotRecord],
        closures: &[LotClosure],
    ) -> Result<()>;

    /// Returns total quantity per asset across all open lots (all accounts).
    /// Used for quote sync planning — determines which assets need price data.
    async fn get_open_position_quantities(&self) -> Result<HashMap<String, Decimal>>;

    /// Returns the total number of lot rows (open and closed) in the lots table.
    /// Used by the startup backfill to check if the table is empty.
    fn count_lots(&self) -> Result<i64>;
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
/// `original_quantity` comes from `lot.original_quantity` when available (new
/// snapshots). For old snapshots that predate the field (where it deserializes
/// as zero), falls back to `lot.quantity` (the remaining amount).
pub fn extract_lot_records(snapshot: &AccountStateSnapshot) -> Vec<LotRecord> {
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let mut records = Vec::new();

    for position in snapshot.positions.values() {
        for lot in &position.lots {
            let orig_qty = if lot.original_quantity.is_zero() {
                lot.quantity
            } else {
                lot.original_quantity
            };
            records.push(LotRecord {
                id: lot.id.clone(),
                account_id: snapshot.account_id.clone(),
                asset_id: position.asset_id.clone(),
                open_date: lot.acquisition_date.format("%Y-%m-%d").to_string(),
                open_activity_id: None,
                original_quantity: orig_qty.to_string(),
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
///
/// Returns the number of mismatches found (0 = all consistent).
pub fn check_lot_quantity_consistency(
    snapshot: &AccountStateSnapshot,
    lot_records: &[LotRecord],
) -> usize {
    let mut lot_qty_by_asset: HashMap<&str, Decimal> = HashMap::new();
    for record in lot_records {
        let qty = Decimal::from_str(&record.remaining_quantity).unwrap_or(Decimal::ZERO);
        *lot_qty_by_asset
            .entry(record.asset_id.as_str())
            .or_insert(Decimal::ZERO) += qty;
    }

    let mut mismatches = 0;
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
            mismatches += 1;
        }
    }
    mismatches
}

// ── Historical replay ────────────────────────────────────────────────────────

/// Adjusts lot quantities to reflect their state at `as_of_date` by replaying
/// activities (Sell, TransferOut, Adjustment, Split) in chronological order.
///
/// Each lot's `remaining_quantity` is reset to `original_quantity` (the
/// as-acquired, pre-split amount), then activities are applied:
/// - Sell/TransferOut/Adjustment: FIFO reduction of lot quantities
/// - Split: multiply all open lot quantities for that asset by the split ratio
///
/// Lots whose adjusted quantity reaches zero are removed from the result.
/// Lots with `original_quantity` of "0" (old snapshots that predate the field)
/// are returned as-is since there is no anchor to replay from.
pub fn replay_lots_to_date(
    lots: Vec<LotRecord>,
    activities: &[Activity],
    as_of_date: NaiveDate,
) -> Vec<LotRecord> {
    use crate::activities::ACTIVITY_TYPE_SPLIT;

    if lots.is_empty() {
        return lots;
    }

    // Filter to activity types that affect lot quantities, sorted by date
    let relevant_types = [
        ACTIVITY_TYPE_SELL,
        ACTIVITY_TYPE_TRANSFER_OUT,
        ACTIVITY_TYPE_ADJUSTMENT,
        ACTIVITY_TYPE_SPLIT,
    ];
    let mut relevant: Vec<&Activity> = activities
        .iter()
        .filter(|a| relevant_types.contains(&a.effective_type()))
        .filter(|a| a.activity_date.date_naive() <= as_of_date)
        .collect();
    relevant.sort_by_key(|a| a.activity_date);

    // Group lots by (account_id, asset_id), preserving FIFO order by open_date
    let mut groups: HashMap<(String, String), Vec<LotRecord>> = HashMap::new();
    for lot in lots {
        groups
            .entry((lot.account_id.clone(), lot.asset_id.clone()))
            .or_default()
            .push(lot);
    }
    for group in groups.values_mut() {
        group.sort_by(|a, b| a.open_date.cmp(&b.open_date));
    }

    // Reset each lot's remaining_quantity to original_quantity
    for group in groups.values_mut() {
        for lot in group.iter_mut() {
            let orig = Decimal::from_str(&lot.original_quantity).unwrap_or(Decimal::ZERO);
            if !orig.is_zero() {
                lot.remaining_quantity = lot.original_quantity.clone();
                let cost_per_unit = Decimal::from_str(&lot.cost_per_unit).unwrap_or(Decimal::ZERO);
                let fee = Decimal::from_str(&lot.fee_allocated).unwrap_or(Decimal::ZERO);
                lot.total_cost_basis = (orig * cost_per_unit + fee).to_string();
                lot.is_closed = false;
                lot.close_date = None;
                lot.close_activity_id = None;
            }
        }
    }

    // Replay activities in chronological order
    for activity in &relevant {
        let asset_id: String = match &activity.asset_id {
            Some(id) => id.clone(),
            None => continue,
        };
        let key = (activity.account_id.clone(), asset_id);
        let group = match groups.get_mut(&key) {
            Some(g) => g,
            None => continue,
        };

        if activity.effective_type() == ACTIVITY_TYPE_SPLIT {
            // Splits multiply all open lot quantities by the split ratio
            let split_ratio = activity.qty();
            if split_ratio.is_sign_positive() {
                for lot in group.iter_mut() {
                    let remaining =
                        Decimal::from_str(&lot.remaining_quantity).unwrap_or(Decimal::ZERO);
                    if remaining > Decimal::ZERO {
                        lot.remaining_quantity = (remaining * split_ratio).to_string();
                        // cost_per_unit adjusts inversely; total_cost_basis unchanged
                        let cpu = Decimal::from_str(&lot.cost_per_unit).unwrap_or(Decimal::ZERO);
                        if !split_ratio.is_zero() {
                            lot.cost_per_unit = (cpu / split_ratio).to_string();
                        }
                    }
                }
            }
        } else {
            // FIFO reduction for Sell/TransferOut/Adjustment
            let mut qty_to_reduce = activity.qty().abs();
            for lot in group.iter_mut() {
                if qty_to_reduce <= Decimal::ZERO {
                    break;
                }
                let remaining = Decimal::from_str(&lot.remaining_quantity).unwrap_or(Decimal::ZERO);
                if remaining <= Decimal::ZERO {
                    continue;
                }
                let reduce_from_lot = std::cmp::min(remaining, qty_to_reduce);
                let new_remaining = remaining - reduce_from_lot;
                lot.remaining_quantity = new_remaining.to_string();

                // Adjust cost basis proportionally
                let orig = Decimal::from_str(&lot.original_quantity).unwrap_or(Decimal::ONE);
                if !orig.is_zero() {
                    let cost_per_unit =
                        Decimal::from_str(&lot.cost_per_unit).unwrap_or(Decimal::ZERO);
                    let fee = Decimal::from_str(&lot.fee_allocated).unwrap_or(Decimal::ZERO);
                    lot.total_cost_basis =
                        (new_remaining * cost_per_unit + fee * new_remaining / orig).to_string();
                }

                if new_remaining <= Decimal::ZERO {
                    lot.is_closed = true;
                    lot.close_date = Some(
                        activity
                            .activity_date
                            .date_naive()
                            .format("%Y-%m-%d")
                            .to_string(),
                    );
                    lot.close_activity_id = Some(activity.id.clone());
                }

                qty_to_reduce -= reduce_from_lot;
            }
        }
    }

    // Return lots that still have positive quantity
    groups
        .into_values()
        .flatten()
        .filter(|lot| {
            let qty = Decimal::from_str(&lot.remaining_quantity).unwrap_or(Decimal::ZERO);
            qty > Decimal::ZERO
        })
        .collect()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::portfolio::snapshot::{AccountStateSnapshot, Lot, Position};
    use chrono::{TimeZone, Utc};
    use rust_decimal_macros::dec;
    use std::collections::{HashMap, VecDeque};

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn make_lot(
        id: &str,
        position_id: &str,
        date_ymd: (i32, u32, u32),
        qty: Decimal,
        price: Decimal,
        fee: Decimal,
    ) -> Lot {
        Lot {
            id: id.to_string(),
            position_id: position_id.to_string(),
            acquisition_date: Utc
                .with_ymd_and_hms(date_ymd.0, date_ymd.1, date_ymd.2, 0, 0, 0)
                .unwrap(),
            quantity: qty,
            original_quantity: qty,
            cost_basis: qty * price + fee,
            acquisition_price: price,
            acquisition_fees: fee,
            fx_rate_to_position: None,
        }
    }

    fn make_position(account_id: &str, asset_id: &str, currency: &str, lots: Vec<Lot>) -> Position {
        let mut pos = Position::new(
            account_id.to_string(),
            asset_id.to_string(),
            currency.to_string(),
            Utc::now(),
        );
        pos.lots = VecDeque::from(lots);
        pos.recalculate_aggregates();
        pos
    }

    fn make_snapshot(
        account_id: &str,
        positions: HashMap<String, Position>,
    ) -> AccountStateSnapshot {
        AccountStateSnapshot {
            id: format!("{}_test", account_id),
            account_id: account_id.to_string(),
            snapshot_date: chrono::NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
            currency: "USD".to_string(),
            positions,
            calculated_at: Utc::now().naive_utc(),
            ..Default::default()
        }
    }

    // ── extract_lot_records ───────────────────────────────────────────────────

    /// AAPL with 3 lots from different purchase dates — verifies multi-lot
    /// aggregation and field mapping.
    #[test]
    fn extract_lot_records_aapl_three_lots() {
        let lots = vec![
            make_lot(
                "buy-aapl-1",
                "POS-AAPL-acc1",
                (2024, 1, 15),
                dec!(50),
                dec!(185.00),
                dec!(0),
            ),
            make_lot(
                "buy-aapl-2",
                "POS-AAPL-acc1",
                (2024, 6, 1),
                dec!(30),
                dec!(192.50),
                dec!(0),
            ),
            make_lot(
                "buy-aapl-3",
                "POS-AAPL-acc1",
                (2024, 10, 15),
                dec!(20),
                dec!(225.00),
                dec!(0),
            ),
        ];
        let pos = make_position("acc1", "AAPL", "USD", lots);
        assert_eq!(pos.quantity, dec!(100));

        let mut positions = HashMap::new();
        positions.insert("AAPL".to_string(), pos);
        let snap = make_snapshot("acc1", positions);

        let records = extract_lot_records(&snap);

        assert_eq!(records.len(), 3);
        let total_qty: Decimal = records
            .iter()
            .map(|r| r.remaining_quantity.parse::<Decimal>().unwrap())
            .sum();
        assert_eq!(total_qty, dec!(100));

        for r in &records {
            assert_eq!(r.account_id, "acc1");
            assert_eq!(r.asset_id, "AAPL");
            assert!(r.open_activity_id.is_none());
            assert!(!r.is_closed);
        }

        // Spot-check first lot
        let r1 = records.iter().find(|r| r.id == "buy-aapl-1").unwrap();
        assert_eq!(r1.remaining_quantity.parse::<Decimal>().unwrap(), dec!(50));
        assert_eq!(r1.cost_per_unit.parse::<Decimal>().unwrap(), dec!(185.00));
        assert_eq!(r1.open_date, "2024-01-15");
    }

    /// LQD bond ETF with 2 lots — verifies correct handling of bond-like symbols.
    #[test]
    fn extract_lot_records_lqd_two_lots() {
        let lots = vec![
            make_lot(
                "buy-lqd-1",
                "POS-LQD-acc1",
                (2024, 2, 1),
                dec!(100),
                dec!(107.25),
                dec!(0),
            ),
            make_lot(
                "buy-lqd-2",
                "POS-LQD-acc1",
                (2024, 8, 15),
                dec!(50),
                dec!(112.10),
                dec!(0),
            ),
        ];
        let pos = make_position("acc1", "LQD", "USD", lots);
        assert_eq!(pos.quantity, dec!(150));

        let mut positions = HashMap::new();
        positions.insert("LQD".to_string(), pos);
        let snap = make_snapshot("acc1", positions);

        let records = extract_lot_records(&snap);
        assert_eq!(records.len(), 2);

        let total_qty: Decimal = records
            .iter()
            .map(|r| r.remaining_quantity.parse::<Decimal>().unwrap())
            .sum();
        assert_eq!(total_qty, dec!(150));
    }

    /// AAPL Jun 2026 $200 call option — verifies options symbols are handled
    /// the same as any other asset_id.
    #[test]
    fn extract_lot_records_aapl_option_single_lot() {
        let symbol = "AAPL260619C00200000";
        let lots = vec![make_lot(
            "buy-opt-1",
            &format!("POS-{}-acc1", symbol),
            (2025, 11, 1),
            dec!(5),
            dec!(8.50),
            dec!(0),
        )];
        let pos = make_position("acc1", symbol, "USD", lots);

        let mut positions = HashMap::new();
        positions.insert(symbol.to_string(), pos);
        let snap = make_snapshot("acc1", positions);

        let records = extract_lot_records(&snap);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].asset_id, symbol);
        assert_eq!(
            records[0].remaining_quantity.parse::<Decimal>().unwrap(),
            dec!(5)
        );
    }

    /// Multi-asset portfolio: AAPL (3 lots) + LQD (2 lots) + option (1 lot).
    #[test]
    fn extract_lot_records_mixed_portfolio() {
        let mut positions = HashMap::new();

        positions.insert(
            "AAPL".to_string(),
            make_position(
                "acc1",
                "AAPL",
                "USD",
                vec![
                    make_lot(
                        "buy-aapl-1",
                        "POS-AAPL-acc1",
                        (2024, 1, 15),
                        dec!(50),
                        dec!(185.00),
                        dec!(0),
                    ),
                    make_lot(
                        "buy-aapl-2",
                        "POS-AAPL-acc1",
                        (2024, 6, 1),
                        dec!(30),
                        dec!(192.50),
                        dec!(0),
                    ),
                    make_lot(
                        "buy-aapl-3",
                        "POS-AAPL-acc1",
                        (2024, 10, 15),
                        dec!(20),
                        dec!(225.00),
                        dec!(0),
                    ),
                ],
            ),
        );
        positions.insert(
            "LQD".to_string(),
            make_position(
                "acc1",
                "LQD",
                "USD",
                vec![
                    make_lot(
                        "buy-lqd-1",
                        "POS-LQD-acc1",
                        (2024, 2, 1),
                        dec!(100),
                        dec!(107.25),
                        dec!(0),
                    ),
                    make_lot(
                        "buy-lqd-2",
                        "POS-LQD-acc1",
                        (2024, 8, 15),
                        dec!(50),
                        dec!(112.10),
                        dec!(0),
                    ),
                ],
            ),
        );
        positions.insert(
            "AAPL260619C00200000".to_string(),
            make_position(
                "acc1",
                "AAPL260619C00200000",
                "USD",
                vec![make_lot(
                    "buy-opt-1",
                    "POS-AAPL260619C00200000-acc1",
                    (2025, 11, 1),
                    dec!(5),
                    dec!(8.50),
                    dec!(0),
                )],
            ),
        );

        let snap = make_snapshot("acc1", positions);
        let records = extract_lot_records(&snap);

        assert_eq!(records.len(), 6);

        let aapl_qty: Decimal = records
            .iter()
            .filter(|r| r.asset_id == "AAPL")
            .map(|r| r.remaining_quantity.parse::<Decimal>().unwrap())
            .sum();
        assert_eq!(aapl_qty, dec!(100));

        let lqd_qty: Decimal = records
            .iter()
            .filter(|r| r.asset_id == "LQD")
            .map(|r| r.remaining_quantity.parse::<Decimal>().unwrap())
            .sum();
        assert_eq!(lqd_qty, dec!(150));

        let opt_qty: Decimal = records
            .iter()
            .filter(|r| r.asset_id == "AAPL260619C00200000")
            .map(|r| r.remaining_quantity.parse::<Decimal>().unwrap())
            .sum();
        assert_eq!(opt_qty, dec!(5));
    }

    // ── check_lot_quantity_consistency ────────────────────────────────────────

    #[test]
    fn consistency_check_passes_when_quantities_match() {
        let mut positions = HashMap::new();
        positions.insert(
            "AAPL".to_string(),
            make_position(
                "acc1",
                "AAPL",
                "USD",
                vec![
                    make_lot(
                        "l1",
                        "POS-AAPL-acc1",
                        (2024, 1, 15),
                        dec!(50),
                        dec!(185),
                        dec!(0),
                    ),
                    make_lot(
                        "l2",
                        "POS-AAPL-acc1",
                        (2024, 6, 1),
                        dec!(50),
                        dec!(192),
                        dec!(0),
                    ),
                ],
            ),
        );
        let snap = make_snapshot("acc1", positions);
        let records = extract_lot_records(&snap);

        let mismatches = check_lot_quantity_consistency(&snap, &records);
        assert_eq!(mismatches, 0);
    }

    #[test]
    fn consistency_check_detects_quantity_mismatch() {
        // Build a snapshot where position.quantity says 100 but the lot records only sum to 50.
        let mut positions = HashMap::new();
        let mut pos = make_position(
            "acc1",
            "AAPL",
            "USD",
            vec![
                make_lot(
                    "l1",
                    "POS-AAPL-acc1",
                    (2024, 1, 15),
                    dec!(50),
                    dec!(185),
                    dec!(0),
                ),
                make_lot(
                    "l2",
                    "POS-AAPL-acc1",
                    (2024, 6, 1),
                    dec!(50),
                    dec!(192),
                    dec!(0),
                ),
            ],
        );
        // Manually inflate the position quantity to create a mismatch.
        pos.quantity = dec!(100);
        positions.insert("AAPL".to_string(), pos);
        let snap = make_snapshot("acc1", positions);

        // Build lot records that only total 50.
        let partial_records = vec![LotRecord {
            id: "l1".to_string(),
            account_id: "acc1".to_string(),
            asset_id: "AAPL".to_string(),
            open_date: "2024-01-15".to_string(),
            open_activity_id: None,
            original_quantity: "50".to_string(),
            remaining_quantity: "50".to_string(),
            cost_per_unit: "185".to_string(),
            total_cost_basis: "9250".to_string(),
            fee_allocated: "0".to_string(),
            disposal_method: DisposalMethod::Fifo,
            is_closed: false,
            close_date: None,
            close_activity_id: None,
            is_wash_sale: false,
            holding_period: None,
            created_at: "2024-01-15T00:00:00.000Z".to_string(),
            updated_at: "2024-01-15T00:00:00.000Z".to_string(),
        }];

        let mismatches = check_lot_quantity_consistency(&snap, &partial_records);
        assert_eq!(mismatches, 1);
    }

    // ── replay_lots_to_date tests ──────────────────────────────────────────

    fn make_lot_record(
        id: &str,
        account_id: &str,
        asset_id: &str,
        open_date: &str,
        original_qty: &str,
        remaining_qty: &str,
        cost_per_unit: &str,
    ) -> LotRecord {
        let orig = Decimal::from_str(original_qty).unwrap();
        let cpu = Decimal::from_str(cost_per_unit).unwrap();
        LotRecord {
            id: id.to_string(),
            account_id: account_id.to_string(),
            asset_id: asset_id.to_string(),
            open_date: open_date.to_string(),
            open_activity_id: Some(id.to_string()),
            original_quantity: original_qty.to_string(),
            remaining_quantity: remaining_qty.to_string(),
            cost_per_unit: cost_per_unit.to_string(),
            total_cost_basis: (orig * cpu).to_string(),
            fee_allocated: "0".to_string(),
            disposal_method: DisposalMethod::Fifo,
            is_closed: remaining_qty == "0",
            close_date: None,
            close_activity_id: None,
            is_wash_sale: false,
            holding_period: None,
            created_at: "2024-01-01T00:00:00.000Z".to_string(),
            updated_at: "2024-01-01T00:00:00.000Z".to_string(),
        }
    }

    fn make_activity(
        id: &str,
        account_id: &str,
        asset_id: &str,
        activity_type: &str,
        date: &str,
        quantity: Decimal,
    ) -> Activity {
        use crate::activities::ActivityStatus;
        Activity {
            id: id.to_string(),
            account_id: account_id.to_string(),
            asset_id: Some(asset_id.to_string()),
            activity_type: activity_type.to_string(),
            activity_type_override: None,
            source_type: None,
            subtype: None,
            status: ActivityStatus::Posted,
            activity_date: NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .unwrap()
                .and_hms_opt(0, 0, 0)
                .unwrap()
                .and_utc(),
            settlement_date: None,
            quantity: Some(quantity),
            unit_price: Some(dec!(100)),
            amount: None,
            fee: Some(Decimal::ZERO),
            currency: "USD".to_string(),
            fx_rate: None,
            notes: None,
            metadata: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
            idempotency_key: None,
            import_run_id: None,
            is_user_modified: false,
            needs_review: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn replay_no_activities_returns_lots_with_original_qty() {
        // Buy 10 on Jan 1, current remaining is 6 (some sells happened).
        // Replay to Jan 15 with no activities → should get 10 (original).
        let lots = vec![make_lot_record(
            "buy1",
            "acc1",
            "AAPL",
            "2024-01-01",
            "10",
            "6",
            "150",
        )];
        let result = replay_lots_to_date(lots, &[], NaiveDate::from_ymd_opt(2024, 1, 15).unwrap());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].remaining_quantity, "10");
    }

    #[test]
    fn replay_partial_sell() {
        // Buy 10 on Jan 1, sell 4 on Feb 1. Query Jan 15 → 10, query Feb 15 → 6.
        let lots = vec![make_lot_record(
            "buy1",
            "acc1",
            "AAPL",
            "2024-01-01",
            "10",
            "6",
            "150",
        )];
        let activities = vec![make_activity(
            "sell1",
            "acc1",
            "AAPL",
            "SELL",
            "2024-02-01",
            dec!(4),
        )];

        // Before the sell
        let result = replay_lots_to_date(
            lots.clone(),
            &activities,
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].remaining_quantity, "10");

        // After the sell
        let result = replay_lots_to_date(
            lots,
            &activities,
            NaiveDate::from_ymd_opt(2024, 2, 15).unwrap(),
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].remaining_quantity, "6");
    }

    #[test]
    fn replay_full_sell_removes_lot() {
        // Buy 10, sell 10 → lot should not appear.
        let lots = vec![make_lot_record(
            "buy1",
            "acc1",
            "AAPL",
            "2024-01-01",
            "10",
            "0",
            "150",
        )];
        let activities = vec![make_activity(
            "sell1",
            "acc1",
            "AAPL",
            "SELL",
            "2024-02-01",
            dec!(10),
        )];

        let result = replay_lots_to_date(
            lots,
            &activities,
            NaiveDate::from_ymd_opt(2024, 3, 1).unwrap(),
        );
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn replay_fifo_order_across_lots() {
        // Two lots: buy 10 on Jan 1, buy 5 on Feb 1. Sell 12 on Mar 1.
        // Jan 15: 10 + 5 = 15. Feb 15: 10 + 5 = 15. Mar 15: FIFO removes 10 + 2 = 3 left.
        let lots = vec![
            make_lot_record("buy1", "acc1", "AAPL", "2024-01-01", "10", "0", "150"),
            make_lot_record("buy2", "acc1", "AAPL", "2024-02-01", "5", "3", "160"),
        ];
        let activities = vec![make_activity(
            "sell1",
            "acc1",
            "AAPL",
            "SELL",
            "2024-03-01",
            dec!(12),
        )];

        let result = replay_lots_to_date(
            lots,
            &activities,
            NaiveDate::from_ymd_opt(2024, 3, 15).unwrap(),
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "buy2");
        assert_eq!(result[0].remaining_quantity, "3");
    }

    #[test]
    fn replay_split_multiplies_quantities() {
        // Buy 10 on Jan 1, 4:1 split on Feb 1.
        // Jan 15: 10. Feb 15: 40.
        let lots = vec![make_lot_record(
            "buy1",
            "acc1",
            "AAPL",
            "2024-01-01",
            "10",
            "40",
            "150",
        )];
        let activities = vec![make_activity(
            "split1",
            "acc1",
            "AAPL",
            "SPLIT",
            "2024-02-01",
            dec!(4),
        )];

        // Before split
        let result = replay_lots_to_date(
            lots.clone(),
            &activities,
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].remaining_quantity, "10");

        // After split
        let result = replay_lots_to_date(
            lots,
            &activities,
            NaiveDate::from_ymd_opt(2024, 2, 15).unwrap(),
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].remaining_quantity, "40");
    }

    #[test]
    fn replay_split_then_sell() {
        // Buy 10 on Jan 1, 2:1 split on Feb 1, sell 5 on Mar 1.
        // Feb 15: 20. Mar 15: 15.
        let lots = vec![make_lot_record(
            "buy1",
            "acc1",
            "AAPL",
            "2024-01-01",
            "10",
            "15",
            "150",
        )];
        let activities = vec![
            make_activity("split1", "acc1", "AAPL", "SPLIT", "2024-02-01", dec!(2)),
            make_activity("sell1", "acc1", "AAPL", "SELL", "2024-03-01", dec!(5)),
        ];

        let result = replay_lots_to_date(
            lots,
            &activities,
            NaiveDate::from_ymd_opt(2024, 3, 15).unwrap(),
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].remaining_quantity, "15");
    }

    #[test]
    fn replay_different_accounts_isolated() {
        // Same asset in two accounts. Sell in acc1 doesn't affect acc2.
        let lots = vec![
            make_lot_record("buy1", "acc1", "AAPL", "2024-01-01", "10", "5", "150"),
            make_lot_record("buy2", "acc2", "AAPL", "2024-01-01", "10", "10", "150"),
        ];
        let activities = vec![make_activity(
            "sell1",
            "acc1",
            "AAPL",
            "SELL",
            "2024-02-01",
            dec!(5),
        )];

        let result = replay_lots_to_date(
            lots,
            &activities,
            NaiveDate::from_ymd_opt(2024, 3, 1).unwrap(),
        );
        assert_eq!(result.len(), 2);
        let acc1_lot = result.iter().find(|l| l.account_id == "acc1").unwrap();
        let acc2_lot = result.iter().find(|l| l.account_id == "acc2").unwrap();
        assert_eq!(acc1_lot.remaining_quantity, "5");
        assert_eq!(acc2_lot.remaining_quantity, "10");
    }
}
