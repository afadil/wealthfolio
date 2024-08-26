use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
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
use diesel::SqliteConnection;

pub struct PortfolioService {
    account_service: AccountService,
    activity_service: ActivityService,
    asset_service: AssetService,
    base_currency: String,
    exchange_rates: HashMap<String, f64>,
}

/// This module contains the implementation of the `PortfolioService` struct.
/// The `PortfolioService` struct provides methods for fetching and aggregating holdings,
/// computing holdings, calculating historical portfolio values, and aggregating account history.
/// It also includes helper methods for converting currency, fetching exchange rates,
/// and getting dates between two given dates.

impl PortfolioService {
    pub fn new(conn: &mut SqliteConnection) -> Result<Self, Box<dyn std::error::Error>> {
        let mut service = PortfolioService {
            account_service: AccountService::new(),
            activity_service: ActivityService::new(),
            asset_service: AssetService::new(),
            base_currency: String::new(),
            exchange_rates: HashMap::new(),
        };
        service.initialize(conn)?;
        Ok(service)
    }

    fn initialize(
        &mut self,
        conn: &mut SqliteConnection,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let settings_service = SettingsService::new();
        let settings = settings_service.get_settings(conn)?;
        self.base_currency = settings.base_currency.clone();
        self.exchange_rates = self
            .asset_service
            .load_exchange_rates(conn, &settings.base_currency)?;
        Ok(())
    }

    fn convert_to_base_currency(&self, amount: f64, currency: &str) -> f64 {
        if currency == self.base_currency {
            amount
        } else {
            let rate = self.get_exchange_rate(currency);
            amount * rate
        }
    }

    fn get_exchange_rate(&self, currency: &str) -> f64 {
        if currency == self.base_currency {
            1.0
        } else {
            let currency_key = format!("{}{}=X", self.base_currency, currency);
            1.0 / *self
                .exchange_rates
                .get(&currency_key.to_string())
                .unwrap_or(&1.0)
        }
    }

    pub async fn compute_holdings(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
        let mut holdings: HashMap<String, Holding> = HashMap::new();
        let accounts = self.account_service.get_accounts(conn)?;
        let activities = self.activity_service.get_trading_activities(conn)?;
        let assets = self.asset_service.get_assets(conn)?;

        for activity in activities {
            //find asset by id
            let asset = match assets.iter().find(|a| a.id == activity.asset_id) {
                Some(found_asset) => found_asset,
                None => {
                    println!("Asset not found for id: {}", activity.asset_id);
                    continue; // Skip this iteration if the asset is not found
                }
            };

            //find account by id
            let account = accounts
                .iter()
                .find(|a| a.id == activity.account_id)
                .unwrap();

            let key = format!("{}-{}", activity.account_id, activity.asset_id);
            let holding = holdings.entry(key.clone()).or_insert_with(|| Holding {
                id: key,
                symbol: activity.asset_id.clone(),
                symbol_name: asset.name.clone(),
                holding_type: asset.asset_type.clone().unwrap_or_default(),
                quantity: 0.0,
                currency: activity.currency.clone(),
                base_currency: "CAD".to_string(),
                market_price: None,          // You need to provide market price
                average_cost: None,          // Will be calculated
                market_value: 0.0,           // Will be calculated
                book_value: 0.0,             // Will be calculated
                market_value_converted: 0.0, // Will be calculated
                book_value_converted: 0.0,   // Will be calculated
                performance: Performance {
                    total_gain_percent: 0.0,
                    total_gain_amount: 0.0,
                    total_gain_amount_converted: 0.0,
                    day_gain_percent: Some(0.0),
                    day_gain_amount: Some(0.0),
                    day_gain_amount_converted: Some(0.0),
                },
                account: Some(account.clone()),
                asset_class: asset.asset_class.clone(),
                asset_sub_class: asset.asset_sub_class.clone(),
                sectors: asset
                    .sectors
                    .clone()
                    .map(|s| serde_json::from_str(&s).unwrap_or_default()),
            });

            match activity.activity_type.as_str() {
                "BUY" => {
                    holding.quantity += activity.quantity;
                    holding.book_value += activity.quantity * activity.unit_price + activity.fee;
                }
                "SELL" => {
                    holding.quantity -= activity.quantity;
                    holding.book_value -= activity.quantity * activity.unit_price + activity.fee;
                }
                "SPLIT" => {
                    // TODO:: Handle the split logic here
                }
                _ => {}
            }
        }

        // Collect all unique symbols from holdings
        let unique_symbols: HashSet<String> = holdings
            .values()
            .map(|holding| holding.symbol.clone())
            .collect();

        let symbols: Vec<String> = unique_symbols.into_iter().collect();

        // Fetch quotes for each symbol asynchronously
        let mut quotes = HashMap::new();
        for symbol in symbols {
            match self.asset_service.get_latest_quote(conn, &symbol) {
                Ok(quote) => {
                    quotes.insert(symbol, quote);
                }
                Err(e) => {
                    println!("Error fetching quote for symbol {}: {}", symbol, e);
                    // Handle the error as per your logic, e.g., continue, return an error, etc.
                }
            }
        }

        // Post-processing for each holding
        for holding in holdings.values_mut() {
            if let Some(quote) = quotes.get(&holding.symbol) {
                //prinln!("Quote: {:?}", quote);
                holding.market_price = Some(quote.close); // Assuming you want to use the 'close' value as market price
            }
            holding.average_cost = Some(holding.book_value / holding.quantity);
            holding.market_value = holding.quantity * holding.market_price.unwrap_or(0.0);
            holding.market_value_converted =
                self.convert_to_base_currency(holding.market_value, &holding.currency);
            holding.book_value_converted =
                self.convert_to_base_currency(holding.book_value, &holding.currency);

            // Calculate performance metrics
            holding.performance.total_gain_amount = holding.market_value - holding.book_value;
            holding.performance.total_gain_percent = if holding.book_value != 0.0 {
                holding.performance.total_gain_amount / holding.book_value * 100.0
            } else {
                0.0
            };
            holding.performance.total_gain_amount_converted = self
                .convert_to_base_currency(holding.performance.total_gain_amount, &holding.currency);
        }

        holdings
            .into_values()
            .filter(|holding| holding.quantity > 0.0)
            .map(Ok)
            .collect::<Result<Vec<_>, _>>()
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
        conn: &mut SqliteConnection,
    ) -> Result<(Vec<Account>, Vec<Activity>, Vec<Quote>), Box<dyn std::error::Error>> {
        let accounts = self.account_service.get_accounts(conn)?;
        let activities = self.activity_service.get_activities(conn)?;
        let market_data = self.asset_service.get_history_quotes(conn)?;
        //let assets = self.asset_service.get_assets(conn)?;

        Ok((accounts, activities, market_data))
    }

    pub async fn calculate_historical_portfolio_values(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<FinancialHistory>, Box<dyn std::error::Error>> {
        let strt_time = std::time::Instant::now();

        let (accounts, activities, market_data) = self.fetch_data(conn)?;

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

            let exchange_rate = snapshot.exchange_rate.unwrap_or(1.0);

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
                        cumulative_cash -= activity_amount + activity_fee;
                        net_deposit -= activity_amount;
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

            let exchange_rate = self.get_exchange_rate(currency);

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

    pub fn get_income_data(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<IncomeData>, diesel::result::Error> {
        use crate::schema::activities;
        use diesel::prelude::*;

        activities::table
            .filter(activities::activity_type.eq_any(vec!["DIVIDEND", "INTEREST"]))
            .select((
                activities::activity_date,
                activities::activity_type,
                activities::asset_id,
                activities::quantity * activities::unit_price,
                activities::currency,
            ))
            .load::<(NaiveDateTime, String, String, f64, String)>(conn)
            .map(|results| {
                results
                    .into_iter()
                    .map(|(date, income_type, symbol, amount, currency)| IncomeData {
                        date,
                        income_type,
                        symbol,
                        amount,
                        currency,
                    })
                    .collect()
            })
    }

    pub fn get_income_summary(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<IncomeSummary, diesel::result::Error> {
        let income_data = self.get_income_data(conn)?;

        let mut by_month: HashMap<String, f64> = HashMap::new();
        let mut by_type: HashMap<String, f64> = HashMap::new();
        let mut by_symbol: HashMap<String, f64> = HashMap::new();
        let mut total_income = 0.0;
        let mut total_income_ytd = 0.0;

        let current_year = chrono::Local::now().year();

        for data in income_data {
            let month = data.date.format("%Y-%m").to_string();
            let converted_amount = self.convert_to_base_currency(data.amount, &data.currency);

            *by_month.entry(month).or_insert(0.0) += converted_amount;
            *by_type.entry(data.income_type).or_insert(0.0) += converted_amount;
            *by_symbol.entry(data.symbol).or_insert(0.0) += converted_amount;
            total_income += converted_amount;

            if data.date.year() == current_year {
                total_income_ytd += converted_amount;
            }
        }

        Ok(IncomeSummary {
            by_month,
            by_type,
            by_symbol,
            total_income,
            total_income_ytd,
            currency: self.base_currency.clone(),
        })
    }
}
