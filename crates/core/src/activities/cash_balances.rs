//! Running cash balance per activity: an account's cash in one currency after
//! each row, so its activity list reads like a statement.
//!
//! Books cash the way the portfolio engine does (`compile` + `project`):
//! posted rows only, in application order (timestamp, created_at, then id),
//! each signed by the activity economics resolver in its own currency. An
//! account whose history holds securities gets no balances: their cash turns
//! on what only the engine resolves (contract multipliers, composite rows
//! booked in two currencies), so this ledger would drift from it.

use std::cmp::Ordering;
use std::collections::HashMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{is_cash_symbol, Activity, ACTIVITY_TYPE_BUY, ACTIVITY_TYPE_SELL};
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

/// The order the engine applies an account's activities in: by timestamp,
/// then created_at (date-only imports share a timestamp), then id. A list
/// showing running balances must follow it, reversed for newest-first.
pub fn application_order(a: &Activity, b: &Activity) -> Ordering {
    a.activity_date
        .cmp(&b.activity_date)
        .then_with(|| a.created_at.cmp(&b.created_at))
        .then_with(|| a.id.cmp(&b.id))
}

/// Cash and credit-card accounts whose cash comes from their activities.
pub fn shows_running_cash_balance(account: &Account) -> bool {
    matches!(
        account.account_type.as_str(),
        account_types::CASH | account_types::CREDIT_CARD
    ) && account.tracking_mode != TrackingMode::Holdings
}

/// The balance after each of `account`'s posted activities, by activity id, or
/// none when its posted history holds securities. Rows that are not posted
/// move no cash and get no balance.
pub fn running_cash_balances(
    account: &Account,
    activities: &[Activity],
) -> Option<HashMap<String, ActivityCashBalance>> {
    let mut ordered: Vec<&Activity> = activities
        .iter()
        .filter(|activity| activity.account_id == account.id && activity.is_posted())
        .collect();
    if ordered.iter().any(|activity| holds_security(activity)) {
        return None;
    }
    ordered.sort_by(|a, b| application_order(a, b));

    let is_credit_card = account.account_type == account_types::CREDIT_CARD;
    let mut cash: HashMap<String, Decimal> = HashMap::new();
    let mut balances = HashMap::with_capacity(ordered.len());
    for activity in ordered {
        // A row the engine books no cash for (a split, an adjustment, a
        // missing amount) adds zero; a row with no currency books in the
        // account's, as the engine assumes.
        let amount = ActivityEconomicsResolver::resolve_cash_with_account_context(
            activity,
            Decimal::ONE,
            is_credit_card,
        )
        .signed_cash_effect
        .unwrap_or(Decimal::ZERO);
        let currency = match activity.currency.trim() {
            "" => account.currency.trim(),
            currency => currency,
        }
        .to_string();
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
    Some(balances)
}

/// A trade, or a row tied to an asset other than cash.
fn holds_security(activity: &Activity) -> bool {
    matches!(
        activity.effective_type(),
        ACTIVITY_TYPE_BUY | ACTIVITY_TYPE_SELL
    ) || activity
        .asset_id
        .as_deref()
        .map(str::trim)
        .is_some_and(|asset_id| !asset_id.is_empty() && !is_cash_symbol(asset_id))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use chrono::{DateTime, NaiveDate, Utc};
    use rust_decimal_macros::dec;
    use wealthfolio_portfolio_engine::model::{AccountId, Currency, Policy, RawAccount, RawFacts};
    use wealthfolio_portfolio_engine::Engine;

    use super::*;
    use crate::activities::{
        ActivityStatus, ACTIVITY_TYPE_DEPOSIT, ACTIVITY_TYPE_DIVIDEND, ACTIVITY_TYPE_FEE,
        ACTIVITY_TYPE_INTEREST, ACTIVITY_TYPE_SPLIT, ACTIVITY_TYPE_TRANSFER_IN,
        ACTIVITY_TYPE_TRANSFER_OUT, ACTIVITY_TYPE_WITHDRAWAL,
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
    fn engine_cash(account: &Account, activities: &[Activity]) -> BTreeMap<String, Decimal> {
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
            assets: Vec::new(),
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
        ordered.sort_by(|a, b| application_order(a, b));
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

        let balances = running_cash_balances(&account, &[salary, rent, coffee, opening])
            .expect("a cash-only history");

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

        let balances = running_cash_balances(&account, &[deposit, pending, draft, fee])
            .expect("a cash-only history");

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

        let balances = running_cash_balances(&account, &[charge, interest, payment])
            .expect("a cash-only history");

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

        let balances =
            running_cash_balances(&account, &[home, abroad]).expect("a cash-only history");

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

        let balances = running_cash_balances(&account, &[own, other]).expect("a cash-only history");

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
        let activities = vec![
            deposit,
            withdrawal,
            fee,
            interest,
            transfer_out,
            euros,
            split,
            draft,
        ];

        let balances = running_cash_balances(&account, &activities).expect("a cash-only history");

        assert_eq!(balances["transfer-out"], balance("USD", dec!(645.98)));
        assert_eq!(balances["euros"], balance("EUR", dec!(80)));
        assert_eq!(
            closing_cash(&balances, &activities),
            engine_cash(&account, &activities)
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

        let balances = running_cash_balances(&account, &activities).expect("a cash-only history");

        assert_eq!(
            closing_cash(&balances, &activities),
            engine_cash(&account, &activities)
        );
    }

    #[test]
    fn an_account_that_held_securities_gets_no_balances() {
        let account = account(account_types::CASH, "CAD");
        let mut deposit = activity(
            "deposit",
            ACTIVITY_TYPE_DEPOSIT,
            "2026-04-01T00:00:00Z",
            dec!(100),
        );
        deposit.currency = "CAD".to_string();
        let security_row = |id: &str, activity_type: &str, asset_id: &str| {
            let mut row = activity(id, activity_type, "2026-04-02T00:00:00Z", dec!(10));
            row.asset_id = Some(asset_id.to_string());
            row.quantity = Some(dec!(1));
            row.unit_price = Some(dec!(10));
            row
        };

        // The engine books a foreign DRIP's income and purchase in two
        // currencies, and an option sale's sign turns on its multiplier.
        let mut drip = security_row("drip", ACTIVITY_TYPE_DIVIDEND, "AAPL");
        drip.subtype = Some("DRIP".to_string());
        drip.fx_rate = Some(dec!(1.35));
        let mut option_sale = security_row("sale", ACTIVITY_TYPE_SELL, "AAPL261218C00150000");
        option_sale.fee = Some(dec!(15));
        // A trade is a security row even when its asset is a cash symbol.
        let cash_symbol_trade = security_row("conversion", ACTIVITY_TYPE_BUY, "$CASH-EUR");
        for row in [drip, option_sale, cash_symbol_trade] {
            assert!(
                running_cash_balances(&account, &[deposit.clone(), row]).is_none(),
                "a security row withholds the balances"
            );
        }

        // A draft trade moves no cash, so the account still has balances.
        let mut draft = security_row("draft", ACTIVITY_TYPE_BUY, "AAPL");
        draft.status = ActivityStatus::Draft;
        assert!(running_cash_balances(&account, &[deposit, draft]).is_some());
    }
}
