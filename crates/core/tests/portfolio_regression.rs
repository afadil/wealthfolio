//! Portfolio snapshot regression tests.
//!
//! Uses `insta` — the Rust snapshot library used by cargo-semver-checks,
//! axum, tracing, and others. Pattern: pin serialised output of critical
//! financial data. Any change surfaces as a reviewable diff.
//!
//! # Updating snapshots
//! ```sh
//! cargo insta test --workspace --review
//! ```

use insta::{assert_json_snapshot, assert_snapshot};
use rust_decimal_macros::dec;
use wealthfolio_core::activities::activities_model::{Activity, ActivityStatus, ActivityType};
use wealthfolio_core::portfolio::snapshot::snapshot_model::AccountStateSnapshot;

fn make_activity(activity_type: ActivityType, qty: &str, price: &str, fee: &str) -> Activity {
    Activity {
        id: "test-id".into(),
        account_id: "acc-001".into(),
        asset_id: Some("AAPL".into()),
        activity_type,
        activity_date: "2025-01-15".into(),
        quantity: Some(qty.into()),
        unit_price: Some(price.into()),
        fee: Some(fee.into()),
        amount: None,
        currency: "USD".into(),
        status: ActivityStatus::Posted,
        ..Default::default()
    }
}

// ─── Activity method regressions ────────────────────────────────────────────

/// qty() must parse and return the Decimal without rounding
#[test]
fn regression_activity_qty_parse() {
    let a = make_activity(ActivityType::Buy, "10.5", "150.25", "9.99");
    assert_snapshot!("activity_qty", format!("{}", a.qty()));
}

/// price() must parse correctly
#[test]
fn regression_activity_price_parse() {
    let a = make_activity(ActivityType::Buy, "10", "150.255", "0");
    assert_snapshot!("activity_price", format!("{}", a.price()));
}

/// fee_amt() must parse the fee field
#[test]
fn regression_activity_fee_parse() {
    let a = make_activity(ActivityType::Buy, "10", "150.00", "9.99");
    assert_snapshot!("activity_fee", format!("{}", a.fee_amt()));
}

/// BUY net cost = qty * price + fee — serialised JSON regression
#[test]
fn regression_buy_serialised() {
    let a = make_activity(ActivityType::Buy, "10", "150.25", "9.99");
    let net_cost = a.qty() * a.price() + a.fee_amt();
    assert_snapshot!("buy_net_cost_usd", format!("{:.4}", net_cost));
}

/// SELL net proceeds = qty * price − fee
#[test]
fn regression_sell_serialised() {
    let a = make_activity(ActivityType::Sell, "5", "200.00", "4.95");
    let proceeds = a.qty() * a.price() - a.fee_amt();
    assert_snapshot!("sell_net_proceeds_usd", format!("{:.4}", proceeds));
}

/// Activity JSON serialisation must remain stable across refactors
#[test]
fn regression_activity_json_shape() {
    let a = Activity {
        id: "regression-001".into(),
        account_id: "acc-001".into(),
        asset_id: Some("MSFT".into()),
        activity_type: ActivityType::Dividend,
        activity_date: "2025-03-15".into(),
        quantity: None,
        unit_price: None,
        fee: Some("0".into()),
        amount: Some("42.50".into()),
        currency: "USD".into(),
        status: ActivityStatus::Posted,
        ..Default::default()
    };

    assert_json_snapshot!("dividend_activity_shape", a, {
        ".createdAt" => "[datetime]",
        ".updatedAt" => "[datetime]",
    });
}

// ─── Empty snapshot shape regression ────────────────────────────────────────

/// The shape of AccountStateSnapshot JSON must not change without review.
#[test]
fn regression_empty_snapshot_json_shape() {
    let snap = AccountStateSnapshot {
        id: "00000000-0000-0000-0000-000000000001".into(),
        account_id: "acc-001".into(),
        snapshot_date: "2025-01-01".parse().unwrap(),
        currency: "USD".into(),
        net_contribution: dec!(5000),
        cost_basis: dec!(4800),
        ..Default::default()
    };

    assert_json_snapshot!("empty_snapshot_shape", snap, {
        ".calculatedAt" => "[datetime]",
    });
}
