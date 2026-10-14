//! Running cash balance per activity: an account's cash in one currency after
//! each row, so its activity list reads like a statement.
//!
//! Books cash the way the portfolio engine does (`compile` + `project`):
//! posted rows only, in application order (timestamp, created_at, then id),
//! signed by the activity economics resolver, and a BUY or SELL carrying an
//! FX rate in a foreign currency booked in the account currency. Contract
//! multipliers are not read, so only cash and credit-card accounts show it.

use std::collections::HashMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{Activity, ACTIVITY_TYPE_BUY, ACTIVITY_TYPE_SELL};
use crate::accounts::{account_types, Account, TrackingMode};
use crate::portfolio::economic_events::ActivityEconomicsResolver;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCashBalance {
    /// The cash currency the row booked into.
    pub currency: String,
    /// The account's cash in that currency after the row.
    pub balance: Decimal,
}

/// Cash and credit-card accounts whose cash comes from their activities.
pub fn shows_running_cash_balance(account: &Account) -> bool {
    matches!(
        account.account_type.as_str(),
        account_types::CASH | account_types::CREDIT_CARD
    ) && account.tracking_mode != TrackingMode::Holdings
}

/// The balance after each of `account`'s posted activities, by activity id.
/// Rows that are not posted move no cash and get no balance.
pub fn running_cash_balances(
    account: &Account,
    activities: &[Activity],
) -> HashMap<String, ActivityCashBalance> {
    let is_credit_card = account.account_type == account_types::CREDIT_CARD;
    let mut ordered: Vec<&Activity> = activities
        .iter()
        .filter(|activity| activity.account_id == account.id && activity.is_posted())
        .collect();
    ordered.sort_by(|a, b| {
        a.activity_date
            .cmp(&b.activity_date)
            .then_with(|| a.created_at.cmp(&b.created_at))
            .then_with(|| a.id.cmp(&b.id))
    });

    let mut cash: HashMap<String, Decimal> = HashMap::new();
    let mut balances = HashMap::with_capacity(ordered.len());
    for activity in ordered {
        let (currency, amount) = booked_cash(account, activity, is_credit_card);
        let balance = cash.entry(currency.clone()).or_insert(Decimal::ZERO);
        *balance += amount;
        balances.insert(
            activity.id.clone(),
            ActivityCashBalance {
                currency,
                balance: *balance,
            },
        );
    }
    balances
}

/// The currency and signed amount the engine books for `activity`. A row the
/// engine books no cash for (a split, an adjustment, a missing amount) adds
/// zero to its currency.
fn booked_cash(account: &Account, activity: &Activity, is_credit_card: bool) -> (String, Decimal) {
    let amount =
        ActivityEconomicsResolver::resolve_compiled_cash(activity, Decimal::ONE, is_credit_card)
            .ok()
            .and_then(|resolved| resolved.signed_cash_effect)
            .unwrap_or(Decimal::ZERO);
    let account_currency = account.currency.trim();
    let currency = match activity.currency.trim() {
        "" => account_currency,
        currency => currency,
    };
    let is_trade = matches!(
        activity.effective_type(),
        ACTIVITY_TYPE_BUY | ACTIVITY_TYPE_SELL
    );
    match activity.fx_rate.filter(|rate| *rate > Decimal::ZERO) {
        Some(rate) if is_trade && currency != account_currency => (
            account_currency.to_string(),
            amount.checked_mul(rate).unwrap_or(Decimal::ZERO),
        ),
        _ => (currency.to_string(), amount),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use chrono::{DateTime, NaiveDate, Utc};
    use rust_decimal_macros::dec;
    use wealthfolio_portfolio_engine::model::{
        AccountId, Currency, Policy, RawAccount, RawAsset, RawFacts,
    };
    use wealthfolio_portfolio_engine::Engine;

    use super::*;
    use crate::activities::{
        ActivityStatus, ACTIVITY_TYPE_DEPOSIT, ACTIVITY_TYPE_FEE, ACTIVITY_TYPE_INTEREST,
        ACTIVITY_TYPE_SPLIT, ACTIVITY_TYPE_TRANSFER_IN, ACTIVITY_TYPE_TRANSFER_OUT,
        ACTIVITY_TYPE_WITHDRAWAL,
    };
    use crate::portfolio::coordinator::raw_activity;

    fn at(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value)
            .expect("test timestamp")
            .with_timezone(&Utc)
    }

    fn account(account_type: &str, currency: &str) -> Account {
        Account {
            id: "account".to_string(),
            name: "Account".to_string(),
            account_type: account_type.to_string(),
            currency: currency.to_string(),
            is_active: true,
            tracking_mode: TrackingMode::Transactions,
            ..Account::default()
        }
    }

    fn activity(id: &str, activity_type: &str, date: &str, amount: Decimal) -> Activity {
        Activity {
            id: id.to_string(),
            account_id: "account".to_string(),
            asset_id: None,
            activity_type: activity_type.to_string(),
            activity_type_override: None,
            source_type: None,
            subtype: None,
            status: ActivityStatus::Posted,
            activity_date: at(date),
            settlement_date: None,
            quantity: None,
            unit_price: None,
            amount: Some(amount),
            fee: None,
            tax: None,
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
            created_at: at("2026-04-01T00:00:00Z"),
            updated_at: at("2026-04-01T00:00:00Z"),
        }
    }

    fn balance(currency: &str, balance: Decimal) -> ActivityCashBalance {
        ActivityCashBalance {
            currency: currency.to_string(),
            balance,
        }
    }

    /// The engine's cash for `account` after folding `activities`.
    fn engine_cash(
        account: &Account,
        assets: Vec<RawAsset>,
        activities: &[Activity],
    ) -> BTreeMap<String, Decimal> {
        let raw = RawFacts {
            policy: Policy::new(
                Currency::parse(&account.currency).expect("account currency"),
                chrono_tz::UTC,
                NaiveDate::from_ymd_opt(2026, 4, 30).expect("as-of date"),
            ),
            accounts: vec![RawAccount {
                id: account.id.clone(),
                currency: account.currency.clone(),
                account_type: account.account_type.clone(),
                tracking_mode: "TRANSACTIONS".to_string(),
                is_archived: false,
                cost_basis_method: None,
            }],
            assets,
            activities: activities.iter().map(raw_activity).collect(),
            quotes: Vec::new(),
            fx_rates: Vec::new(),
            observed_snapshots: Vec::new(),
        };
        let bundle = Engine::new(raw)
            .expect("engine")
            .project()
            .expect("projection");
        bundle.final_state.accounts[&AccountId::new(account.id.clone())]
            .cash
            .iter()
            .filter(|(_, amount)| !amount.is_zero())
            .map(|(currency, amount)| (currency.to_string(), *amount))
            .collect()
    }

    /// Each currency's last running balance: what the account holds at the end.
    fn closing_cash(
        balances: &HashMap<String, ActivityCashBalance>,
        activities: &[Activity],
    ) -> BTreeMap<String, Decimal> {
        let mut ordered: Vec<&Activity> = activities
            .iter()
            .filter(|activity| balances.contains_key(&activity.id))
            .collect();
        ordered.sort_by(|a, b| {
            a.activity_date
                .cmp(&b.activity_date)
                .then_with(|| a.created_at.cmp(&b.created_at))
                .then_with(|| a.id.cmp(&b.id))
        });
        let mut closing = BTreeMap::new();
        for activity in ordered {
            let row = &balances[&activity.id];
            closing.insert(row.currency.clone(), row.balance);
        }
        closing.retain(|_, amount: &mut Decimal| !amount.is_zero());
        closing
    }

    #[test]
    fn shows_only_for_cash_and_credit_card_accounts_tracking_transactions() {
        assert!(shows_running_cash_balance(&account(
            account_types::CASH,
            "USD"
        )));
        assert!(shows_running_cash_balance(&account(
            account_types::CREDIT_CARD,
            "USD"
        )));
        assert!(!shows_running_cash_balance(&account(
            account_types::SECURITIES,
            "USD"
        )));

        let mut holdings = account(account_types::CASH, "USD");
        holdings.tracking_mode = TrackingMode::Holdings;
        assert!(!shows_running_cash_balance(&holdings));
    }

    #[test]
    fn same_instant_rows_apply_by_created_at_then_id() {
        let account = account(account_types::CASH, "USD");
        let mut opening = activity(
            "a",
            ACTIVITY_TYPE_DEPOSIT,
            "2026-04-02T00:00:00Z",
            dec!(100),
        );
        opening.created_at = at("2026-04-01T00:00:01Z");
        // Same instant and created_at: the id breaks the tie, so "b" first.
        let mut rent = activity(
            "c",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-02T00:00:00Z",
            dec!(30),
        );
        rent.created_at = at("2026-04-01T00:00:02Z");
        let mut coffee = activity(
            "b",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-02T00:00:00Z",
            dec!(5),
        );
        coffee.created_at = at("2026-04-01T00:00:02Z");
        // Inserted first but dated later: date order wins over created_at.
        let mut salary = activity("d", ACTIVITY_TYPE_DEPOSIT, "2026-04-03T09:00:00Z", dec!(50));
        salary.created_at = at("2026-04-01T00:00:00Z");

        let balances = running_cash_balances(&account, &[salary, rent, coffee, opening]);

        assert_eq!(balances["a"], balance("USD", dec!(100)));
        assert_eq!(balances["b"], balance("USD", dec!(95)));
        assert_eq!(balances["c"], balance("USD", dec!(65)));
        assert_eq!(balances["d"], balance("USD", dec!(115)));
    }

    #[test]
    fn rows_that_are_not_posted_get_no_balance_and_move_nothing() {
        let account = account(account_types::CASH, "USD");
        let deposit = activity(
            "deposit",
            ACTIVITY_TYPE_DEPOSIT,
            "2026-04-02T00:00:00Z",
            dec!(100),
        );
        let mut pending = activity(
            "pending",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-03T00:00:00Z",
            dec!(40),
        );
        pending.status = ActivityStatus::Pending;
        let mut draft = activity(
            "draft",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-03T00:00:00Z",
            dec!(7),
        );
        draft.status = ActivityStatus::Draft;
        let fee = activity("fee", ACTIVITY_TYPE_FEE, "2026-04-04T00:00:00Z", dec!(2));

        let balances = running_cash_balances(&account, &[deposit, pending, draft, fee]);

        assert!(!balances.contains_key("pending"));
        assert!(!balances.contains_key("draft"));
        assert_eq!(balances["fee"], balance("USD", dec!(98)));
    }

    #[test]
    fn credit_card_interest_is_a_charge_and_a_payment_pays_it_down() {
        let account = account(account_types::CREDIT_CARD, "USD");
        let charge = activity(
            "charge",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-02T00:00:00Z",
            dec!(120),
        );
        let interest = activity(
            "interest",
            ACTIVITY_TYPE_INTEREST,
            "2026-04-03T00:00:00Z",
            dec!(3),
        );
        let payment = activity(
            "payment",
            ACTIVITY_TYPE_TRANSFER_IN,
            "2026-04-04T00:00:00Z",
            dec!(100),
        );

        let balances = running_cash_balances(&account, &[charge, interest, payment]);

        assert_eq!(balances["charge"], balance("USD", dec!(-120)));
        assert_eq!(balances["interest"], balance("USD", dec!(-123)));
        assert_eq!(balances["payment"], balance("USD", dec!(-23)));
    }

    #[test]
    fn a_foreign_charge_keeps_its_own_currency_balance() {
        let account = account(account_types::CREDIT_CARD, "CAD");
        let mut home = activity(
            "home",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-02T00:00:00Z",
            dec!(40),
        );
        home.currency = "CAD".to_string();
        let abroad = activity(
            "abroad",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-03T00:00:00Z",
            dec!(9.59),
        );

        let balances = running_cash_balances(&account, &[home, abroad]);

        assert_eq!(balances["home"], balance("CAD", dec!(-40)));
        assert_eq!(balances["abroad"], balance("USD", dec!(-9.59)));
    }

    #[test]
    fn other_accounts_rows_are_ignored() {
        let account = account(account_types::CASH, "USD");
        let own = activity(
            "own",
            ACTIVITY_TYPE_DEPOSIT,
            "2026-04-02T00:00:00Z",
            dec!(10),
        );
        let mut other = activity(
            "other",
            ACTIVITY_TYPE_DEPOSIT,
            "2026-04-01T00:00:00Z",
            dec!(99),
        );
        other.account_id = "someone-else".to_string();

        let balances = running_cash_balances(&account, &[own, other]);

        assert_eq!(balances.len(), 1);
        assert_eq!(balances["own"], balance("USD", dec!(10)));
    }

    #[test]
    fn closing_balances_match_the_engine_for_a_cash_account() {
        let account = account(account_types::CASH, "USD");
        let deposit = activity(
            "deposit",
            ACTIVITY_TYPE_DEPOSIT,
            "2026-04-02T00:00:00Z",
            dec!(1000),
        );
        let withdrawal = activity(
            "withdrawal",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-02T00:00:00Z",
            dec!(250.75),
        );
        let fee = activity("fee", ACTIVITY_TYPE_FEE, "2026-04-03T00:00:00Z", dec!(4.5));
        let interest = activity(
            "interest",
            ACTIVITY_TYPE_INTEREST,
            "2026-04-04T00:00:00Z",
            dec!(1.23),
        );
        let transfer_out = activity(
            "transfer-out",
            ACTIVITY_TYPE_TRANSFER_OUT,
            "2026-04-05T00:00:00Z",
            dec!(100),
        );
        let mut euros = activity(
            "euros",
            ACTIVITY_TYPE_DEPOSIT,
            "2026-04-06T00:00:00Z",
            dec!(80),
        );
        euros.currency = "EUR".to_string();
        let mut split = activity(
            "split",
            ACTIVITY_TYPE_SPLIT,
            "2026-04-07T00:00:00Z",
            dec!(0),
        );
        split.amount = None;
        let mut draft = activity(
            "draft",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-08T00:00:00Z",
            dec!(60),
        );
        draft.status = ActivityStatus::Draft;
        // A foreign-currency buy with a broker rate settles in USD at 1.1.
        let mut buy = activity("buy", ACTIVITY_TYPE_BUY, "2026-04-09T00:00:00Z", dec!(50));
        buy.asset_id = Some("SAP.DE".to_string());
        buy.quantity = Some(dec!(1));
        buy.unit_price = Some(dec!(50));
        buy.currency = "EUR".to_string();
        buy.fx_rate = Some(dec!(1.1));
        let activities = vec![
            deposit,
            withdrawal,
            fee,
            interest,
            transfer_out,
            euros,
            split,
            draft,
            buy,
        ];
        let assets = vec![RawAsset {
            id: "SAP.DE".to_string(),
            quote_currency: "EUR".to_string(),
            kind: "INVESTMENT".to_string(),
            instrument_type: Some("EQUITY".to_string()),
            contract_multiplier: None,
        }];

        let balances = running_cash_balances(&account, &activities);

        assert_eq!(balances["buy"], balance("USD", dec!(590.98)));
        assert_eq!(
            closing_cash(&balances, &activities),
            engine_cash(&account, assets, &activities)
        );
    }

    #[test]
    fn closing_balances_match_the_engine_for_a_credit_card() {
        let account = account(account_types::CREDIT_CARD, "CAD");
        let mut groceries = activity(
            "groceries",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-02T00:00:00Z",
            dec!(84.12),
        );
        groceries.currency = "CAD".to_string();
        let mut refund = activity(
            "refund",
            ACTIVITY_TYPE_DEPOSIT,
            "2026-04-03T00:00:00Z",
            dec!(20),
        );
        refund.currency = "CAD".to_string();
        refund.subtype = Some("REFUND".to_string());
        let mut interest = activity(
            "interest",
            ACTIVITY_TYPE_INTEREST,
            "2026-04-04T00:00:00Z",
            dec!(2.4),
        );
        interest.currency = "CAD".to_string();
        let abroad = activity(
            "abroad",
            ACTIVITY_TYPE_WITHDRAWAL,
            "2026-04-05T00:00:00Z",
            dec!(9.59),
        );
        let mut payment = activity(
            "payment",
            ACTIVITY_TYPE_TRANSFER_IN,
            "2026-04-06T00:00:00Z",
            dec!(50),
        );
        payment.currency = "CAD".to_string();
        let activities = vec![groceries, refund, interest, abroad, payment];

        let balances = running_cash_balances(&account, &activities);

        assert_eq!(
            closing_cash(&balances, &activities),
            engine_cash(&account, Vec::new(), &activities)
        );
    }
}
