//! The shared accounting contract (`tests/fixtures/accounting`) through the
//! kernel: each case's cash, net contribution, gain and external flow, and
//! each ledger scenario's ending balances. The spending classifier reads the
//! same cases for its side of the contract.
#![allow(clippy::unwrap_used, clippy::panic, reason = "test code")]

mod support;

use rust_decimal::Decimal;
use serde::Deserialize;
use support::*;
use wealthfolio_portfolio_engine::model::*;

const CONTRACT_DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../tests/fixtures/accounting"
);

#[derive(Deserialize)]
struct ActivitySemantics {
    cases: Vec<ActivityCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivityCase {
    name: String,
    account_type: String,
    activity_type: String,
    subtype: Option<String>,
    is_external: Option<bool>,
    amount: String,
    expected: ActivityExpected,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivityExpected {
    cash_delta: String,
    net_contribution_delta: String,
    gain_delta: String,
    external_flow: bool,
}

#[derive(Deserialize)]
struct LedgerScenarios {
    scenarios: Vec<LedgerScenario>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LedgerScenario {
    name: String,
    account_type: String,
    activities: Vec<LedgerActivity>,
    expected: LedgerExpected,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LedgerActivity {
    day: u32,
    activity_type: String,
    subtype: Option<String>,
    is_external: Option<bool>,
    amount: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LedgerExpected {
    ending_cash: String,
    net_contribution: String,
    gain: String,
}

fn read<T: serde::de::DeserializeOwned>(file: &str) -> T {
    let path = format!("{CONTRACT_DIR}/{file}");
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path}: {e}"))
}

fn dec(raw: &str) -> Decimal {
    raw.parse().unwrap_or_else(|e| panic!("{raw}: {e}"))
}

fn activity_yaml(
    id: &str,
    activity_type: &str,
    subtype: Option<&str>,
    is_external: Option<bool>,
    amount: &str,
    date: &str,
) -> String {
    let mut yaml = format!(
        "  - {{ id: {id}, account: acc-1, type: {activity_type}, date: {date}T10:00:00Z, amount: {amount}"
    );
    if let Some(subtype) = subtype {
        yaml.push_str(&format!(", subtype: {subtype}"));
    }
    if let Some(is_external) = is_external {
        yaml.push_str(&format!(
            ", metadata: {{ flow: {{ is_external: {is_external} }} }}"
        ));
    }
    yaml.push_str(" }\n");
    yaml
}

fn run(id: &str, account_type: &str, as_of: &str, activities: &str) -> Vec<DailyValuation> {
    let scenario: Scenario = serde_yaml::from_str(&format!(
        "id: {id}\n\
         policy: {{ base_currency: USD, timezone: UTC, as_of: {as_of} }}\n\
         accounts:\n  - {{ id: acc-1, currency: USD, account_type: {account_type} }}\n\
         activities:\n{activities}"
    ))
    .unwrap_or_else(|e| panic!("{id}: {e}"));
    let mut series = Pipeline::from_scenario(&scenario).series;
    series
        .remove(&AccountId::new("acc-1"))
        .unwrap_or_else(|| panic!("{id}: no valuation series"))
        .days
}

fn on(days: &[DailyValuation], date: &str) -> DailyValuation {
    days.iter()
        .find(|d| d.date.to_string() == date)
        .cloned()
        .unwrap_or_else(|| panic!("no valuation on {date}"))
}

/// One activity after a 1000 deposit: the day's change in cash and net
/// contribution, the gain (value change not explained by contributions) and
/// whether the day carries an external flow.
#[test]
fn each_activity_case_moves_cash_contribution_and_gain_as_the_contract_says() {
    let contract: ActivitySemantics = read("activity_semantics.json");
    let mut failures = Vec::new();
    for (index, case) in contract.cases.iter().enumerate() {
        let activities = activity_yaml("seed", "DEPOSIT", None, None, "1000", "2025-01-02")
            + &activity_yaml(
                "case",
                &case.activity_type,
                case.subtype.as_deref(),
                case.is_external,
                &case.amount,
                "2025-01-03",
            );
        let days = run(
            &format!("ACC-{index:02}"),
            &case.account_type,
            "2025-01-04",
            &activities,
        );
        let (before, after) = (on(&days, "2025-01-02"), on(&days, "2025-01-03"));
        let contribution = after.net_contribution - before.net_contribution;
        let actual = (
            after.cash_balance - before.cash_balance,
            contribution,
            after.total_value - before.total_value - contribution,
            !(after.flow.inflow_base.is_zero() && after.flow.outflow_base.is_zero()),
        );
        let expected = (
            dec(&case.expected.cash_delta),
            dec(&case.expected.net_contribution_delta),
            dec(&case.expected.gain_delta),
            case.expected.external_flow,
        );
        if actual != expected {
            failures.push(format!(
                "{}: (cash, contribution, gain, external) expected {expected:?}, got {actual:?}",
                case.name
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// A whole ledger: its ending cash, net contribution and gain.
#[test]
fn each_ledger_scenario_reconciles_as_the_contract_says() {
    let contract: LedgerScenarios = read("ledger_scenarios.json");
    let mut failures = Vec::new();
    for (index, scenario) in contract.scenarios.iter().enumerate() {
        let activities: String = scenario
            .activities
            .iter()
            .enumerate()
            .map(|(row, activity)| {
                activity_yaml(
                    &format!("a{row}"),
                    &activity.activity_type,
                    activity.subtype.as_deref(),
                    activity.is_external,
                    &activity.amount,
                    &format!("2025-01-{:02}", 1 + activity.day),
                )
            })
            .collect();
        let days = run(
            &format!("LEDGER-{index:02}"),
            &scenario.account_type,
            "2025-01-08",
            &activities,
        );
        let last = days.last().unwrap();
        let actual = (
            last.cash_balance,
            last.net_contribution,
            last.total_value - last.net_contribution,
        );
        let expected = (
            dec(&scenario.expected.ending_cash),
            dec(&scenario.expected.net_contribution),
            dec(&scenario.expected.gain),
        );
        if actual != expected {
            failures.push(format!(
                "{}: (cash, contribution, gain) expected {expected:?}, got {actual:?}",
                scenario.name
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
