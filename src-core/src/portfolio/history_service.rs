use crate::error::{PortfolioError, Result};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::market_data::market_data_service::MarketDataService;
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
    pool: Pool<ConnectionManager<SqliteConnection>>,
    base_currency: String,
    market_data_service: MarketDataService,
    fx_service: CurrencyExchangeService,
}

impl HistoryService {
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>, base_currency: String) -> Self {
        Self {
            pool: pool.clone(),
            base_currency,
            market_data_service: MarketDataService::new(pool.clone()),
            fx_service: CurrencyExchangeService::new(pool.clone()),
        }
    }

    pub fn get_account_history(&self, input_account_id: &str) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;
        use diesel::prelude::*;

        let conn = &mut self.pool.get().map_err(PortfolioError::from)?;

        let history_data: Vec<PortfolioHistory> = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.asc())
            .load::<PortfolioHistory>(conn)?;

        Ok(history_data)
    }

    pub fn get_latest_account_history(&self, input_account_id: &str) -> Result<PortfolioHistory> {
        use crate::schema::portfolio_history::dsl::*;
        use diesel::prelude::*;

        let conn = &mut self.pool.get().map_err(PortfolioError::from)?;

        let latest_history: PortfolioHistory = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.desc())
            .first(conn)
            .map_err(|e| PortfolioError::DatabaseError(e))?;

        Ok(latest_history)
    }

    pub fn calculate_historical_data(
        &self,
        accounts: &[Account],
        activities: &[Activity],
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>> {
        let end_date = Utc::now().naive_utc().date();

        let all_histories = Arc::new(Mutex::new(Vec::new()));
        let total_history = Arc::new(Mutex::new(Vec::new()));

        let quotes = self.market_data_service.load_quotes();

        let mut summaries: Vec<HistorySummary> = accounts
            .par_iter()
            .map(|account| {
                let account_activities: Vec<_> = activities
                    .iter()
                    .filter(|a| a.account_id == account.id)
                    .cloned()
                    .collect();

                if account_activities.is_empty() {
                    return HistorySummary {
                        id: Some(account.id.clone()),
                        start_date: "".to_string(),
                        end_date: "".to_string(),
                        entries_count: 0,
                    };
                }

                let account_start_date = if force_full_calculation {
                    account_activities
                        .iter()
                        .map(|a| a.activity_date.date())
                        .min()
                        .unwrap_or_else(|| Utc::now().naive_utc().date())
                } else {
                    self.get_last_historical_date(&account.id)
                        .unwrap_or(None)
                        .map(|d| d - Duration::days(2))
                        .unwrap_or_else(|| {
                            account_activities
                                .iter()
                                .map(|a| a.activity_date.date())
                                .min()
                                .unwrap_or_else(|| Utc::now().naive_utc().date())
                        })
                };

                let new_history = self.calculate_historical_value(
                    &account.id,
                    &account_activities,
                    &quotes,
                    account_start_date,
                    end_date,
                    force_full_calculation,
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

        // Calculate total portfolio history for all accounts
        *total_history.lock().unwrap() =
            self.calculate_total_portfolio_history_for_all_accounts()?;

        // Save all historical data
        for history in account_histories.iter() {
            if let Err(e) = self.save_historical_data(history) {
                println!("Error saving account history: {:?}", e);
                return Err(e);
            }
        }

        // Save total portfolio history
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

    // New method to calculate total portfolio history for all accounts
    fn calculate_total_portfolio_history_for_all_accounts(&self) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::accounts::dsl as accounts_dsl;
        use crate::schema::portfolio_history::dsl::*;
        let conn = &mut self.pool.get().map_err(PortfolioError::from)?;

        println!("Calculating total portfolio history for all accounts");

        // Get active account IDs
        let active_account_ids: Vec<String> = accounts_dsl::accounts
            .filter(accounts_dsl::is_active.eq(true))
            .select(accounts_dsl::id)
            .load::<String>(conn)?;

        let all_histories: Vec<PortfolioHistory> = portfolio_history
            .filter(account_id.ne("TOTAL"))
            .filter(account_id.eq_any(active_account_ids))
            .order(date.asc())
            .load::<PortfolioHistory>(conn)?;

        let grouped_histories: HashMap<String, Vec<PortfolioHistory>> = all_histories
            .into_iter()
            .fold(HashMap::new(), |mut acc, history| {
                acc.entry(history.date.clone()).or_default().push(history);
                acc
            });

        let mut total_history: Vec<PortfolioHistory> = grouped_histories
            .into_iter()
            .map(|(history_date, histories)| {
                let mut total = PortfolioHistory {
                    id: Uuid::new_v4().to_string(),
                    account_id: "TOTAL".to_string(),
                    date: history_date,
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
                    allocation_percentage: 100.0,
                    exchange_rate: 1.0,
                    holdings: Some("{}".to_string()),
                };

                for history in histories {
                    let currency_exchange_rate = self
                        .fx_service
                        .get_exchange_rate(&history.currency, &self.base_currency)
                        .unwrap_or(1.0);

                    total.total_value += history.total_value * currency_exchange_rate;
                    total.market_value += history.market_value * currency_exchange_rate;
                    total.book_cost += history.book_cost * currency_exchange_rate;
                    total.available_cash += history.available_cash * currency_exchange_rate;
                    total.net_deposit += history.net_deposit * currency_exchange_rate;
                    total.day_gain_value += history.day_gain_value * currency_exchange_rate;
                }

                // Recalculate percentages
                total.total_gain_value = total.total_value - total.net_deposit;
                total.total_gain_percentage = if total.net_deposit != 0.0 {
                    (total.total_gain_value / total.net_deposit) * 100.0
                } else {
                    0.0
                };
                total.day_gain_percentage = if total.market_value != 0.0 {
                    (total.day_gain_value / total.market_value) * 100.0
                } else {
                    0.0
                };

                total
            })
            .collect();

        total_history.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(total_history)
    }

    fn calculate_historical_value(
        &self,
        account_id: &str,
        activities: &[Activity],
        quotes: &HashMap<(String, NaiveDate), Quote>,
        start_date: NaiveDate,
        end_date: NaiveDate,
        force_full_calculation: bool,
    ) -> Vec<PortfolioHistory> {
        println!(
            "Calculating historical value for account: {} from {} to {} with force {}",
            account_id, start_date, end_date, force_full_calculation
        );
        let last_history = if force_full_calculation {
            None
        } else {
            self.get_last_portfolio_history(account_id).unwrap_or(None)
        };

        // Initialize values from the last PortfolioHistory or use default values
        let mut currency = last_history
            .as_ref()
            .map_or(self.base_currency.as_str(), |h| &h.currency);
        let mut cumulative_cash = last_history.as_ref().map_or(0.0, |h| h.available_cash);
        let mut net_deposit = last_history.as_ref().map_or(0.0, |h| h.net_deposit);
        let mut book_cost = last_history.as_ref().map_or(0.0, |h| h.book_cost);

        // Initialize holdings based on the last history or use an empty HashMap
        let mut holdings: HashMap<String, f64> = last_history
            .as_ref()
            .and_then(|h| h.holdings.as_ref())
            .and_then(|json_str| serde_json::from_str(json_str).ok())
            .unwrap_or_default();

        // If there's a last history entry and we're not forcing full calculation, start from the day after
        let actual_start_date = if force_full_calculation {
            start_date
        } else {
            last_history
                .as_ref()
                .map(|h| {
                    NaiveDate::parse_from_str(&h.date, "%Y-%m-%d").unwrap() + Duration::days(1)
                })
                .unwrap_or(start_date)
        };

        let all_dates = Self::get_dates_between(actual_start_date, end_date);

        // Load all quotes for the date range and assets

        let mut results = Vec::new();

        for date in all_dates {
            // Process activities for the current date
            for activity in activities.iter().filter(|a| a.activity_date.date() == date) {
                currency = &activity.currency;
                let activity_amount = activity.quantity * activity.unit_price;
                let activity_fee = activity.fee;

                match activity.activity_type.as_str() {
                    "BUY" => {
                        let buy_cost = activity_amount + activity_fee;
                        cumulative_cash -= buy_cost;
                        book_cost += buy_cost;
                        *holdings.entry(activity.asset_id.clone()).or_insert(0.0) +=
                            activity.quantity;
                    }
                    "SELL" => {
                        let sell_profit = activity_amount - activity_fee;
                        cumulative_cash += sell_profit;
                        book_cost -= activity_amount + activity_fee;
                        *holdings.entry(activity.asset_id.clone()).or_insert(0.0) -=
                            activity.quantity;
                    }
                    "DEPOSIT" | "TRANSFER_IN" | "CONVERSION_IN" => {
                        cumulative_cash += activity_amount - activity_fee;
                        net_deposit += activity_amount;
                    }
                    "DIVIDEND" | "INTEREST" => {
                        cumulative_cash += activity_amount - activity_fee;
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

            // Update market value based on quotes
            let (updated_market_value, day_gain_value, opening_market_value) =
                self.calculate_holdings_value(&holdings, &quotes, date);

            let market_value = updated_market_value;
            let total_value = cumulative_cash + market_value;

            let day_gain_percentage = if opening_market_value != 0.0 {
                (day_gain_value / opening_market_value) * 100.0
            } else {
                0.0
            };

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
                market_value,
                book_cost,
                available_cash: cumulative_cash,
                net_deposit,
                currency: currency.to_string(),
                base_currency: self.base_currency.to_string(),
                total_gain_value,
                total_gain_percentage,
                day_gain_percentage,
                day_gain_value,
                allocation_percentage: 0.0, // This will be calculated later in calculate_total_portfolio_history
                exchange_rate,
                holdings: Some(serde_json::to_string(&holdings).unwrap_or_default()),
            });
        }

        results
    }

    fn save_historical_data(&self, history_data: &[PortfolioHistory]) -> Result<()> {
        use crate::schema::portfolio_history::dsl::*;
        let conn = &mut self.pool.get().map_err(PortfolioError::from)?; // Use the From trait to convert r2d2::Error to PortfolioError

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
                    holdings.eq(&record.holdings),
                )
            })
            .collect();

        diesel::replace_into(portfolio_history)
            .values(&values)
            .execute(conn)
            .map_err(PortfolioError::from)?; // Use the From trait to convert diesel::result::Error to PortfolioError

        Ok(())
    }

    fn calculate_holdings_value(
        &self,
        holdings: &HashMap<String, f64>,
        quotes: &HashMap<(String, NaiveDate), Quote>,
        date: NaiveDate,
    ) -> (f64, f64, f64) {
        let mut holdings_value = 0.0;
        let mut day_gain_value = 0.0;
        let mut opening_market_value = 0.0;

        for (asset_id, &quantity) in holdings {
            let quote = self.get_latest_available_quote(quotes, asset_id, date);

            if let Some(quote) = quote {
                let holding_value = quantity * quote.close;
                let opening_value = quantity * quote.open;
                let day_gain = quantity * (quote.close - quote.open);

                holdings_value += holding_value;
                day_gain_value += day_gain;
                opening_market_value += opening_value;
            } else {
                println!(
                    "No quote available for symbol {} on or before date {}",
                    asset_id, date
                );
            }
        }

        (holdings_value, day_gain_value, opening_market_value)
    }

    fn get_latest_available_quote<'a>(
        &self,
        quotes: &'a HashMap<(String, NaiveDate), Quote>,
        asset_id: &str,
        date: NaiveDate,
    ) -> Option<&'a Quote> {
        // First, check for an exact date match
        if let Some(quote) = quotes.get(&(asset_id.to_string(), date)) {
            return Some(quote);
        }

        // If no exact match, search for the latest quote in previous dates
        let found_quote = (1..=30) // Search up to 30 days back
            .find_map(|days_back| {
                let search_date = date - Duration::days(days_back);
                quotes.get(&(asset_id.to_string(), search_date))
            });
        found_quote
    }

    fn get_last_portfolio_history(
        &self,
        some_account_id: &str,
    ) -> Result<Option<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;

        let conn = &mut self.pool.get().map_err(PortfolioError::from)?;
        let last_history_opt = portfolio_history
            .filter(account_id.eq(some_account_id))
            .order(date.desc())
            .first::<PortfolioHistory>(conn)
            .optional()
            .map_err(PortfolioError::from)?;

        if let Some(last_history) = last_history_opt {
            Ok(Some(last_history))
        } else {
            Ok(None)
        }
    }

    fn get_dates_between(start_date: NaiveDate, end_date: NaiveDate) -> Vec<NaiveDate> {
        (0..=(end_date - start_date).num_days())
            .map(|days| start_date + Duration::days(days))
            .collect()
    }

    fn get_last_historical_date(&self, some_account_id: &str) -> Result<Option<NaiveDate>> {
        use crate::schema::portfolio_history::dsl::*;
        let conn = &mut self.pool.get().map_err(PortfolioError::from)?; // Use the From trait to convert r2d2::Error to PortfolioError

        let last_date_opt = portfolio_history
            .filter(account_id.eq(some_account_id))
            .select(date)
            .order(date.desc())
            .first::<String>(conn)
            .optional()
            .map_err(PortfolioError::from)?; // Use the From trait to convert diesel::result::Error to PortfolioError

        if let Some(last_date_str) = last_date_opt {
            NaiveDate::parse_from_str(&last_date_str, "%Y-%m-%d")
                .map(Some)
                .map_err(|_| PortfolioError::ParseError("Invalid date format".to_string()))
        } else {
            Ok(None)
        }
    }
}
