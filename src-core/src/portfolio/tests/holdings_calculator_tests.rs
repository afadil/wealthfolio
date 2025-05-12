// Test cases for HoldingsCalculator will go here.
#[cfg(test)]
mod tests {
    use crate::activities::{Activity, ActivityType, NewActivity};
    use crate::errors::FxError;
    use crate::fx::fx_traits::FxServiceTrait;
    use crate::portfolio::snapshot::holdings_calculator::HoldingsCalculator;
    use crate::portfolio::snapshot::{AccountStateSnapshot, Position};
    use chrono::{NaiveDate, Utc, NaiveDateTime, TimeZone, DateTime};
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::HashMap;
    use std::str::FromStr;
    use std::sync::Arc;
    use async_trait::async_trait;

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

        #[allow(dead_code)] // Potentially used in other tests
        fn add_rate(&mut self, from: &str, to: &str, date: NaiveDate, rate: Decimal) {
            self.conversion_rates.insert((from.to_string(), to.to_string(), date), rate);
            self.conversion_rates.insert((to.to_string(), from.to_string(), date), dec!(1) / rate); // Add inverse rate
        }
        
        #[allow(dead_code)]
        fn set_fail_on_purpose(&mut self, fail: bool) {
            self.fail_on_purpose = fail;
        }
    }

    #[async_trait]
    impl FxServiceTrait for MockFxService {
        async fn initialize(&self) -> Result<(), FxError> {
            unimplemented!("MockFxService::initialize")
        }
        async fn add_exchange_rate(&self, _from_currency: &str, _to_currency: &str, _date: NaiveDate, _rate: Decimal) -> Result<(), FxError> {
            unimplemented!("MockFxService::add_exchange_rate")
        }
        async fn get_historical_rates(&self, _from_currency: &str, _to_currency: &str, _start_date: NaiveDate, _end_date: NaiveDate) -> Result<HashMap<NaiveDate, Decimal>, FxError> {
            unimplemented!("MockFxService::get_historical_rates")
        }
        async fn update_exchange_rate(&self, _from_currency: &str, _to_currency: &str, _date: NaiveDate, _new_rate: Decimal) -> Result<(), FxError> {
            unimplemented!("MockFxService::update_exchange_rate")
        }
        async fn get_latest_exchange_rate(&self, _from_currency: &str, _to_currency: &str) -> Result<(NaiveDate, Decimal), FxError> {
            unimplemented!("MockFxService::get_latest_exchange_rate")
        }
        async fn get_exchange_rate_for_date(&self, _from_currency: &str, _to_currency: &str, _date: NaiveDate) -> Result<Decimal, FxError> {
            unimplemented!("MockFxService::get_exchange_rate_for_date")
        }
        async fn convert_currency(&self, _amount: Decimal, _from_currency: &str, _to_currency: &str, _date: NaiveDate) -> Result<Decimal, FxError> {
            unimplemented!("MockFxService::convert_currency") // This one might be used, but convert_currency_for_date is sync
        }

        // This is the one actually used by HoldingsCalculator and is synchronous
        fn convert_currency_for_date(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
            date: NaiveDate,
        ) -> Result<Decimal, FxError> {
            if self.fail_on_purpose {
                return Err(FxError::RateNotFound(format!(
                    "Intentional failure for {}->{} on {}",
                    from_currency, to_currency, date
                )));
            }
            if from_currency == to_currency {
                return Ok(amount);
            }
            match self
                .conversion_rates
                .get(&(from_currency.to_string(), to_currency.to_string(), date))
            {
                Some(rate) => Ok(amount * rate),
                None => Err(FxError::RateNotFound(format!(
                    "Mock rate not found for {}->{} on {}",
                    from_currency, to_currency, date
                ))),
            }
        }
        async fn get_exchange_rates(&self, _date: NaiveDate, _base_currency: &str) -> Result<HashMap<String, Decimal>, FxError> {
            unimplemented!("MockFxService::get_exchange_rates")
        }
        async fn delete_exchange_rate(&self, _from_currency: &str, _to_currency: &str, _date: NaiveDate) -> Result<(), FxError> {
            unimplemented!("MockFxService::delete_exchange_rate")
        }
        async fn register_currency_pair(&self, _base_currency: &str, _quote_currency: &str) -> Result<(), FxError> {
            unimplemented!("MockFxService::register_currency_pair")
        }
         async fn register_currency_pair_manual(&self, _base_currency: &str, _quote_currency: &str, _rate: Decimal, _date: NaiveDate) -> Result<(), FxError> {
            unimplemented!("MockFxService::register_currency_pair_manual")
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
            created_at: Utc::now().naive_utc(), 
            updated_at: Utc::now().naive_utc(),
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
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
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
            market_value: Decimal::ZERO,
            net_contribution: Decimal::ZERO,
            day_gain_total: Decimal::ZERO,
            day_gain_percent: Decimal::ZERO,
            total_gain: Decimal::ZERO,
            total_gain_percent: Decimal::ZERO,
            unrealized_gain: Decimal::ZERO,
            realized_gain: Decimal::ZERO,
            dividends_income: Decimal::ZERO,
            interest_income: Decimal::ZERO,
            fees_paid: Decimal::ZERO,
            fx_gain: Decimal::ZERO,
            other_income: Decimal::ZERO,
            other_expenses: Decimal::ZERO,
            cost_basis_base: Decimal::ZERO,
            market_value_base: Decimal::ZERO,
            day_gain_total_base: Decimal::ZERO,
            total_gain_base: Decimal::ZERO,
            net_contribution_base: Decimal::ZERO,
            unrealized_gain_base: Decimal::ZERO,
            realized_gain_base: Decimal::ZERO,
            dividends_income_base: Decimal::ZERO,
            interest_income_base: Decimal::ZERO,
            fees_paid_base: Decimal::ZERO,
            fx_gain_base: Decimal::ZERO,
            other_income_base: Decimal::ZERO,
            other_expenses_base: Decimal::ZERO,
            performance_twr: Decimal::ZERO,
            performance_mwr: Decimal::ZERO,
            errors: Vec::new(),
            warnings: Vec::new(),
            metadata: HashMap::new(),
        }
    }

    // --- Tests ---
    #[test]
    fn test_buy_activity_updates_holdings_and_cash() {
        let mock_fx_service = Arc::new(MockFxService::new());
        let calculator = HoldingsCalculator::new(mock_fx_service.clone());

        let account_currency = "USD";
        let activity_currency = "USD";
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
        assert_eq!(position.average_cost_basis, dec!(150)); 
        assert_eq!(position.total_cost_basis, dec!(1500)); 
        assert_eq!(position.currency, activity_currency);

        // Check cash balance (in account currency)
        let expected_cash = dec!(0) - (buy_activity.quantity * buy_activity.unit_price + buy_activity.fee);
        assert_eq!(next_state.cash_balances.get(account_currency), Some(&expected_cash));
        
        assert_eq!(next_state.cost_basis, dec!(1500));
        assert_eq!(next_state.net_contribution, dec!(0)); 
    }
} 