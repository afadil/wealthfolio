//! An alternative asset (the host's fact: property, vehicles, liabilities,
//! "other" assets) held in an account stays out of the account's value, for
//! net worth to value on its own.
#![allow(clippy::unwrap_used, clippy::panic, reason = "test code")]

mod support;

use rust_decimal::Decimal;
use support::*;
use wealthfolio_portfolio_engine::model::*;

fn investment_value(alternative: bool) -> Decimal {
    let scenario: Scenario = serde_yaml::from_str(&format!(
        r#"
id: ALT-{alternative}
policy: {{ base_currency: USD, timezone: UTC, as_of: 2025-01-04 }}
accounts:
  - {{ id: acc-1, currency: USD }}
assets:
  - {{ id: thing, quote_ccy: USD, kind: OTHER, instrument_type: NONE, alternative: {alternative} }}
activities:
  - {{ id: dep, account: acc-1, type: DEPOSIT, date: 2025-01-02T10:00:00Z, amount: 1000 }}
  - {{ id: buy, account: acc-1, type: BUY, asset: thing, date: 2025-01-03T10:00:00Z, quantity: 2, unit_price: 100, amount: 200 }}
quotes:
  - {{ asset: thing, day: 2025-01-03, close: 100, currency: USD, source: MANUAL }}
"#
    ))
    .unwrap();
    let pipeline = Pipeline::from_scenario(&scenario);
    let days = &pipeline.series[&AccountId::new("acc-1")].days;
    days.last().unwrap().investment_market_value
}

#[test]
fn an_alternative_asset_held_in_an_account_stays_out_of_its_value() {
    assert_eq!(investment_value(true), Decimal::ZERO);
    assert_eq!(investment_value(false), Decimal::from(200));
}
