// Test cases for HoldingsCalculator will go here.
#[cfg(test)]
mod tests {
    use crate::activities::{Activity, ActivityType};
    use crate::fx::FxError;
    use crate::fx::fx_traits::FxServiceTrait;
    use crate::portfolio::snapshot::holdings_calculator::HoldingsCalculator;
    use crate::portfolio::snapshot::{AccountStateSnapshot, Position, Lot};
    use chrono::{NaiveDate, Utc, TimeZone, DateTime};
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::HashMap;
    use std::str::FromStr;
    use std::sync::Arc;
    use std::collections::VecDeque;
    use crate::errors::Result;
    use async_trait;

    // --- Mock FxService ---
    #[derive(Clone)]
    struct MockFxService {
        conversion_rates: HashMap<(String, String, NaiveDate), Decimal>,
        fail_on_purpose: bool,
    }

    impl MockFxService {
        fn new() -> Self {
            MockFxService {
                conversion_rates: HashMap::new(),
                fail_on_purpose: false,
            }
        }

        // Helper to add bidirectional rates easily
        fn add_bidirectional_rate(&mut self, from: &str, to: &str, date: NaiveDate, rate: Decimal) {
            if rate == Decimal::ZERO {
                // Avoid division by zero for inverse rate
                self.conversion_rates.insert((from.to_string(), to.to_string(), date), rate);
            } else {
                self.conversion_rates.insert((from.to_string(), to.to_string(), date), rate);
                self.conversion_rates.insert((to.to_string(), from.to_string(), date), dec!(1) / rate); // Add inverse rate
            }
        }

        #[allow(dead_code)]
        fn set_fail_on_purpose(&mut self, fail: bool) {
            self.fail_on_purpose = fail;
        }
    }

    #[async_trait::async_trait]
    impl FxServiceTrait for MockFxService {
        fn initialize(&self) -> Result<()> {
            Err(crate::errors::Error::Unexpected("MockFxService::initialize not implemented".to_string()))
        }
        async fn add_exchange_rate(&self, _new_rate: crate::fx::fx_model::NewExchangeRate) -> Result<crate::fx::fx_model::ExchangeRate> {
            Err(crate::errors::Error::Unexpected("MockFxService::add_exchange_rate not implemented".to_string()))
        }
        fn get_historical_rates(&self, _from_currency: &str, _to_currency: &str, _days: i64) -> Result<Vec<crate::fx::fx_model::ExchangeRate>> {
            Err(crate::errors::Error::Unexpected("MockFxService::get_historical_rates not implemented".to_string()))
        }
        async fn update_exchange_rate(&self, _from_currency: &str, _to_currency: &str, _rate: Decimal) -> Result<crate::fx::fx_model::ExchangeRate> {
            Err(crate::errors::Error::Unexpected("MockFxService::update_exchange_rate not implemented".to_string()))
        }
        fn get_latest_exchange_rate(&self, _from_currency: &str, _to_currency: &str) -> Result<Decimal> {
            Err(crate::errors::Error::Unexpected("MockFxService::get_latest_exchange_rate not implemented".to_string()))
        }
        fn get_exchange_rate_for_date(&self, _from_currency: &str, _to_currency: &str, _date: NaiveDate) -> Result<Decimal> {
            Err(crate::errors::Error::Unexpected("MockFxService::get_exchange_rate_for_date not implemented".to_string()))
        }
        fn convert_currency(&self, _amount: Decimal, _from_currency: &str, _to_currency: &str) -> Result<Decimal> {
            Err(crate::errors::Error::Unexpected("MockFxService::convert_currency not implemented".to_string()))
        }

        // This is the one actually used by HoldingsCalculator and is synchronous
        fn convert_currency_for_date(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
            date: NaiveDate,
        ) -> Result<Decimal> {
            let lookup_key = (from_currency.to_string(), to_currency.to_string(), date);

            if self.fail_on_purpose {
                 return Err(crate::errors::Error::Fx(FxError::RateNotFound(format!(
                     "Intentional failure for {}->{} on {}",
                     from_currency, to_currency, date
                 ))));
            }
            if from_currency == to_currency {
                return Ok(amount);
            }

            match self.conversion_rates.get(&lookup_key)
            {
                Some(rate) => {
                    let result = amount * rate;
                    Ok(result)
                },
                None => {
                    Err(crate::errors::Error::Fx(FxError::RateNotFound(format!(
                        "Mock rate not found for {}->{} on {}",
                        from_currency, to_currency, date
                    ))))
                }
            }
        }
        fn get_latest_exchange_rates(&self) -> Result<Vec<crate::fx::fx_model::ExchangeRate>> {
            Err(crate::errors::Error::Unexpected("MockFxService::get_exchange_rates not implemented".to_string()))
        }
        async fn delete_exchange_rate(&self, _rate_id: &str) -> Result<()> {
            Err(crate::errors::Error::Unexpected("MockFxService::delete_exchange_rate not implemented".to_string()))
        }
        async fn register_currency_pair(&self, _from_currency: &str, _to_currency: &str) -> Result<()> {
            Err(crate::errors::Error::Unexpected("MockFxService::register_currency_pair not implemented".to_string()))
        }
         async fn register_currency_pair_manual(&self, _from_currency: &str, _to_currency: &str) -> Result<()> {
            Err(crate::errors::Error::Unexpected("MockFxService::register_currency_pair_manual not implemented".to_string()))
        }
    }

    // --- Helper Functions ---
    fn create_default_activity(
        id: &str,
        activity_type: ActivityType,
        asset_id: &str,
        quantity: Decimal,
        unit_price: Decimal,
        fee: Decimal,
        currency: &str,
        date_str: &str, // "YYYY-MM-DD"
    ) -> Activity {
        let activity_date_naive = NaiveDate::from_str(date_str)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let activity_date_utc: DateTime<Utc> = Utc.from_utc_datetime(&activity_date_naive);
        
        Activity {
            id: id.to_string(),
            account_id: "acc_1".to_string(),
            asset_id: asset_id.to_string(),
            activity_type: activity_type.as_str().to_string(),
            activity_date: activity_date_utc,
            quantity,
            unit_price,
            fee,
            currency: currency.to_string(),
            amount: None, 
            is_draft: false,
            comment: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
    
    fn create_cash_activity(
        id: &str,
        activity_type: ActivityType,
        amount: Decimal,
        fee: Decimal,
        currency: &str,
        date_str: &str, // "YYYY-MM-DD"
    ) -> Activity {
         let activity_date_naive = NaiveDate::from_str(date_str)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let activity_date_utc: DateTime<Utc> = Utc.from_utc_datetime(&activity_date_naive);
        Activity {
            id: id.to_string(),
            account_id: "acc_1".to_string(),
            asset_id: format!("$CASH-{}", currency), 
            activity_type: activity_type.as_str().to_string(),
            activity_date: activity_date_utc,
            quantity: dec!(1), 
            unit_price: amount, 
            fee,
            currency: currency.to_string(),
            amount: Some(amount),
            is_draft: false,
            comment: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }


    fn create_initial_snapshot(
        account_id: &str, 
        currency: &str, 
        date_str: &str // "YYYY-MM-DD"
    ) -> AccountStateSnapshot {
        let snapshot_date = NaiveDate::from_str(date_str).unwrap();
        AccountStateSnapshot {
            id: format!("{}_{}", account_id, snapshot_date.format("%Y-%m-%d")),
            account_id: account_id.to_string(),
            snapshot_date,
            currency: currency.to_string(),
            calculated_at: Utc::now().naive_utc(),
            cash_balances: HashMap::new(), 
            positions: HashMap::new(), 
            cost_basis: Decimal::ZERO,
            net_contribution: Decimal::ZERO,
        }
    }

    // --- Shared FX Rates ---
    fn usd_cad_rate(date_str: &str) -> Decimal {
        let date = NaiveDate::from_str(date_str).unwrap();
        if date <= NaiveDate::from_ymd_opt(2023, 1, 5).unwrap() {
            dec!(1.25) // 1 USD = 1.25 CAD
        } else {
            dec!(1.30) // 1 USD = 1.30 CAD
        }
    }

    fn add_usd_cad_rates(fx_service: &mut MockFxService, date_str: &str) {
        let date = NaiveDate::from_str(date_str).unwrap();
        let rate = usd_cad_rate(date_str);
        fx_service.add_bidirectional_rate("USD", "CAD", date, rate);
    }

    // --- Tests ---
    #[test]
    fn test_buy_activity_updates_holdings_and_cash() {
        let mock_fx_service = Arc::new(MockFxService::new());
        let calculator = HoldingsCalculator::new(mock_fx_service.clone());

        let account_currency = "CAD";
        let activity_currency = "CAD";
        let target_date_str = "2023-01-01";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();

        let previous_snapshot = create_initial_snapshot("acc_1", account_currency, "2022-12-31");
        
        let buy_activity = create_default_activity(
            "act_buy_1",
            ActivityType::Buy,
            "AAPL",
            dec!(10),
            dec!(150),
            dec!(5),
            activity_currency,
            target_date_str,
        );

        let activities_today = vec![buy_activity.clone()];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok());
        let next_state = result.unwrap();

        // Check position
        assert_eq!(next_state.positions.len(), 1);
        let position = next_state.positions.get("AAPL").unwrap();
        assert_eq!(position.quantity, dec!(10));
        assert_eq!(position.average_cost, dec!(150.5)); // Expected: 150 + (5/10)
        assert_eq!(position.total_cost_basis, dec!(1505)); // Expected: (10 * 150) + 5
        assert_eq!(position.currency, activity_currency);

        // Check cash balance (in account currency)
        let expected_cash = dec!(0) - (buy_activity.quantity * buy_activity.unit_price + buy_activity.fee);
        assert_eq!(next_state.cash_balances.get(account_currency), Some(&expected_cash));
        
        assert_eq!(next_state.cost_basis, dec!(1505));
        assert_eq!(next_state.net_contribution, dec!(0)); 
    }

    #[test]
    fn test_sell_activity_updates_holdings_and_cash() {
        let mock_fx_service = Arc::new(MockFxService::new());
        let calculator = HoldingsCalculator::new(mock_fx_service.clone());

        let account_currency = "CAD";
        let activity_currency = "CAD";
        let target_date_str = "2023-01-02";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();

        // Initial state: 10 AAPL @ 150, 0 cash (after a buy)
        let mut previous_snapshot = create_initial_snapshot("acc_1", account_currency, "2023-01-01");
        let initial_position = Position {
            id: "AAPL_acc_1".to_string(),
            account_id: "acc_1".to_string(),
            asset_id: "AAPL".to_string(),
            quantity: dec!(10),
            average_cost: dec!(150), // Average cost of existing position
            total_cost_basis: dec!(1500),
            currency: activity_currency.to_string(),
            inception_date: Utc.from_utc_datetime(&NaiveDate::from_str("2023-01-01").unwrap().and_hms_opt(0,0,0).unwrap()),
            lots: VecDeque::from(vec![Lot {
                id: "act_buy_1".to_string(), // Link to the buy activity
                position_id: "AAPL_acc_1".to_string(),
                acquisition_date: Utc.from_utc_datetime(&NaiveDate::from_str("2023-01-01").unwrap().and_hms_opt(0,0,0).unwrap()),
                quantity: dec!(10),
                cost_basis: dec!(1500),
                acquisition_price: dec!(150),
                acquisition_fees: dec!(5),
            }]),
            created_at: Utc::now(),
            last_updated: Utc::now(),
        };
        previous_snapshot.positions.insert("AAPL".to_string(), initial_position);
        previous_snapshot.cash_balances.insert(account_currency.to_string(), dec!(-1505));
        previous_snapshot.cost_basis = dec!(1500);

        let sell_activity = create_default_activity(
            "act_sell_1",
            ActivityType::Sell,
            "AAPL",
            dec!(5),  // Selling 5 shares
            dec!(160), // Sell price 160 CAD
            dec!(2),   // Sell fee 2 CAD
            activity_currency, // CAD
            target_date_str,
        );

        let activities_today = vec![sell_activity.clone()];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation failed: {:?}", result.err());
        let next_state = result.unwrap();

        // Check position
        assert_eq!(next_state.positions.len(), 1);
        let position = next_state.positions.get("AAPL").unwrap();
        assert_eq!(position.quantity, dec!(5)); // 10 - 5 = 5 remaining
        assert_eq!(position.average_cost, dec!(150)); // Average cost remains
        assert_eq!(position.total_cost_basis, dec!(750)); // 5 shares * 150 cost basis CAD

        // Check cash balance (in account currency)
        // Initial cash: -1505 CAD
        // Proceeds from sell: 5 * 160 = 800 CAD
        // Sell fee: 2 CAD
        // Expected cash: -1505 + 800 - 2 = -707 CAD
        let expected_cash = dec!(-1505) + (sell_activity.quantity * sell_activity.unit_price - sell_activity.fee);
        assert_eq!(
            next_state.cash_balances.get(account_currency),
            Some(&expected_cash)
        );
        
        // Overall cost basis for the account is now based on the remaining 5 shares
        assert_eq!(next_state.cost_basis, dec!(750)); // CAD
        assert_eq!(next_state.net_contribution, previous_snapshot.net_contribution); // Sell does not change net contribution
    }

    #[test]
    fn test_buy_activity_with_fx_conversion() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_str = "2023-01-03";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();
        let account_currency = "CAD";
        let activity_currency = "USD"; // Buy USD asset in CAD account

        // USD to CAD rate for the activity date
        add_usd_cad_rates(&mut mock_fx_service, target_date_str);
        let rate_usd_cad = usd_cad_rate(target_date_str); // 1.25

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service));

        let previous_snapshot = create_initial_snapshot("acc_fx_buy", account_currency, "2023-01-02");
        
        let buy_activity_usd = create_default_activity(
            "act_buy_usd_1",
            ActivityType::Buy,
            "MSFT",     // USD stock
            dec!(10),    // 10 shares
            dec!(100),   // 100 USD per share
            dec!(10),    // 10 USD fee
            activity_currency, // USD
            target_date_str,
        );

        let activities_today = vec![buy_activity_usd.clone()];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation failed: {:?}", result.err());
        let next_state = result.unwrap();

        // Check position (cost basis should be in asset's currency - USD)
        assert_eq!(next_state.positions.len(), 1);
        let position = next_state.positions.get("MSFT").unwrap();
        assert_eq!(position.quantity, dec!(10));
        assert_eq!(position.average_cost, dec!(101)); // Expected: 100 + (10/10)
        assert_eq!(position.total_cost_basis, dec!(1010)); // Expected: (10 * 100) + 10
        assert_eq!(position.currency, activity_currency); // USD

        // Check cash balance (should be in account currency - CAD)
        // Cost in USD: (10 shares * 100 USD/share) + 10 USD fee = 1000 + 10 = 1010 USD
        // Cost in CAD: 1010 USD * 1.25 CAD/USD = 1262.5 CAD
        let buy_cost_usd = buy_activity_usd.quantity * buy_activity_usd.unit_price + buy_activity_usd.fee;
        let expected_cash_change_cad = buy_cost_usd * rate_usd_cad;
        let expected_cash_cad = previous_snapshot.cash_balances.get(account_currency).cloned().unwrap_or(Decimal::ZERO) - expected_cash_change_cad;
        assert_eq!(
            next_state.cash_balances.get(account_currency),
            Some(&expected_cash_cad) // -1262.5 CAD
        );

        // Check overall cost_basis of the snapshot (should be in account currency - CAD)
        // Position cost basis is 1010 USD. Converted to CAD: 1010 USD * 1.25 CAD/USD = 1262.5 CAD
        let expected_snapshot_cost_basis_cad = position.total_cost_basis * rate_usd_cad;
        assert_eq!(next_state.cost_basis, expected_snapshot_cost_basis_cad); // 1262.5 CAD
        assert_eq!(next_state.net_contribution, previous_snapshot.net_contribution); // Buy does not change net contribution
    }

    #[test]
    fn test_deposit_activity_with_fx_conversion() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_str = "2023-01-04";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();
        let account_currency = "CAD";
        let activity_currency = "USD"; // Depositing USD into a CAD account

        // USD to CAD rate for the activity date
        add_usd_cad_rates(&mut mock_fx_service, target_date_str);
        let rate_usd_cad = usd_cad_rate(target_date_str); // 1.25

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service));

        let mut previous_snapshot = create_initial_snapshot("acc_deposit_fx", account_currency, "2023-01-03");
        previous_snapshot.cash_balances.insert(account_currency.to_string(), dec!(1000)); // Initial 1000 CAD
        previous_snapshot.net_contribution = dec!(500); // Initial 500 CAD net contribution

        let deposit_usd_activity = create_cash_activity(
            "act_deposit_usd_1",
            ActivityType::Deposit,
            dec!(100), // Depositing 100 USD
            dec!(1),   // 1 USD fee
            activity_currency, // USD
            target_date_str,
        );

        let activities_today = vec![deposit_usd_activity.clone()];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation failed: {:?}", result.err());
        let next_state = result.unwrap();

        // Check cash balance (in account currency - CAD)
        // Deposit amount in USD: 100 USD
        // Fee in USD: 1 USD
        // Net deposit amount in USD: 100 - 1 = 99 USD
        // Net deposit amount in CAD: 99 USD * 1.25 CAD/USD = 123.75 CAD
        // Expected cash CAD: 1000 (initial) + 123.75 (deposit) = 1123.75 CAD
        let net_deposit_activity_ccy = deposit_usd_activity.unit_price - deposit_usd_activity.fee;
        let expected_cash_change_cad = net_deposit_activity_ccy * rate_usd_cad;
        let expected_cash_cad = previous_snapshot.cash_balances.get(account_currency).unwrap() + expected_cash_change_cad;
        assert_eq!(
            next_state.cash_balances.get(account_currency),
            Some(&expected_cash_cad) // 1123.75 CAD
        );

        // Check net contribution (should be in account currency - CAD)
        // Net contribution change is based on the pre-fee deposit amount converted to account currency.
        // Deposit amount in USD: 100 USD
        // Deposit amount in CAD: 100 USD * 1.25 CAD/USD = 125 CAD
        // Expected net contribution: 500 (initial) + 125 (deposit) = 625 CAD
        let deposit_amount_converted_cad = deposit_usd_activity.unit_price * rate_usd_cad;
        let expected_net_contribution_cad = previous_snapshot.net_contribution + deposit_amount_converted_cad;
        assert_eq!(next_state.net_contribution, expected_net_contribution_cad); // 625 CAD

        // Cost basis should remain unchanged as it's a cash activity
        assert_eq!(next_state.cost_basis, previous_snapshot.cost_basis);
        assert!(next_state.positions.is_empty()); // No positions involved
    }

    #[test]
    fn test_withdrawal_activity_with_fx_conversion() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_str = "2023-01-05";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();
        let account_currency = "CAD";
        let activity_currency = "USD"; // Withdrawing USD from a CAD account

        // USD to CAD rate for the activity date
        add_usd_cad_rates(&mut mock_fx_service, target_date_str);
        let rate_usd_cad = usd_cad_rate(target_date_str); // 1.25

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service));

        let mut previous_snapshot = create_initial_snapshot("acc_withdraw_fx", account_currency, "2023-01-04");
        previous_snapshot.cash_balances.insert(account_currency.to_string(), dec!(2000)); // Initial 2000 CAD
        previous_snapshot.net_contribution = dec!(1000); // Initial 1000 CAD net contribution

        let withdrawal_usd_activity = create_cash_activity(
            "act_withdraw_usd_1",
            ActivityType::Withdrawal,
            dec!(50),  // Withdrawing 50 USD
            dec!(2),   // 2 USD fee
            activity_currency, // USD
            target_date_str,
        );

        let activities_today = vec![withdrawal_usd_activity.clone()];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation failed: {:?}", result.err());
        let next_state = result.unwrap();

        // Check cash balance (in account currency - CAD)
        // Withdrawal amount in USD: 50 USD
        // Fee in USD: 2 USD
        // Total withdrawal amount in USD: 50 + 2 = 52 USD
        // Total withdrawal amount in CAD: 52 USD * 1.25 CAD/USD = 65 CAD
        // Expected cash CAD: 2000 (initial) - 65 (withdrawal) = 1935 CAD
        let total_withdrawal_activity_ccy = withdrawal_usd_activity.unit_price + withdrawal_usd_activity.fee;
        let expected_cash_change_cad = total_withdrawal_activity_ccy * rate_usd_cad;
        let expected_cash_cad = previous_snapshot.cash_balances.get(account_currency).unwrap() - expected_cash_change_cad;
         assert_eq!(
            next_state.cash_balances.get(account_currency),
            Some(&expected_cash_cad)
        );
        
        // Check net contribution (should be in account currency - CAD)
        // Net contribution change is based on the pre-fee withdrawal amount converted to account currency.
        // Withdrawal amount in USD: 50 USD
        // Withdrawal amount in CAD: 50 USD * 1.25 CAD/USD = 62.5 CAD
        // Expected net contribution: 1000 (initial) - 62.5 (withdrawal) = 937.5 CAD
        let withdrawal_amount_converted_cad = withdrawal_usd_activity.unit_price * rate_usd_cad;
        let expected_net_contribution_cad = previous_snapshot.net_contribution - withdrawal_amount_converted_cad;
        assert_eq!(next_state.net_contribution, expected_net_contribution_cad);

        assert_eq!(next_state.cost_basis, previous_snapshot.cost_basis);
        assert!(next_state.positions.is_empty());
    }

    #[test]
    fn test_income_activities_updates_cash_not_net_contribution() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_str = "2023-01-06";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();
        let account_currency = "CAD";
        let activity_currency_div = "CAD";
        let activity_currency_int = "USD"; // Interest in USD

        // USD to CAD rate for the interest activity date
        add_usd_cad_rates(&mut mock_fx_service, target_date_str);
        let rate_usd_cad = usd_cad_rate(target_date_str); // 1.30

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service));

        let mut previous_snapshot = create_initial_snapshot("acc_income", account_currency, "2023-01-05");
        previous_snapshot.cash_balances.insert(account_currency.to_string(), dec!(1000));
        previous_snapshot.net_contribution = dec!(500);

        let dividend_activity = create_cash_activity(
            "act_div_1",
            ActivityType::Dividend,
            dec!(50),  // 50 CAD dividend
            dec!(0),   // 0 fee
            activity_currency_div, // CAD
            target_date_str,
        );

        let interest_activity_usd = create_cash_activity(
            "act_int_usd_1",
            ActivityType::Interest,
            dec!(20),  // 20 USD interest
            dec!(1),   // 1 USD fee
            activity_currency_int, // USD
            target_date_str,
        );

        let activities_today = vec![dividend_activity.clone(), interest_activity_usd.clone()];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation failed: {:?}", result.err());
        let next_state = result.unwrap();

        // Check cash balance (in account currency - CAD)
        // Initial cash: 1000 CAD
        // Dividend (CAD): +50 CAD
        // Interest (USD): 20 USD gross - 1 USD fee = 19 USD net
        // Interest (CAD): 19 USD * 1.30 CAD/USD = 24.7 CAD
        // Expected cash CAD: 1000 + 50 + 24.7 = 1074.7 CAD
        let net_dividend_cad = dividend_activity.unit_price - dividend_activity.fee;
        let net_interest_usd = interest_activity_usd.unit_price - interest_activity_usd.fee;
        let net_interest_cad = net_interest_usd * rate_usd_cad;

        let expected_cash_cad = previous_snapshot.cash_balances.get(account_currency).unwrap()
                                + net_dividend_cad
                                + net_interest_cad;
        assert_eq!(
            next_state.cash_balances.get(account_currency),
            Some(&expected_cash_cad) // 1074.7 CAD
        );

        // Check net contribution (should remain unchanged for income activities)
        assert_eq!(next_state.net_contribution, previous_snapshot.net_contribution); // 500 CAD

        assert_eq!(next_state.cost_basis, previous_snapshot.cost_basis);
        assert!(next_state.positions.is_empty());
    }

    #[test]
    fn test_charge_activities_fee_and_tax() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_str = "2023-01-07";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();
        let account_currency = "CAD";
        let fee_activity_currency = "CAD";
        let tax_activity_currency = "USD"; // Tax in USD

        add_usd_cad_rates(&mut mock_fx_service, target_date_str);
        let rate_usd_cad = usd_cad_rate(target_date_str); // 1.30

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service));

        let mut previous_snapshot = create_initial_snapshot("acc_charge", account_currency, "2023-01-06");
        previous_snapshot.cash_balances.insert(account_currency.to_string(), dec!(1000));
        let initial_net_contribution = dec!(500);
        previous_snapshot.net_contribution = initial_net_contribution;

        // Fee activity where charge is in the 'fee' field
        let fee_activity = create_default_activity(
            "act_fee_1",
            ActivityType::Fee,
            "", // No asset for general fee
            Decimal::ZERO, // Quantity not relevant
            Decimal::ZERO, // Unit price not relevant
            dec!(25),      // Fee amount 25 CAD
            fee_activity_currency, // CAD
            target_date_str,
        );

        // Tax activity where charge is in the 'amount' field (unit_price * quantity)
        let tax_activity_usd = create_cash_activity(
            "act_tax_usd_1",
            ActivityType::Tax,
            dec!(50),  // Tax amount in USD
            dec!(0),   // No separate fee
            tax_activity_currency, // USD
            target_date_str,
        );

        let activities_today = vec![fee_activity.clone(), tax_activity_usd.clone()];
        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation failed: {:?}", result.err());
        let next_state = result.unwrap();

        // Check cash balance (in account currency - CAD)
        // Initial cash: 1000 CAD
        // Fee (CAD): -25 CAD
        // Tax (USD): 50 USD. Converted to CAD: 50 USD * 1.30 CAD/USD = 65 CAD. So, -65 CAD
        // Expected cash CAD: 1000 - 25 - 65 = 910 CAD
        let fee_cad = fee_activity.fee;
        let tax_usd = tax_activity_usd.unit_price; // create_cash_activity puts amount into unit_price
        let tax_cad = tax_usd * rate_usd_cad;
        let expected_cash_cad = previous_snapshot.cash_balances.get(account_currency).unwrap()
                                - fee_cad
                                - tax_cad;
        assert_eq!(
            next_state.cash_balances.get(account_currency),
            Some(&expected_cash_cad) // 910 CAD
        );
        
        // Net contribution should remain unchanged for charges
        assert_eq!(next_state.net_contribution, initial_net_contribution); // 500 CAD
        assert_eq!(next_state.cost_basis, previous_snapshot.cost_basis);
        assert!(next_state.positions.is_empty());
    }

    #[test]
    fn test_add_and_remove_holding_activities() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_add_str = "2023-01-08";
        let target_date_add = NaiveDate::from_str(target_date_add_str).unwrap();
        let target_date_remove_str = "2023-01-09";
        let target_date_remove = NaiveDate::from_str(target_date_remove_str).unwrap();
        
        let account_currency = "CAD";
        let asset_currency = "USD"; // Asset is priced in USD

        // Rates for conversion between USD (asset) and CAD (account)
        add_usd_cad_rates(&mut mock_fx_service, target_date_add_str);
        add_usd_cad_rates(&mut mock_fx_service, target_date_remove_str);
        let rate_add_date = usd_cad_rate(target_date_add_str); // 1.30
        let rate_remove_date = usd_cad_rate(target_date_remove_str); // 1.30

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service.clone()));

        // --- Initial State ---
        let mut previous_snapshot_add = create_initial_snapshot("acc_add_remove", account_currency, "2023-01-07");
        previous_snapshot_add.cash_balances.insert(account_currency.to_string(), dec!(1000)); // 1000 CAD
        let initial_net_contribution = dec!(500); // 500 CAD
        previous_snapshot_add.net_contribution = initial_net_contribution;

        // --- 1. AddHolding Activity ---
        let add_holding_activity = create_default_activity(
            "act_add_tsla",
            ActivityType::AddHolding,
            "TSLA",      // Asset ID
            dec!(10),    // Quantity
            dec!(200),   // Unit price (cost basis per share in USD)
            dec!(5),     // Fee in USD
            asset_currency, // USD
            target_date_add_str,
        );
        
        let activities_add = vec![add_holding_activity.clone()];
        let result_add = calculator.calculate_next_holdings(&previous_snapshot_add, &activities_add, target_date_add);
        assert!(result_add.is_ok(), "AddHolding calculation failed: {:?}", result_add.err());
        let state_after_add = result_add.unwrap();

        // Check position after AddHolding (cost basis in USD)
        let position_tsla = state_after_add.positions.get("TSLA").unwrap();
        assert_eq!(position_tsla.quantity, dec!(10));
        assert_eq!(position_tsla.average_cost, dec!(200.5)); // Cost is (200*10 + 5) / 10
        assert_eq!(position_tsla.total_cost_basis, dec!(2005)); // (10 * 200) + 5 USD
        assert_eq!(position_tsla.currency, asset_currency); // USD

        // Check cash after AddHolding (in CAD)
        // Fee was 5 USD. Converted to CAD: 5 USD * 1.30 CAD/USD = 6.50 CAD
        // Expected cash CAD: 1000 (initial) - 6.50 (fee) = 993.50 CAD
        let fee_add_cad = add_holding_activity.fee * rate_add_date;
        let expected_cash_after_add = previous_snapshot_add.cash_balances.get(account_currency).unwrap() - fee_add_cad;
        assert_eq!(state_after_add.cash_balances.get(account_currency), Some(&expected_cash_after_add));

        // Check net contribution after AddHolding (in CAD)
        // Cost basis added was 10 shares * 200 USD/share + 5 USD fee = 2005 USD.
        // Converted to CAD using ADD date rate: 2005 USD * 1.30 CAD/USD = 2606.50 CAD.
        let added_basis_usd = (add_holding_activity.quantity * add_holding_activity.unit_price) + add_holding_activity.fee;
        let added_basis_cad = added_basis_usd * rate_add_date;
        let expected_net_contribution_after_add = initial_net_contribution + added_basis_cad;
        assert_eq!(state_after_add.net_contribution, expected_net_contribution_after_add);

        // Check overall cost_basis of snapshot (in CAD)
        // Position cost basis 2005 USD -> 2005 * 1.30 (snapshot date rate) = 2606.50 CAD
        assert_eq!(state_after_add.cost_basis, added_basis_cad); // 2606.50 CAD

        // --- 2. RemoveHolding Activity ---
        let remove_holding_activity = create_default_activity(
            "act_remove_tsla",
            ActivityType::RemoveHolding,
            "TSLA",      // Asset ID
            dec!(4),     // Quantity to remove
            dec!(0),     // Unit price not used by RemoveHolding for cost basis reduction logic (uses FIFO from lots)
            dec!(2),     // Fee in USD
            asset_currency, // USD
            target_date_remove_str,
        );

        let activities_remove = vec![remove_holding_activity.clone()];
        let result_remove = calculator.calculate_next_holdings(&state_after_add, &activities_remove, target_date_remove);
        assert!(result_remove.is_ok(), "RemoveHolding calculation failed: {:?}", result_remove.err());
        let state_after_remove = result_remove.unwrap();

        // Check position after RemoveHolding (cost basis in USD)
        let position_tsla_after_remove = state_after_remove.positions.get("TSLA").unwrap();
        assert_eq!(position_tsla_after_remove.quantity, dec!(6)); // 10 - 4 = 6 shares left
        assert_eq!(position_tsla_after_remove.average_cost, dec!(200.5)); // Average cost remains
        assert_eq!(position_tsla_after_remove.total_cost_basis, dec!(1203)); // 6 * 200.5 USD

        // Check cash after RemoveHolding (in CAD)
        // Fee was 2 USD. Converted to CAD: 2 USD * 1.30 CAD/USD (rate for remove date) = 2.60 CAD
        // Expected cash CAD: 993.50 (from after_add) - 2.60 (fee) = 990.90 CAD
        let fee_remove_cad = remove_holding_activity.fee * rate_remove_date;
        let expected_cash_after_remove = state_after_add.cash_balances.get(account_currency).unwrap() - fee_remove_cad;
        assert_eq!(state_after_remove.cash_balances.get(account_currency), Some(&expected_cash_after_remove));

        // Check net contribution after RemoveHolding (in CAD)
        // Cost basis removed was 4 shares * 200.5 USD/share (FIFO cost) = 802 USD.
        // Converted to CAD using REMOVE DATE rate: 802 USD * 1.30 CAD/USD = 1042.6 CAD
        let removed_basis_usd = dec!(4) * dec!(200.5);
        let removed_basis_cad = removed_basis_usd * rate_remove_date;
        let expected_net_contribution_after_remove = state_after_add.net_contribution - removed_basis_cad;
        assert_eq!(state_after_remove.net_contribution, expected_net_contribution_after_remove);
        
        // Check overall cost_basis of snapshot (in CAD)
        // Remaining position cost basis 1203 USD -> 1203 * 1.30 (snapshot date rate) = 1563.9 CAD
        let expected_snapshot_cost_basis_cad = position_tsla_after_remove.total_cost_basis * rate_remove_date;
        assert_eq!(state_after_remove.cost_basis, expected_snapshot_cost_basis_cad); // 1563.9 CAD
    }

    #[test]
    fn test_transfer_in_out_activities() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_asset_transfer_str = "2023-01-10";
        let target_date_asset_transfer = NaiveDate::from_str(target_date_asset_transfer_str).unwrap();
        let target_date_cash_transfer_str = "2023-01-11";
        let target_date_cash_transfer = NaiveDate::from_str(target_date_cash_transfer_str).unwrap();
        
        let account_currency = "CAD";
        let asset_currency = "USD"; // Asset priced in USD
        let cash_transfer_currency = "USD"; // Cash transfer in USD

        // Add rates for both dates
        add_usd_cad_rates(&mut mock_fx_service, target_date_asset_transfer_str);
        add_usd_cad_rates(&mut mock_fx_service, target_date_cash_transfer_str);
        let rate_asset_date = usd_cad_rate(target_date_asset_transfer_str); // 1.30
        let rate_cash_date = usd_cad_rate(target_date_cash_transfer_str); // 1.30

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service.clone()));

        // --- Initial State ---
        let mut previous_snapshot_asset_tx = create_initial_snapshot("acc_transfer", account_currency, "2023-01-09");
        previous_snapshot_asset_tx.cash_balances.insert(account_currency.to_string(), dec!(5000)); // 5000 CAD
        let initial_net_contribution = dec!(2000); // 2000 CAD
        previous_snapshot_asset_tx.net_contribution = initial_net_contribution;

        // --- 1. Asset TransferIn ---
        let transfer_in_asset_activity = create_default_activity(
            "act_tx_in_asset", ActivityType::TransferIn, "TESTUSD", dec!(50), // Asset ID changed
            dec!(120), dec!(10), asset_currency, target_date_asset_transfer_str, // 50 shares @ 120 USD, 10 USD fee
        );
        let activities_asset_tx_in = vec![transfer_in_asset_activity.clone()];
        let result_asset_tx_in = calculator.calculate_next_holdings(&previous_snapshot_asset_tx, &activities_asset_tx_in, target_date_asset_transfer);
        assert!(result_asset_tx_in.is_ok(), "Asset TransferIn failed: {:?}", result_asset_tx_in.err());
        let state_after_asset_tx_in = result_asset_tx_in.unwrap();

        // Position checks (USD)
        let position_testusd = state_after_asset_tx_in.positions.get("TESTUSD").unwrap();
        assert_eq!(position_testusd.quantity, dec!(50));
        assert_eq!(position_testusd.average_cost, dec!(120.2)); // (120 * 50 + 10) / 50 USD
        assert_eq!(position_testusd.total_cost_basis, dec!(6010)); // (50 * 120) + 10 USD

        // Cash checks (CAD)
        let fee_in_asset_tx_in_cad = transfer_in_asset_activity.fee * rate_asset_date; // 10 * 1.30 = 13 CAD
        let expected_cash_after_asset_tx_in = dec!(5000) - fee_in_asset_tx_in_cad; // 5000 - 13 = 4987 CAD
        assert_eq!(state_after_asset_tx_in.cash_balances.get(account_currency), Some(&expected_cash_after_asset_tx_in));

        // Net Contribution (CAD)
        let added_basis_usd = position_testusd.total_cost_basis; // 6010 USD
        let added_basis_asset_tx_in_cad = added_basis_usd * rate_asset_date; // 6010 * 1.30 = 7813 CAD
        let expected_net_contrib_asset_tx_in = initial_net_contribution + added_basis_asset_tx_in_cad; // 2000 + 7813 = 9813 CAD
        assert_eq!(state_after_asset_tx_in.net_contribution, expected_net_contrib_asset_tx_in);

        // Snapshot Cost Basis (CAD)
        assert_eq!(state_after_asset_tx_in.cost_basis, added_basis_asset_tx_in_cad); // 7813 CAD

        // --- 2. Asset TransferOut ---
        let transfer_out_asset_activity = create_default_activity(
            "act_tx_out_asset", ActivityType::TransferOut, "TESTUSD", dec!(20),
            dec!(0), dec!(5), asset_currency, target_date_asset_transfer_str, // Price not used for FIFO; 5 USD fee
        );
        let activities_asset_tx_out = vec![transfer_out_asset_activity.clone()];
        let result_asset_tx_out = calculator.calculate_next_holdings(&state_after_asset_tx_in, &activities_asset_tx_out, target_date_asset_transfer);
        assert!(result_asset_tx_out.is_ok(), "Asset TransferOut failed: {:?}", result_asset_tx_out.err());
        let state_after_asset_tx_out = result_asset_tx_out.unwrap();

        // Position checks (USD)
        let position_testusd_after_out = state_after_asset_tx_out.positions.get("TESTUSD").unwrap();
        assert_eq!(position_testusd_after_out.quantity, dec!(30)); // 50 - 20
        assert_eq!(position_testusd_after_out.average_cost, dec!(120.2)); // Remains same
        assert_eq!(position_testusd_after_out.total_cost_basis, dec!(3606)); // 30 * 120.2 USD

        // Cash checks (CAD)
        let fee_out_asset_tx_cad = transfer_out_asset_activity.fee * rate_asset_date; // 5 * 1.30 = 6.5 CAD
        let expected_cash_after_asset_tx_out = expected_cash_after_asset_tx_in - fee_out_asset_tx_cad; // 4987 - 6.5 = 4980.5 CAD
        assert_eq!(state_after_asset_tx_out.cash_balances.get(account_currency), Some(&expected_cash_after_asset_tx_out));

        // Net Contribution (CAD)
        let removed_basis_usd = dec!(20) * dec!(120.2); // 2404 USD
        let removed_basis_asset_tx_out_cad = removed_basis_usd * rate_asset_date; // 2404 * 1.30 = 3125.2 CAD
        let expected_net_contrib_asset_tx_out = expected_net_contrib_asset_tx_in - removed_basis_asset_tx_out_cad; // 9813 - 3125.2 = 6687.8 CAD
        assert_eq!(state_after_asset_tx_out.net_contribution, expected_net_contrib_asset_tx_out);

        // Snapshot Cost Basis (CAD)
        let expected_snapshot_cost_basis_cad = position_testusd_after_out.total_cost_basis * rate_asset_date; // 3606 * 1.30 = 4687.8 CAD
        assert_eq!(state_after_asset_tx_out.cost_basis, expected_snapshot_cost_basis_cad); // 4687.8 CAD

        // --- 3. Cash TransferIn (USD into CAD account) ---
        let transfer_in_cash_activity = create_cash_activity(
            "act_tx_in_cash", ActivityType::TransferIn, dec!(1000),
            dec!(8), cash_transfer_currency, target_date_cash_transfer_str, // 1000 USD, 8 USD fee
        );
        let activities_cash_tx_in = vec![transfer_in_cash_activity.clone()];
        let result_cash_tx_in = calculator.calculate_next_holdings(&state_after_asset_tx_out, &activities_cash_tx_in, target_date_cash_transfer);
        assert!(result_cash_tx_in.is_ok(), "Cash TransferIn failed: {:?}", result_cash_tx_in.err());
        let state_after_cash_tx_in = result_cash_tx_in.unwrap();

        // Cash checks (CAD)
        let net_cash_in_usd = transfer_in_cash_activity.unit_price - transfer_in_cash_activity.fee; // 1000 - 8 = 992 USD
        let cash_in_cad = net_cash_in_usd * rate_cash_date; // 992 * 1.30 = 1289.6 CAD
        let expected_cash_after_cash_tx_in = expected_cash_after_asset_tx_out + cash_in_cad; // 4980.5 + 1289.6 = 6270.1 CAD
        assert_eq!(state_after_cash_tx_in.cash_balances.get(account_currency), Some(&expected_cash_after_cash_tx_in));

        // Net Contribution (CAD)
        let net_contrib_change_cash_tx_in_cad = transfer_in_cash_activity.unit_price * rate_cash_date; // 1000 * 1.30 = 1300 CAD
        let expected_net_contrib_cash_tx_in = expected_net_contrib_asset_tx_out + net_contrib_change_cash_tx_in_cad; // 6687.8 + 1300 = 7987.8 CAD
        assert_eq!(state_after_cash_tx_in.net_contribution, expected_net_contrib_cash_tx_in);

        // Snapshot Cost Basis (CAD) - unchanged from previous step
        assert_eq!(state_after_cash_tx_in.cost_basis, state_after_asset_tx_out.cost_basis); // 4687.8 CAD

        // --- 4. Cash TransferOut (USD from CAD account) ---
        let transfer_out_cash_activity = create_cash_activity(
            "act_tx_out_cash", ActivityType::TransferOut, dec!(200),
            dec!(3), cash_transfer_currency, target_date_cash_transfer_str, // 200 USD, 3 USD fee
        );
        let activities_cash_tx_out = vec![transfer_out_cash_activity.clone()];
        let result_cash_tx_out = calculator.calculate_next_holdings(&state_after_cash_tx_in, &activities_cash_tx_out, target_date_cash_transfer);
        assert!(result_cash_tx_out.is_ok(), "Cash TransferOut failed: {:?}", result_cash_tx_out.err());
        let state_after_cash_tx_out = result_cash_tx_out.unwrap();

        // Cash checks (CAD)
        let total_cash_out_usd = transfer_out_cash_activity.unit_price + transfer_out_cash_activity.fee; // 200 + 3 = 203 USD
        let cash_out_cad = total_cash_out_usd * rate_cash_date; // 203 * 1.30 = 263.9 CAD
        let expected_cash_after_cash_tx_out = expected_cash_after_cash_tx_in - cash_out_cad; // 6270.1 - 263.9 = 6006.2 CAD
        assert_eq!(state_after_cash_tx_out.cash_balances.get(account_currency), Some(&expected_cash_after_cash_tx_out));

        // Net Contribution (CAD)
        let net_contrib_change_cash_tx_out_cad = transfer_out_cash_activity.unit_price * rate_cash_date; // 200 * 1.30 = 260 CAD
        let expected_net_contrib_cash_tx_out = expected_net_contrib_cash_tx_in - net_contrib_change_cash_tx_out_cad; // 7987.8 - 260 = 7727.8 CAD
        assert_eq!(state_after_cash_tx_out.net_contribution, expected_net_contrib_cash_tx_out);

        // Snapshot Cost Basis (CAD) - unchanged from previous step
        assert_eq!(state_after_cash_tx_out.cost_basis, state_after_cash_tx_in.cost_basis); // 4687.8 CAD
    }

    #[test]
    fn test_multiple_activities_on_same_day_with_fx() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_str = "2023-01-12";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();
        let account_currency = "CAD";
        let asset_currency = "USD"; // Asset priced in USD

        // USD to CAD rate for the activity date
        add_usd_cad_rates(&mut mock_fx_service, target_date_str);
        let rate_usd_cad = usd_cad_rate(target_date_str); // 1.30

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service.clone()));

        let mut previous_snapshot = create_initial_snapshot("acc_multi_act", account_currency, "2023-01-11");
        previous_snapshot.cash_balances.insert(account_currency.to_string(), dec!(1000000)); // 1M CAD
        previous_snapshot.net_contribution = dec!(0);

        let buy_activity_usd = create_default_activity(
            "act_buy_multi_1", ActivityType::Buy, "MSFT", dec!(20),
            dec!(300), dec!(10), asset_currency, target_date_str, // Buy 20 MSFT @ 300 USD, 10 USD fee
        );

        let sell_activity_usd = create_default_activity(
            "act_sell_multi_1", ActivityType::Sell, "MSFT", dec!(5),
            dec!(310), dec!(5), asset_currency, target_date_str, // Sell 5 MSFT @ 310 USD, 5 USD fee
        );

        // Order matters: buy first, then sell
        let activities_today = vec![buy_activity_usd.clone(), sell_activity_usd.clone()];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation failed: {:?}", result.err());
        let next_state = result.unwrap();

        // --- Check Position (MSFT in USD) ---
        // Bought 20 @ 300 USD (cost basis 300*20+10 = 6010 USD, avg 300.5 USD)
        // Sold 5
        // Remaining 15 shares.
        assert_eq!(next_state.positions.len(), 1);
        let position_msft = next_state.positions.get("MSFT").unwrap();
        assert_eq!(position_msft.quantity, dec!(15));
        assert_eq!(position_msft.average_cost, dec!(300.5)); // 300.5 USD
        assert_eq!(position_msft.total_cost_basis, dec!(4507.5)); // 15 shares * 300.5 USD

        // --- Check Cash Balance (CAD) ---
        // Initial cash: 1,000,000 CAD
        // Buy cost: (20 shares * 300 USD) + 10 USD fee = 6010 USD
        // Buy cost in CAD: 6010 USD * 1.30 CAD/USD = 7813 CAD
        // Sell proceeds: (5 shares * 310 USD) - 5 USD fee = 1545 USD
        // Sell proceeds in CAD: 1545 USD * 1.30 CAD/USD = 2008.5 CAD
        // Expected cash CAD: 1,000,000 - 7813 + 2008.5 = 994195.5 CAD

        let buy_cost_usd = buy_activity_usd.quantity * buy_activity_usd.unit_price + buy_activity_usd.fee;
        let buy_cost_cad = buy_cost_usd * rate_usd_cad;

        let sell_proceeds_usd = sell_activity_usd.quantity * sell_activity_usd.unit_price - sell_activity_usd.fee;
        let sell_proceeds_cad = sell_proceeds_usd * rate_usd_cad;

        let expected_cash_cad = previous_snapshot.cash_balances.get(account_currency).unwrap()
                                - buy_cost_cad
                                + sell_proceeds_cad;
        assert_eq!(
            next_state.cash_balances.get(account_currency),
            Some(&expected_cash_cad) // 994195.5 CAD
        );

        // --- Check Snapshot Cost Basis (CAD) ---
        // Remaining position cost basis is 4507.5 USD.
        // Converted to CAD: 4507.5 USD * 1.30 CAD/USD = 5859.75 CAD
        let expected_snapshot_cost_basis_cad = position_msft.total_cost_basis * rate_usd_cad;
        assert_eq!(next_state.cost_basis, expected_snapshot_cost_basis_cad); // 5859.75 CAD

        // --- Check Net Contribution (CAD) ---
        // Buy/Sell of assets does not change net contribution. Initial was 0.
        assert_eq!(next_state.net_contribution, previous_snapshot.net_contribution); // 0 CAD
    }

    #[test]
    fn test_fx_conversion_failure_fallback() {
        // Use CAD account, EUR activity, but provide NO EUR->CAD rate
        let mut mock_fx_service = MockFxService::new();
        // DO NOT ADD EUR <-> CAD rate here
        mock_fx_service.set_fail_on_purpose(false); // Ensure it only fails due to missing rate

        let target_date_str = "2023-01-13";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();
        let account_currency = "CAD";
        let activity_currency = "EUR"; // Activity in EUR, account in CAD

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service));

        let mut previous_snapshot = create_initial_snapshot("acc_fx_fail", account_currency, "2023-01-12");
        previous_snapshot.cash_balances.insert(account_currency.to_string(), dec!(10000)); // 10000 CAD
        previous_snapshot.net_contribution = dec!(0);

        let buy_activity_eur = create_default_activity(
            "act_buy_eur_fx_fail",
            ActivityType::Buy,
            "ADS.DE",
            dec!(10),    // 10 shares
            dec!(200),   // 200 EUR per share
            dec!(15),    // 15 EUR fee
            activity_currency, // EUR
            target_date_str,
        );

        let activities_today = vec![buy_activity_eur.clone()];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation should still succeed with FX fallback: {:?}", result.err());
        let next_state = result.unwrap();

        // --- Check Position (ADS.DE in EUR) ---
        // Position cost basis is always in asset's currency (EUR)
        assert_eq!(next_state.positions.len(), 1);
        let position_ads = next_state.positions.get("ADS.DE").unwrap();
        assert_eq!(position_ads.quantity, dec!(10));
        assert_eq!(position_ads.average_cost, dec!(201.5)); // Expected: 200 + (15/10) EUR
        assert_eq!(position_ads.total_cost_basis, dec!(2015)); // Expected: (10 * 200) + 15 EUR
        assert_eq!(position_ads.currency, activity_currency); // EUR

        // --- Check Cash Balance (CAD) ---
        // FX conversion for activity amount (unit price) and fee to account currency (CAD) will fail.
        // Calculator should use original EUR amounts for cash deduction from CAD balance (1:1 fallback).
        // Cost in EUR: (10 shares * 200 EUR) + 15 EUR fee = 2015 EUR.
        // Since conversion to CAD fails, this 2015 is treated as 2015 CAD for cash change.
        // Expected cash CAD: 10000 (initial) - 2015 (EUR amount treated as CAD) = 7985 CAD.
        let buy_cost_eur_val = buy_activity_eur.quantity * buy_activity_eur.unit_price; // 2000 EUR
        let fee_eur_val = buy_activity_eur.fee; // 15 EUR
        // The handler calls convert_currency_for_date separately for price and fee
        // Both will fail and return original values
        let expected_cash_cad = previous_snapshot.cash_balances.get(account_currency).unwrap()
                                - buy_cost_eur_val // Fallback uses 2000 EUR as 2000 CAD
                                - fee_eur_val;    // Fallback uses 15 EUR as 15 CAD
        assert_eq!(
            next_state.cash_balances.get(account_currency),
            Some(&expected_cash_cad), // 7985 CAD
            "Cash balance mismatch. Expected fallback to use unconverted activity currency values against account currency."
        );

        // --- Check Snapshot Cost Basis (CAD) ---
        // The final snapshot cost basis calculation *also* tries to convert position.total_cost_basis (2015 EUR) to account currency (CAD).
        // This conversion will also fail. Fallback uses 1:1 rate.
        // So, 2015 EUR position cost basis becomes 2015 CAD for the snapshot's cost_basis field.
        let expected_snapshot_cost_basis_cad = position_ads.total_cost_basis; // Fallback: 2015 EUR treated as 2015 CAD
        assert_eq!(next_state.cost_basis, expected_snapshot_cost_basis_cad,
            "Snapshot cost_basis mismatch. Expected fallback to use unconverted position currency value if final conversion fails.");
        
        assert_eq!(next_state.net_contribution, previous_snapshot.net_contribution); // 0 CAD
    }

    #[test]
    fn test_cash_balances_reflects_activity_currencies() {
        let mut mock_fx_service = MockFxService::new();
        let target_date_str = "2023-01-15";
        let target_date = NaiveDate::from_str(target_date_str).unwrap();
        
        let account_currency = "CAD";
        let usd_currency = "USD";
        let eur_currency = "EUR";

        // FX Rates
        mock_fx_service.add_bidirectional_rate(usd_currency, account_currency, target_date, dec!(1.25)); // 1 USD = 1.25 CAD
        mock_fx_service.add_bidirectional_rate(eur_currency, account_currency, target_date, dec!(1.50)); // 1 EUR = 1.50 CAD
        let rate_usd_cad = dec!(1.25);
        let rate_eur_cad = dec!(1.50);

        let calculator = HoldingsCalculator::new(Arc::new(mock_fx_service));

        // Initial Snapshot
        let mut previous_snapshot = create_initial_snapshot("acc_multi_cash", account_currency, "2023-01-14");
        let initial_cad_cash = dec!(1000);
        previous_snapshot.cash_balances.insert(account_currency.to_string(), initial_cad_cash);
        let initial_net_contribution = dec!(1000); // Assuming initial contribution matches initial cash
        previous_snapshot.net_contribution = initial_net_contribution;

        // Activities
        let deposit_usd_activity = create_cash_activity(
            "act_deposit_usd",
            ActivityType::Deposit,
            dec!(100), // 100 USD
            dec!(2),   // 2 USD fee
            usd_currency,
            target_date_str,
        ); // Net 98 USD

        let buy_stock_usd_activity = create_default_activity(
            "act_buy_xyz",
            ActivityType::Buy,
            "XYZ",      // Asset ID
            dec!(10),   // 10 shares
            dec!(5),    // 5 USD per share
            dec!(1),    // 1 USD fee
            usd_currency,
            target_date_str,
        ); // Cost 51 USD (10*5 + 1)

        let deposit_eur_activity = create_cash_activity(
            "act_deposit_eur",
            ActivityType::Deposit,
            dec!(200), // 200 EUR
            dec!(5),   // 5 EUR fee
            eur_currency,
            target_date_str,
        ); // Net 195 EUR
        
        let activities_today = vec![
            deposit_usd_activity.clone(), 
            buy_stock_usd_activity.clone(), 
            deposit_eur_activity.clone()
        ];

        let result = calculator.calculate_next_holdings(&previous_snapshot, &activities_today, target_date);
        assert!(result.is_ok(), "Calculation failed: {:?}", result.err());
        let next_state = result.unwrap();

        // --- Assert Cash Balances ---
        // For an individual account snapshot produced by HoldingsCalculator, cash should be consolidated
        // into the account's primary currency.
        assert_eq!(next_state.cash_balances.len(), 1, "Should have cash balance in 1 currency (account's primary)");

        // CAD Balance
        // Initial: 1000 CAD
        // USD Deposit (Net 98 USD * 1.25 CAD/USD): +122.5 CAD
        // USD Buy Stock (Cost 51 USD * 1.25 CAD/USD): -63.75 CAD
        // EUR Deposit (Net 195 EUR * 1.50 CAD/EUR): +292.5 CAD
        // Expected CAD: 1000 + 122.5 - 63.75 + 292.5 = 1351.25 CAD
        let expected_cad_cash = dec!(1351.25);
        assert_eq!(
            next_state.cash_balances.get(account_currency), // account_currency is "CAD"
            Some(&expected_cad_cash),
            "Consolidated CAD cash balance mismatch"
        );

        // --- Assert Positions ---
        assert_eq!(next_state.positions.len(), 1, "Should have one position");
        let position_xyz = next_state.positions.get("XYZ").unwrap();
        assert_eq!(position_xyz.quantity, dec!(10));
        assert_eq!(position_xyz.average_cost, dec!(5.1)); // (5*10 + 1) / 10
        assert_eq!(position_xyz.total_cost_basis, dec!(51)); // In USD
        assert_eq!(position_xyz.currency, usd_currency);

        // --- Assert Net Contribution (in Account Currency - CAD) ---
        // Initial: 1000 CAD
        // USD Deposit (gross 100 USD): + (100 USD * 1.25 CAD/USD) = +125 CAD
        // EUR Deposit (gross 200 EUR): + (200 EUR * 1.50 CAD/USD) = +300 CAD
        // Buy/Sell of stock does not affect net contribution.
        let net_contrib_change_usd_deposit = deposit_usd_activity.unit_price * rate_usd_cad;
        let net_contrib_change_eur_deposit = deposit_eur_activity.unit_price * rate_eur_cad;
        let expected_net_contribution = initial_net_contribution 
                                        + net_contrib_change_usd_deposit 
                                        + net_contrib_change_eur_deposit; // 1000 + 125 + 300 = 1425 CAD
        assert_eq!(
            next_state.net_contribution,
            expected_net_contribution,
            "Net contribution mismatch"
        );
        
        // --- Assert Snapshot Cost Basis (in Account Currency - CAD) ---
        // Position "XYZ" cost basis: 51 USD
        // Converted to CAD: 51 USD * 1.25 CAD/USD = 63.75 CAD
        let expected_snapshot_cost_basis = position_xyz.total_cost_basis * rate_usd_cad;
        assert_eq!(
            next_state.cost_basis,
            expected_snapshot_cost_basis,
            "Snapshot cost basis mismatch"
        );
    }
} 