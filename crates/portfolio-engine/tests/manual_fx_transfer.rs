//! Manual same-account transfers reuse the imported FX pair's accounting.
#![allow(clippy::unwrap_used, clippy::panic, reason = "test code")]

mod support;

use rust_decimal_macros::dec;
use support::*;
use wealthfolio_portfolio_engine::model::*;

fn manual_fx_scenario() -> Scenario {
    let mut scenario = load_all_scenarios()
        .into_iter()
        .find(|s| s.id == "EDGE-TXF-05")
        .unwrap();
    for activity in scenario
        .activities
        .iter_mut()
        .filter(|a| a.id.ends_with("-linked") && a.id.starts_with("fx-"))
    {
        activity.source_system = Some(ACTIVITY_SOURCE_MANUAL.into());
        activity.metadata = Some(serde_json::json!({ "flow": { "is_external": false } }));
    }
    scenario
}

#[test]
fn manual_fx_transfer_matches_imported_balances_contributions_flows_and_returns() {
    let imported = load_all_scenarios()
        .into_iter()
        .find(|s| s.id == "EDGE-TXF-05")
        .unwrap();
    let manual = manual_fx_scenario();
    let pipeline = Pipeline::from_scenario(&manual);
    let last = pipeline.series[&AccountId::new("acc-linked")]
        .days
        .last()
        .unwrap();
    assert_eq!(last.total_value_base, dec!(1001.2));
    assert_eq!(last.net_contribution_base, dec!(1000));
    assert_eq!(
        capture_body(&pipeline, &all_windows(&manual)),
        capture_body(&Pipeline::from_scenario(&imported), &all_windows(&imported)),
    );
}

#[test]
fn manual_fx_transfer_requires_both_legs_to_be_explicitly_internal_and_manual() {
    for patch in 0..3 {
        let mut scenario = manual_fx_scenario();
        let incoming = scenario
            .activities
            .iter_mut()
            .find(|a| a.id == "fx-in-linked")
            .unwrap();
        match patch {
            0 => incoming.metadata = None,
            1 => incoming.metadata = Some(serde_json::json!({ "flow": { "is_external": true } })),
            _ => incoming.source_system = Some("CSV".into()),
        }
        let pipeline = Pipeline::from_scenario(&scenario);
        let last = pipeline.series[&AccountId::new("acc-linked")]
            .days
            .last()
            .unwrap();
        assert_eq!(last.net_contribution_base, dec!(1001.2));
    }
}
