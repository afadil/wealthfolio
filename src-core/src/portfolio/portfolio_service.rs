use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{
    Account, Activity, FinancialHistory, FinancialSnapshot, Holding, IncomeData, IncomeSummary,
    Performance, Quote,
};
use crate::settings::SettingsService;
use chrono::NaiveDateTime;
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};

use chrono::Datelike;
use chrono::{Duration, NaiveDate, Utc};
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;

use crate::portfolio::holdings_service::HoldingsService;
use crate::portfolio::income_service::IncomeService;

pub struct PortfolioService {
    account_service: AccountService,
    activity_service: ActivityService,
    asset_service: AssetService,
    fx_service: CurrencyExchangeService,
    base_currency: String,
    pool: Pool<ConnectionManager<SqliteConnection>>,
    income_service: IncomeService,
    holdings_service: HoldingsService,
}

/// This module contains the implementation of the `PortfolioService` struct.
/// The `PortfolioService` struct provides methods for fetching and aggregating holdings,
/// computing holdings, calculating historical portfolio values, and aggregating account history.
/// It also includes helper methods for converting currency, fetching exchange rates,
/// and getting dates between two given dates.

impl PortfolioService {
    pub fn new(
        pool: Pool<ConnectionManager<SqliteConnection>>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let mut service = PortfolioService {
            account_service: AccountService::new(pool.clone()),
            activity_service: ActivityService::new(pool.clone()),
            asset_service: AssetService::new(pool.clone()),
            fx_service: CurrencyExchangeService::new(pool.clone()),
            base_currency: String::new(),
            pool: pool.clone(),
            income_service: IncomeService::new(
                pool.clone(),
                CurrencyExchangeService::new(pool.clone()),
                String::new(),
            ),
            holdings_service: HoldingsService::new(pool.clone(), String::new()),
        };
        service.initialize()?;
        Ok(service)
    }

    fn initialize(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        let settings_service = SettingsService::new();
        let settings = settings_service.get_settings(&mut conn)?;
        self.base_currency.clone_from(&settings.base_currency);
        self.income_service = IncomeService::new(
            self.pool.clone(),
            CurrencyExchangeService::new(self.pool.clone()),
            self.base_currency.clone(),
        );
        self.holdings_service = HoldingsService::new(self.pool.clone(), self.base_currency.clone());
        Ok(())
    }

    pub fn compute_holdings(&self) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
        self.holdings_service.compute_holdings()
    }

    fn get_dates_between(start: NaiveDate, end: NaiveDate) -> Vec<NaiveDate> {
        let mut dates = Vec::new();
        let mut current = start;

        while current <= end {
            dates.push(current);
            current = current.checked_add_signed(Duration::days(1)).unwrap();
        }

        dates
    }

    fn fetch_data(
        &self,
    ) -> Result<(Vec<Account>, Vec<Activity>, Vec<Quote>), Box<dyn std::error::Error>> {
        let accounts = self.account_service.get_accounts()?;
        let activities = self.activity_service.get_activities()?;
        let market_data = self.asset_service.get_history_quotes()?;

        Ok((accounts, activities, market_data))
    }

    pub fn calculate_historical_portfolio_values(
        &self,
    ) -> Result<Vec<FinancialHistory>, Box<dyn std::error::Error>> {
        let strt_time = std::time::Instant::now();

        let (accounts, activities, market_data) = self.fetch_data()?;

        // Use Rayon's par_iter to process each account in parallel
        let results: Vec<FinancialHistory> = accounts
            .par_iter()
            .filter_map(|account| {
                let account_activities: Vec<_> = activities
                    .iter()
                    .filter(|a| a.account_id == account.id)
                    .cloned()
                    .collect();

                if account_activities.is_empty() {
                    None
                } else {
                    let history =
                        self.calculate_historical_value(&account_activities, &market_data);
                    Some(FinancialHistory {
                        account: account.clone(),
                        history,
                    })
                }
            })
            .collect();

        // Calculate the total value of the portfolio
        let portfolio_total_value = results
            .iter()
            .map(|fh| fh.history.last().map_or(0.0, |s| s.total_value))
            .sum::<f64>();

        // Calculate the percentage of each account
        let mut results_with_percentage = results
            .into_iter()
            .map(|mut fh| {
                let account_total: f64 = fh.history.last().map_or(0.0, |s| s.total_value);
                let percentage = account_total / portfolio_total_value * 100.0;
                if let Some(last_snapshot) = fh.history.last_mut() {
                    last_snapshot.allocation_percentage = Some(percentage);
                }
                fh
            })
            .collect::<Vec<FinancialHistory>>();

        // Aggregate historical data from all accounts
        let mut aggregated_history: HashMap<String, FinancialSnapshot> = HashMap::new();
        for financial_history in &results_with_percentage {
            self.aggregate_account_history(&mut aggregated_history, &financial_history.history);
        }

        let mut total_history: Vec<_> = aggregated_history.into_values().collect();
        total_history.sort_by(|a, b| a.date.cmp(&b.date));

        let total_account = self.create_total_account();
        results_with_percentage.push(FinancialHistory {
            account: total_account,
            history: total_history,
        });

        println!(
            "Calculating historical portfolio values took: {:?}",
            std::time::Instant::now() - strt_time
        );

        Ok(results_with_percentage)
    }

    fn aggregate_account_history(
        &self,
        aggregated_history: &mut HashMap<String, FinancialSnapshot>,
        history: &[FinancialSnapshot],
    ) {
        for snapshot in history {
            let entry = aggregated_history
                .entry(snapshot.date.clone())
                .or_insert_with(|| FinancialSnapshot {
                    date: snapshot.date.clone(),
                    total_value: 0.0,
                    market_value: 0.0,
                    book_cost: 0.0,
                    available_cash: 0.0,
                    net_deposit: 0.0,
                    currency: snapshot.currency.to_string(),
                    base_currency: self.base_currency.to_string(),
                    total_gain_value: 0.0,
                    total_gain_percentage: 0.0,
                    day_gain_percentage: 0.0,
                    day_gain_value: 0.0,
                    allocation_percentage: None,
                    exchange_rate: Some(1.0), // Default exchange rate for base currency
                });

            let exchange_rate = self
                .fx_service
                .get_exchange_rate(&snapshot.currency, &self.base_currency)
                .unwrap_or(1.0);

            // Convert values to base currency before aggregating
            entry.total_value += snapshot.total_value * exchange_rate;
            entry.market_value += snapshot.market_value * exchange_rate;
            entry.book_cost += snapshot.book_cost * exchange_rate;
            entry.available_cash += snapshot.available_cash * exchange_rate;
            entry.net_deposit += snapshot.net_deposit * exchange_rate;
            entry.total_gain_value += snapshot.total_gain_value * exchange_rate;

            // Recalculate percentage values based on aggregated totals
            entry.total_gain_percentage = if entry.book_cost != 0.0 {
                entry.total_gain_value / entry.book_cost * 100.0
            } else {
                0.0
            };

            // Assuming day gain values are already in base currency or need similar conversion
            entry.day_gain_percentage += snapshot.day_gain_percentage;
            entry.day_gain_value += snapshot.day_gain_value * exchange_rate;
        }
    }

    fn create_total_account(&self) -> Account {
        Account {
            id: "TOTAL".to_string(),
            name: "Total".to_string(),
            account_type: "TOTAL".to_string(),
            group: Some("TOTAL".to_string()),
            is_default: true,
            is_active: true,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
            platform_id: None,
            currency: self.base_currency.to_string(),
        }
    }

    fn calculate_historical_value(
        &self,
        activities: &[Activity],
        quotes: &[Quote],
    ) -> Vec<FinancialSnapshot> {
        let first_activity = activities[0].clone();

        let start_date = first_activity.activity_date.date();

        let end_date = Utc::now().naive_utc().date();
        let all_dates = Self::get_dates_between(start_date, end_date);

        let mut currency = self.base_currency.as_str();
        let mut cumulative_cash = 0.0;
        let mut holdings: HashMap<String, f64> = HashMap::new();

        let mut results = Vec::new();
        let mut _initial_investment = 0.0;
        let mut net_deposit = 0.0;
        let mut book_cost = 0.0;

        // HashMap to keep the last available quote for each symbol
        let mut last_available_quotes: HashMap<String, &Quote> = HashMap::new();

        for date in all_dates {
            for activity in activities.iter().filter(|a| a.activity_date.date() == date) {
                currency = activity.currency.as_str();
                let activity_amount = activity.quantity;
                let activity_fee = activity.fee;

                match activity.activity_type.as_str() {
                    "BUY" => {
                        let entry = holdings.entry(activity.asset_id.clone()).or_insert(0.0);
                        *entry += activity_amount;
                        let buy_cost = activity_amount * activity.unit_price + activity_fee;
                        cumulative_cash -= buy_cost;
                        _initial_investment += activity_amount * activity.unit_price;
                        book_cost += buy_cost;
                    }
                    "SELL" => {
                        let entry = holdings.entry(activity.asset_id.clone()).or_insert(0.0);
                        *entry -= activity_amount;
                        let sell_profit = activity_amount * activity.unit_price - activity_fee;
                        cumulative_cash += sell_profit;
                        _initial_investment -= activity_amount * activity.unit_price;
                        book_cost -= activity_amount * activity.unit_price + activity_fee;
                    }
                    "DEPOSIT" | "TRANSFER_IN" | "CONVERSION_IN" => {
                        cumulative_cash += activity_amount * activity.unit_price - activity_fee;
                        net_deposit += activity_amount * activity.unit_price;
                    }
                    "DIVIDEND" | "INTEREST" => {
                        cumulative_cash += activity_amount * activity.unit_price - activity_fee;
                    }
                    "WITHDRAWAL" | "TRANSFER_OUT" | "CONVERSION_OUT" => {
                        cumulative_cash -= activity_amount * activity.unit_price + activity_fee;
                        net_deposit -= activity_amount * activity.unit_price;
                    }
                    "FEE" | "TAX" => {
                        cumulative_cash -= activity_fee;
                    }
                    _ => {}
                }
            }

            let mut holdings_value = 0.0;
            let mut day_gain_value = 0.0;

            // println!("{:?}", &holdings);

            for (symbol, &holding_amount) in &holdings {
                let quote = quotes
                    .iter()
                    .find(|q| q.date.date() == date && q.symbol == *symbol)
                    .or_else(|| last_available_quotes.get(symbol).cloned()) // Copy the reference to the quote
                   ; // Copy the reference to the quote

                if let Some(quote) = quote {
                    let holding_value_for_symbol = holding_amount * quote.close;
                    let daily_change_percent = ((quote.close - quote.open) / quote.open) * 100.0;
                    let day_gain_for_symbol =
                        (daily_change_percent / 100.0) * holding_value_for_symbol;

                    holdings_value += holding_value_for_symbol;
                    day_gain_value += day_gain_for_symbol;

                    // Update the last available quote for the symbol
                    last_available_quotes.insert(symbol.clone(), quote);
                }
            }

            let day_gain_percentage = if holdings_value != 0.0 {
                (day_gain_value / holdings_value) * 100.0
            } else {
                0.0
            };

            let total_value = cumulative_cash + holdings_value;
            let total_gain_value = holdings_value - book_cost;
            let total_gain_percentage = if book_cost != 0.0 {
                (total_gain_value / book_cost) * 100.0
            } else {
                0.0
            };

            let exchange_rate = self
                .fx_service
                .get_exchange_rate(currency, &self.base_currency)
                .unwrap_or(1.0);

            results.push(FinancialSnapshot {
                date: date.format("%Y-%m-%d").to_string(),
                total_value,
                market_value: holdings_value,
                book_cost,
                available_cash: cumulative_cash,
                net_deposit,
                currency: currency.to_string(),
                base_currency: self.base_currency.to_string(),
                total_gain_value: holdings_value - book_cost,
                total_gain_percentage,
                day_gain_percentage,
                day_gain_value,
                allocation_percentage: None, // to Calculate later
                exchange_rate: Some(exchange_rate),
            });
        }

        results
    }

    pub fn get_income_data(&self) -> Result<Vec<IncomeData>, diesel::result::Error> {
        self.income_service.get_income_data()
    }

    pub fn get_income_summary(&self) -> Result<IncomeSummary, diesel::result::Error> {
        self.income_service.get_income_summary()
    }
}
