//! Trade-economics, position-intent, and asset-fact cache helpers
//! shared across the holdings-calculator handlers.
use crate::activities::{
    Activity, NewActivity, ACTIVITY_SUBTYPE_POSITION_CLOSE, ACTIVITY_SUBTYPE_POSITION_OPEN,
};
use crate::constants::DECIMAL_PRECISION;
use crate::portfolio::economic_events::ActivityEconomicsResolver;
use crate::portfolio::snapshot::{AccountStateSnapshot, Position};
use rust_decimal::Decimal;
use std::collections::HashMap;

/// Helper function for cash mutations.
/// Books cash in the specified currency (should be activity.currency per design spec).
#[inline]
pub(crate) fn add_cash(state: &mut AccountStateSnapshot, currency: &str, delta: Decimal) {
    *state
        .cash_balances
        .entry(currency.to_string())
        .or_insert(Decimal::ZERO) += delta;
}

#[derive(Clone)]
pub(crate) struct AssetPositionInfo {
    pub(crate) currency: String,
    pub(crate) is_alternative: bool,
    pub(crate) contract_multiplier: Decimal,
    pub(crate) allows_negative_lots: bool,
    pub(crate) requires_explicit_short_intent: bool,
}

pub(crate) type AssetCache = HashMap<String, AssetPositionInfo>;

impl AssetPositionInfo {
    pub(crate) fn fallback(activity_currency: &str) -> Self {
        Self {
            currency: activity_currency.to_string(),
            is_alternative: false,
            contract_multiplier: Decimal::ONE,
            allows_negative_lots: false,
            requires_explicit_short_intent: false,
        }
    }
}

/// Gross trade value (pre-charge) reverse-derived from authoritative final cash.
/// Security transfers remain lot-only and therefore use quantity * unit price.
#[inline]
pub(crate) fn gross_trade_amount(activity: &Activity, asset_info: &AssetPositionInfo) -> Decimal {
    if ActivityEconomicsResolver::is_security_transfer(activity) {
        return activity
            .qty()
            .checked_mul(activity.price())
            .and_then(|value| value.checked_mul(asset_info.contract_multiplier))
            .unwrap_or(Decimal::ZERO);
    }

    ActivityEconomicsResolver::resolve_cash(activity, asset_info.contract_multiplier)
        .gross_amount
        .unwrap_or(Decimal::ZERO)
}

/// Canonical position intent for an activity, resolved through the single
/// shared subtype vocabulary (`NewActivity::canonicalize_subtype_for_activity`)
/// rather than a calculator-local alias list. Returns the canonical subtype
/// (e.g. `POSITION_OPEN` / `POSITION_CLOSE`) or `None`.
fn canonical_position_intent(activity: &Activity) -> Option<String> {
    NewActivity::canonicalize_subtype_for_activity(
        activity.effective_type(),
        activity.subtype.as_deref(),
    )
}

pub(crate) fn has_position_close_intent(activity: &Activity) -> bool {
    canonical_position_intent(activity).as_deref() == Some(ACTIVITY_SUBTYPE_POSITION_CLOSE)
}

pub(crate) fn has_sell_short_open_intent(activity: &Activity) -> bool {
    canonical_position_intent(activity).as_deref() == Some(ACTIVITY_SUBTYPE_POSITION_OPEN)
}

pub(crate) fn parse_decimal_lossy(value: &str) -> Decimal {
    value.parse::<Decimal>().unwrap_or(Decimal::ZERO)
}

pub(crate) fn storage_money(value: Decimal) -> Decimal {
    value.round_dp(DECIMAL_PRECISION)
}

/// Per-share/per-contract acquisition price for a lot (multiplier-inclusive).
///
/// Derives book price from authoritative gross economics while retaining the
/// reported unit price as an independent input/diagnostic.
#[inline]
pub(crate) fn effective_unit_price(activity: &Activity, asset_info: &AssetPositionInfo) -> Decimal {
    let qty = activity.qty();
    let gross = gross_trade_amount(activity, asset_info);
    // Keep a representable reported price as the fallback when gross cannot
    // be divided into a per-unit value; otherwise leave the lot basis unknown.
    let reported_price = activity
        .price()
        .checked_mul(asset_info.contract_multiplier)
        .unwrap_or(Decimal::ZERO);
    if !qty.is_zero() && !gross.is_zero() {
        gross.checked_div(qty).unwrap_or(reported_price)
    } else {
        reported_price
    }
}

#[inline]
pub(crate) fn signed_cash_effect(activity: &Activity, asset_info: &AssetPositionInfo) -> Decimal {
    ActivityEconomicsResolver::resolve_cash(activity, asset_info.contract_multiplier)
        .signed_cash_effect
        .unwrap_or(Decimal::ZERO)
}

/// Non-trade cash always settles in the activity's declared cash currency.
pub(crate) fn cash_booking(activity: &Activity, signed_effect: Decimal) -> (String, Decimal) {
    (activity.currency.clone(), signed_effect)
}

/// A trade carrying a broker FX rate settles in account currency; otherwise it
/// settles in the activity currency.
pub(crate) fn trade_cash_booking(
    activity: &Activity,
    account_currency: &str,
    signed_effect: Decimal,
) -> (String, Decimal) {
    if activity.currency != account_currency {
        if let Some(fx_rate) = activity.fx_rate.filter(|rate| *rate > Decimal::ZERO) {
            return (account_currency.to_string(), signed_effect * fx_rate);
        }
    }

    cash_booking(activity, signed_effect)
}

pub(crate) fn proportional_amount(
    amount: Decimal,
    part_quantity: Decimal,
    total_quantity: Decimal,
) -> Decimal {
    if amount.is_zero() || part_quantity.is_zero() || total_quantity.is_zero() {
        Decimal::ZERO
    } else if part_quantity == total_quantity {
        amount
    } else {
        amount
            .checked_mul(part_quantity)
            .and_then(|value| value.checked_div(total_quantity))
            .or_else(|| {
                amount
                    .checked_div(total_quantity)
                    .and_then(|value| value.checked_mul(part_quantity))
            })
            .unwrap_or(Decimal::ZERO)
    }
}

pub(crate) fn positive_lot_effective_quantity(position: &Position) -> Decimal {
    position
        .lots
        .iter()
        .filter(|lot| lot.quantity > Decimal::ZERO)
        .map(|lot| lot.quantity * lot.effective_split_ratio())
        .sum()
}

pub(crate) fn negative_lot_effective_quantity_abs(position: &Position) -> Decimal {
    position
        .lots
        .iter()
        .filter(|lot| lot.quantity < Decimal::ZERO)
        .map(|lot| (lot.quantity * lot.effective_split_ratio()).abs())
        .sum()
}
