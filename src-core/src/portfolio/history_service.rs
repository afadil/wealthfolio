use crate::error::{PortfolioError, Result};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{Account, Activity, HistorySummary, PortfolioHistory, Quote};
use chrono::{Duration, NaiveDate, Utc};

use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use rayon::prelude::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct HistoryService {
    fx_service: CurrencyExchangeService,
    base_currency: String,
    pool: Pool<ConnectionManager<SqliteConnection>>,
}

impl HistoryService {
    pub fn new(
        pool: Pool<ConnectionManager<SqliteConnection>>,
        fx_service: CurrencyExchangeService,
        base_currency: String,
    ) -> Self {
        Self {
            fx_service,
            base_currency,
            pool,
        }
    }

    pub fn calculate_historical_data(
        &self,
        accounts: &[Account],
        activities: &[Activity],
        market_data: &[Quote],
    ) -> Result<Vec<HistorySummary>> {
        println!("Starting calculate_historical_data");
        let end_date = Utc::now().naive_utc().date();

        let all_histories = Arc::new(Mutex::new(Vec::new()));
        let total_history = Arc::new(Mutex::new(Vec::new()));

        let mut summaries: Vec<HistorySummary> = accounts
            .par_iter()
            .map(|account| {
                let account_activities: Vec<_> = activities
                    .iter()
                    .filter(|a| a.account_id == account.id)
                    .cloned()
                    .collect();

                if account_activities.is_empty() {
                    println!("No activities for account {}", account.id);
                    return HistorySummary {
                        id: Some(account.id.clone()),
                        start_date: "".to_string(),
                        end_date: "".to_string(),
                        entries_count: 0,
                    };
                }

                let last_date = self.get_last_historical_date(&account.id).unwrap_or(None);

                let account_start_date =
                    last_date.map(|d| d + Duration::days(1)).unwrap_or_else(|| {
                        account_activities
                            .iter()
                            .map(|a| a.activity_date.date())
                            .min()
                            .unwrap_or_else(|| Utc::now().naive_utc().date())
                    });

                let new_history = self.calculate_historical_value(
                    &account.id,
                    &account_activities,
                    market_data,
                    account_start_date,
                    end_date,
                );

                println!(
                    "Calculated {} historical entries for account {}",
                    new_history.len(),
                    account.id
                );

                if !new_history.is_empty() {
                    all_histories.lock().unwrap().push(new_history.clone());
                }

                HistorySummary {
                    id: Some(account.id.clone()),
                    start_date: new_history
                        .first()
                        .map(|h| {
                            NaiveDate::parse_from_str(&h.date, "%Y-%m-%d")
                                .unwrap()
                                .to_string()
                        })
                        .unwrap_or_default(),
                    end_date: new_history
                        .last()
                        .map(|h| {
                            NaiveDate::parse_from_str(&h.date, "%Y-%m-%d")
                                .unwrap()
                                .to_string()
                        })
                        .unwrap_or_default(),
                    entries_count: new_history.len(),
                }
            })
            .collect();

        let account_histories = all_histories.lock().unwrap();

        // Calculate total portfolio history
        *total_history.lock().unwrap() = self.calculate_total_portfolio_history(&account_histories);

        // Save all historical data
        for history in account_histories.iter() {
            if let Err(e) = self.save_historical_data(history) {
                println!("Error saving account history: {:?}", e);
                return Err(e);
            }
        }

        // Save total portfolio history
        println!("Saving total portfolio history");
        if let Err(e) = self.save_historical_data(&total_history.lock().unwrap()) {
            println!("Error saving total portfolio history: {:?}", e);
            return Err(e);
        }

        let total_summary = {
            let total_history_guard = total_history.lock().expect("Failed to lock total_history");
            let parse_date = |h: &PortfolioHistory| -> String {
                NaiveDate::parse_from_str(&h.date, "%Y-%m-%d")
                    .map(|date| date.to_string())
                    .unwrap_or_default()
            };

            HistorySummary {
                id: Some("TOTAL".to_string()),
                start_date: total_history_guard
                    .first()
                    .map(parse_date)
                    .unwrap_or_default(),
                end_date: total_history_guard
                    .last()
                    .map(parse_date)
                    .unwrap_or_default(),
                entries_count: total_history_guard.len(),
            }
        };

        // Add the total summary to the summaries array
        summaries.push(total_summary);
        Ok(summaries)
    }

    fn calculate_historical_value(
        &self,
        account_id: &str,
        activities: &[Activity],
        quotes: &[Quote],
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Vec<PortfolioHistory> {
        let all_dates = Self::get_dates_between(start_date, end_date);

        let mut currency = self.base_currency.as_str();
        let mut cumulative_cash = 0.0;
        let mut holdings: HashMap<String, f64> = HashMap::new();

        let mut results = Vec::new();
        let mut net_deposit = 0.0;
        let mut book_cost = 0.0;

        let mut last_available_quotes: HashMap<String, Quote> = HashMap::new();
        let mut average_purchase_prices: HashMap<String, f64> = HashMap::new();

        for date in all_dates {
            for activity in activities.iter().filter(|a| a.activity_date.date() == date) {
                currency = activity.currency.as_str();
                let activity_amount = activity.quantity * activity.unit_price;
                let activity_fee = activity.fee;

                match activity.activity_type.as_str() {
                    "BUY" => {
                        let entry = holdings.entry(activity.asset_id.clone()).or_insert(0.0);
                        let buy_cost = activity_amount + activity_fee;
                        let new_quantity = *entry + activity.quantity;
                        let avg_price = average_purchase_prices
                            .entry(activity.asset_id.clone())
                            .or_insert(0.0);
                        *avg_price = (*avg_price * *entry + buy_cost) / new_quantity;
                        *entry = new_quantity;
                        cumulative_cash -= buy_cost;
                        book_cost += buy_cost;
                    }
                    "SELL" => {
                        let entry = holdings.entry(activity.asset_id.clone()).or_insert(0.0);
                        let sell_quantity = activity.quantity.min(*entry);
                        let avg_price = *average_purchase_prices
                            .get(&activity.asset_id)
                            .unwrap_or(&0.0);
                        let sell_cost = sell_quantity * avg_price;
                        let sell_profit = activity_amount - activity_fee;
                        *entry -= sell_quantity;
                        cumulative_cash += sell_profit;
                        book_cost -= sell_cost;
                    }
                    "DEPOSIT" | "TRANSFER_IN" | "CONVERSION_IN" => {
                        cumulative_cash += activity_amount - activity_fee;
                        net_deposit += activity_amount - activity_fee;
                    }
                    "DIVIDEND" | "INTEREST" => {
                        cumulative_cash += activity_amount - activity_fee;
                    }
                    "WITHDRAWAL" | "TRANSFER_OUT" | "CONVERSION_OUT" => {
                        cumulative_cash -= activity_amount + activity_fee;
                        net_deposit -= activity_amount + activity_fee;
                    }
                    "FEE" | "TAX" => {
                        cumulative_cash -= activity_fee;
                    }
                    _ => {}
                }
            }

            let (holdings_value, day_gain_value) =
                self.calculate_holdings_value(&holdings, quotes, date, &mut last_available_quotes);

            let day_gain_percentage = if holdings_value != 0.0 {
                (day_gain_value / holdings_value) * 100.0
            } else {
                0.0
            };

            let total_value = cumulative_cash + holdings_value;
            let total_gain_value = total_value - book_cost;
            let total_gain_percentage = if book_cost != 0.0 {
                (total_gain_value / book_cost) * 100.0
            } else {
                0.0
            };

            let exchange_rate = self
                .fx_service
                .get_exchange_rate(currency, &self.base_currency)
                .unwrap_or(1.0);

            results.push(PortfolioHistory {
                id: Uuid::new_v4().to_string(),
                account_id: account_id.to_string(),
                date: date.format("%Y-%m-%d").to_string(),
                total_value,
                market_value: holdings_value,
                book_cost,
                available_cash: cumulative_cash,
                net_deposit,
                currency: currency.to_string(),
                base_currency: self.base_currency.to_string(),
                total_gain_value,
                total_gain_percentage,
                day_gain_percentage,
                day_gain_value,
                allocation_percentage: 0.0, // to Calculate later
                exchange_rate,
            });
        }

        results
    }

    fn calculate_total_portfolio_history(
        &self,
        account_histories: &[Vec<PortfolioHistory>],
    ) -> Vec<PortfolioHistory> {
        let mut total_history = HashMap::new();

        for history in account_histories {
            for snapshot in history {
                let entry = total_history
                    .entry(snapshot.date.clone())
                    .or_insert_with(|| PortfolioHistory {
                        id: Uuid::new_v4().to_string(), // Generate a new UUID for each day
                        account_id: "TOTAL".to_string(),
                        date: snapshot.date.clone(),
                        total_value: 0.0,
                        market_value: 0.0,
                        book_cost: 0.0,
                        available_cash: 0.0,
                        net_deposit: 0.0,
                        currency: self.base_currency.clone(),
                        base_currency: self.base_currency.clone(),
                        total_gain_value: 0.0,
                        total_gain_percentage: 0.0,
                        day_gain_percentage: 0.0,
                        day_gain_value: 0.0,
                        allocation_percentage: 0.0,
                        exchange_rate: 1.0,
                    });

                let exchange_rate = self
                    .fx_service
                    .get_exchange_rate(&snapshot.currency, &self.base_currency)
                    .unwrap_or(1.0);

                entry.total_value += snapshot.total_value * exchange_rate;
                entry.market_value += snapshot.market_value * exchange_rate;
                entry.book_cost += snapshot.book_cost * exchange_rate;
                entry.available_cash += snapshot.available_cash * exchange_rate;
                entry.net_deposit += snapshot.net_deposit * exchange_rate;
                entry.day_gain_value += snapshot.day_gain_value * exchange_rate;
            }
        }

        let mut total_history: Vec<_> = total_history.into_values().collect();
        total_history.sort_by(|a, b| a.date.cmp(&b.date));

        // Recalculate percentages for total portfolio
        for record in &mut total_history {
            record.total_gain_value = record.total_value - record.book_cost;
            record.total_gain_percentage = if record.book_cost != 0.0 {
                (record.total_gain_value / record.book_cost) * 100.0
            } else {
                0.0
            };
            record.day_gain_percentage = if record.market_value != 0.0 {
                (record.day_gain_value / record.market_value) * 100.0
            } else {
                0.0
            };
        }

        total_history
    }

    fn save_historical_data(&self, history_data: &[PortfolioHistory]) -> Result<()> {
        use crate::schema::portfolio_history::dsl::*;
        let conn = &mut self.pool.get().unwrap();

        let values: Vec<_> = history_data
            .iter()
            .map(|record| {
                (
                    id.eq(&record.id),
                    account_id.eq(&record.account_id),
                    date.eq(&record.date),
                    total_value.eq(record.total_value),
                    market_value.eq(record.market_value),
                    book_cost.eq(record.book_cost),
                    available_cash.eq(record.available_cash),
                    net_deposit.eq(record.net_deposit),
                    currency.eq(&record.currency),
                    base_currency.eq(&record.base_currency),
                    total_gain_value.eq(record.total_gain_value),
                    total_gain_percentage.eq(record.total_gain_percentage),
                    day_gain_percentage.eq(record.day_gain_percentage),
                    day_gain_value.eq(record.day_gain_value),
                    allocation_percentage.eq(record.allocation_percentage),
                    exchange_rate.eq(record.exchange_rate),
                )
            })
            .collect();

        diesel::replace_into(portfolio_history)
            .values(&values)
            .execute(conn)?;

        Ok(())
    }

    fn calculate_holdings_value(
        &self,
        holdings: &HashMap<String, f64>,
        quotes: &[Quote],
        date: NaiveDate,
        last_available_quotes: &mut HashMap<String, Quote>,
    ) -> (f64, f64) {
        let mut holdings_value = 0.0;
        let mut day_gain_value = 0.0;

        for (symbol, &holding_amount) in holdings {
            let quote = quotes
                .iter()
                .find(|q| q.date.date() == date && q.symbol == *symbol)
                .or_else(|| last_available_quotes.get(symbol))
                .cloned();

            if let Some(quote) = quote {
                let holding_value_for_symbol = holding_amount * quote.close;
                let daily_change_percent = ((quote.close - quote.open) / quote.open) * 100.0;
                let day_gain_for_symbol = (daily_change_percent / 100.0) * holding_value_for_symbol;

                holdings_value += holding_value_for_symbol;
                day_gain_value += day_gain_for_symbol;

                // Update the last available quote for the symbol
                last_available_quotes.insert(symbol.clone(), quote);
            }
        }

        (holdings_value, day_gain_value)
    }

    fn get_last_historical_date(&self, input_account_id: &str) -> Result<Option<NaiveDate>> {
        use crate::schema::portfolio_history::dsl::*;
        let conn = &mut self.pool.get().unwrap();

        portfolio_history
            .filter(account_id.eq(input_account_id))
            .select(date)
            .order(date.desc())
            .first::<String>(conn)
            .optional()
            .map(|opt_date_str| {
                opt_date_str
                    .and_then(|date_str| NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").ok())
            })
            .map_err(PortfolioError::DatabaseError)
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

    pub fn get_account_history(&self, input_account_id: &str) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;
        use diesel::prelude::*;

        let conn = &mut self.pool.get().unwrap();

        let history_data: Vec<PortfolioHistory> = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.asc())
            .load::<PortfolioHistory>(conn)?;

        Ok(history_data)
    }

    pub fn get_latest_account_history(&self, input_account_id: &str) -> Result<PortfolioHistory> {
        use crate::schema::portfolio_history::dsl::*;
        use diesel::prelude::*;

        let conn = &mut self.pool.get().unwrap();

        let latest_history: PortfolioHistory = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.desc())
            .first(conn)
            .map_err(|e| PortfolioError::DatabaseError(e))?;

        Ok(latest_history)
    }
}
