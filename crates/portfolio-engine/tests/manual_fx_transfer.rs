//! Same-account FX pairs entered by hand reuse the imported pair's accounting.
#![allow(clippy::unwrap_used, clippy::panic, reason = "test code")]

mod support;

use rust_decimal_macros::dec;
use support::*;
use wealthfolio_portfolio_engine::model::*;

/// EDGE-TXF-05's linked pair with only the internal-flow mark the pair form,
/// the transfer link and the import linker share: no import FX record.
fn internal_fx_scenario(source_system: Option<&str>) -> Scenario {
    let mut scenario = load_all_scenarios()
        .into_iter()
        .find(|s| s.id == "EDGE-TXF-05")
        .unwrap();
    for activity in scenario
        .activities
        .iter_mut()
        .filter(|a| a.id.ends_with("-linked") && a.id.starts_with("fx-"))
    {
        activity.source_system = source_system.map(str::to_string);
        activity.metadata = Some(serde_json::json!({ "flow": { "is_external": false } }));
    }
    scenario
}

fn linked_net_contribution(scenario: &Scenario) -> rust_decimal::Decimal {
    let pipeline = Pipeline::from_scenario(scenario);
    pipeline.series[&AccountId::new("acc-linked")]
        .days
        .last()
        .unwrap()
        .net_contribution_base
}

#[test]
fn internal_fx_transfer_matches_imported_balances_contributions_flows_and_returns() {
    let imported = load_all_scenarios()
        .into_iter()
        .find(|s| s.id == "EDGE-TXF-05")
        .unwrap();
    for source_system in [Some("MANUAL"), Some("CSV"), Some("SNAPTRADE"), None] {
        let internal = internal_fx_scenario(source_system);
        let pipeline = Pipeline::from_scenario(&internal);
        let last = pipeline.series[&AccountId::new("acc-linked")]
            .days
            .last()
            .unwrap();
        assert_eq!(last.total_value_base, dec!(1001.2), "{source_system:?}");
        assert_eq!(last.net_contribution_base, dec!(1000), "{source_system:?}");
        assert_eq!(
            capture_body(&pipeline, &all_windows(&internal)),
            capture_body(&Pipeline::from_scenario(&imported), &all_windows(&imported)),
            "{source_system:?}"
        );
    }
}

#[test]
fn fx_transfer_without_two_explicitly_internal_legs_keeps_legacy_contributions() {
    for patch in 0..2 {
        let mut scenario = internal_fx_scenario(Some("MANUAL"));
        let incoming = scenario
            .activities
            .iter_mut()
            .find(|a| a.id == "fx-in-linked")
            .unwrap();
        match patch {
            0 => incoming.metadata = None,
            _ => incoming.metadata = Some(serde_json::json!({ "flow": { "is_external": true } })),
        }
        assert_eq!(linked_net_contribution(&scenario), dec!(1001.2));
    }
}
