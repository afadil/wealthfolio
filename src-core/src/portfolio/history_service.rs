use crate::error::{PortfolioError, Result};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::market_data::market_data_service::MarketDataService;
use crate::models::{Account, Activity, HistorySummary, PortfolioHistory, Quote};
use chrono::{Duration, NaiveDate, Utc};

use bigdecimal::BigDecimal;
use dashmap::DashMap;
use diesel::prelude::*;
use diesel::SqliteConnection;
use rayon::prelude::*;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

pub struct HistoryService {
    base_currency: String,
    market_data_service: Arc<MarketDataService>,
    fx_service: CurrencyExchangeService,
}

impl HistoryService {
    pub fn new(base_currency: String, market_data_service: Arc<MarketDataService>) -> Self {
        Self {
            base_currency,
            market_data_service,
            fx_service: CurrencyExchangeService::new(),
        }
    }

    pub fn get_all_accounts_history(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;
    
        let result = portfolio_history
            // .filter(account_id.ne("TOTAL"))
            .load::<PortfolioHistory>(conn)
            .map_err(PortfolioError::from)?; // Convert diesel::result::Error to PortfolioError
    
        Ok(result)
    }

    pub fn get_account_history(
        &self,
        conn: &mut SqliteConnection,
        input_account_id: &str,
    ) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;
        use diesel::prelude::*;

        let history_data: Vec<PortfolioHistory> = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.asc())
            .load::<PortfolioHistory>(conn)?;

        Ok(history_data)
    }

    pub fn get_latest_account_history(
        &self,
        conn: &mut SqliteConnection,
        input_account_id: &str,
    ) -> Result<PortfolioHistory> {
        use crate::schema::portfolio_history::dsl::*;
        use diesel::prelude::*;

        let latest_history: PortfolioHistory = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.desc())
            .first(conn)
            .map_err(|e| PortfolioError::DatabaseError(e))?;

        Ok(latest_history)
    }

    pub fn calculate_historical_data(
        &self,
        conn: &mut SqliteConnection,
        accounts: &[Account],
        activities: &[Activity],
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>> {
        self.fx_service
            .initialize(conn)
            .map_err(|e| PortfolioError::CurrencyConversionError(e.to_string()))?;

        let end_date = Utc::now().naive_utc().date();
        let quotes = Arc::new(self.market_data_service.load_quotes(conn));

        // Preload all necessary data
        let account_activities: HashMap<String, Vec<Activity>> =
            activities
                .iter()
                .cloned()
                .fold(HashMap::new(), |mut acc, activity| {
                    acc.entry(activity.account_id.clone())
                        .or_default()
                        .push(activity);
                    acc
                });

        let last_historical_dates: HashMap<String, Option<NaiveDate>> = accounts
            .iter()
            .map(|account| {
                let last_date = self
                    .get_last_historical_date(conn, &account.id)
                    .unwrap_or(None);
                (account.id.clone(), last_date)
            })
            .collect();

        let account_currencies: HashMap<String, String> = accounts
            .iter()
            .map(|account| {
                let currency = self
                    .get_account_currency(conn, &account.id)
                    .unwrap_or(self.base_currency.clone());
                (account.id.clone(), currency)
            })
            .collect();

        // Load asset currencies
        let asset_ids: Vec<String> = activities.iter().map(|a| a.asset_id.clone()).collect();
        let asset_currencies = self
            .market_data_service
            .get_asset_currencies(conn, asset_ids);

        // Process accounts in parallel and collect results
        let last_histories: HashMap<String, Option<PortfolioHistory>> = accounts
            .iter()
            .map(|account| {
                let last_history = if force_full_calculation {
                    None
                } else {
                    self.get_last_portfolio_history(conn, &account.id)
                        .unwrap_or(None)
                };
                (account.id.clone(), last_history)
            })
            .collect();

        let summaries_and_histories: Vec<(HistorySummary, Vec<PortfolioHistory>)> = accounts
            .par_iter()
            .map(|account| {
                let account_activities = account_activities
                    .get(&account.id)
                    .cloned()
                    .unwrap_or_default();

                if account_activities.is_empty() {
                    return (
                        HistorySummary {
                            id: Some(account.id.clone()),
                            start_date: "".to_string(),
                            end_date: "".to_string(),
                            entries_count: 0,
                        },
                        Vec::new(),
                    );
                }

                let account_start_date = if force_full_calculation {
                    account_activities
                        .iter()
                        .map(|a| a.activity_date.date())
                        .min()
                        .unwrap_or_else(|| Utc::now().naive_utc().date())
                } else {
                    last_historical_dates
                        .get(&account.id)
                        .cloned()
                        .unwrap_or(None)
                        .map(|d| d - Duration::days(1))
                        .unwrap_or_else(|| {
                            account_activities
                                .iter()
                                .map(|a| a.activity_date.date())
                                .min()
                                .unwrap_or_else(|| Utc::now().naive_utc().date())
                        })
                };

                let account_currency = account_currencies
                    .get(&account.id)
                    .cloned()
                    .unwrap_or(self.base_currency.clone());

                let last_history = last_histories.get(&account.id).cloned().unwrap_or(None);

                let new_history = self.calculate_historical_value(
                    &account.id,
                    &account_activities,
                    &quotes,
                    account_start_date,
                    end_date,
                    account_currency,
                    &asset_currencies,
                    last_history,
                    force_full_calculation,
                );

                let summary = HistorySummary {
                    id: Some(account.id.clone()),
                    start_date: new_history
                        .first()
                        .map(|h| h.date.clone())
                        .unwrap_or_default(),
                    end_date: new_history
                        .last()
                        .map(|h| h.date.clone())
                        .unwrap_or_default(),
                    entries_count: new_history.len(),
                };

                (summary, new_history)
            })
            .collect();

        // Extract summaries and flatten histories
        let mut summaries: Vec<HistorySummary> = summaries_and_histories
            .iter()
            .map(|(summary, _)| (*summary).clone())
            .collect();
        let account_histories: Vec<PortfolioHistory> = summaries_and_histories
            .into_iter()
            .flat_map(|(_, histories)| histories)
            .collect();

        // Save account histories
        self.save_historical_data(&account_histories, conn)?;

        // Calculate total portfolio history
        let total_history = self.calculate_total_portfolio_history_for_all_accounts(conn)?;

        // Save total history separately
        self.save_historical_data(&total_history, conn)?;

        let total_summary = HistorySummary {
            id: Some("TOTAL".to_string()),
            start_date: total_history
                .first()
                .map(|h| h.date.clone())
                .unwrap_or_default(),
            end_date: total_history
                .last()
                .map(|h| h.date.clone())
                .unwrap_or_default(),
            entries_count: total_history.len(),
        };

        summaries.push(total_summary);
        Ok(summaries)
    }

    fn calculate_total_portfolio_history_for_all_accounts(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::accounts::dsl as accounts_dsl;
        use crate::schema::portfolio_history::dsl::*;

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
                    id: format!("TOTAL_{}", history_date),
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
                    calculated_at: Utc::now().naive_utc(),
                };

                for history in histories {
                    let currency_exchange_rate = self
                        .fx_service
                        .get_latest_exchange_rate(&history.currency, &self.base_currency)
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
        account_currency: String,
        asset_currencies: &HashMap<String, String>,
        last_history: Option<PortfolioHistory>,
        force_full_calculation: bool,
    ) -> Vec<PortfolioHistory> {
        let max_history_days = 36500; // For example, 100 years
        let today = Utc::now().naive_utc().date();
        let start_date = start_date.max(today - Duration::days(max_history_days));
        let end_date = end_date.min(today);

        // Initialize values from the last PortfolioHistory or use default values
        let mut cumulative_cash = BigDecimal::from_str(
            &last_history
                .as_ref()
                .map_or("0".to_string(), |h| h.available_cash.to_string()),
        )
        .unwrap();
        let mut net_deposit = BigDecimal::from_str(
            &last_history
                .as_ref()
                .map_or("0".to_string(), |h| h.net_deposit.to_string()),
        )
        .unwrap();
        let mut book_cost = BigDecimal::from_str(
            &last_history
                .as_ref()
                .map_or("0".to_string(), |h| h.book_cost.to_string()),
        )
        .unwrap();

        // Initialize holdings based on the last history or use an empty HashMap
        let mut holdings: HashMap<String, BigDecimal> = last_history
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

        let all_dates = Self::get_days_between(actual_start_date, end_date);

        let quote_cache: DashMap<(String, NaiveDate), Option<&Quote>> = DashMap::new();

        let results: Vec<PortfolioHistory> = all_dates
            .iter()
            .map(|&date| {
                // Process activities for the current date
                for activity in activities.iter().filter(|a| a.activity_date.date() == date) {
                    self.process_activity(
                        activity,
                        &mut holdings,
                        &mut cumulative_cash,
                        &mut net_deposit,
                        &mut book_cost,
                        &account_currency,
                    );
                }

                // Update market value based on quotes
                let (updated_market_value, day_gain_value, opening_market_value) = self
                    .calculate_holdings_value(
                        &holdings,
                        quotes,
                        date,
                        &quote_cache,
                        asset_currencies,
                        &account_currency,
                    );

                let market_value = updated_market_value;
                let total_value = &cumulative_cash + &market_value;

                let day_gain_percentage = if opening_market_value != BigDecimal::from(0) {
                    (&day_gain_value / &opening_market_value) * BigDecimal::from(100)
                } else {
                    BigDecimal::from(0)
                };

                let total_gain_value = &total_value - &net_deposit;
                let total_gain_percentage = if net_deposit != BigDecimal::from(0) {
                    (&total_gain_value / &net_deposit) * BigDecimal::from(100)
                } else {
                    BigDecimal::from(0)
                };

                let exchange_rate = BigDecimal::from_str(
                    &self
                        .fx_service
                        .get_latest_exchange_rate(&account_currency, &self.base_currency)
                        .unwrap_or(1.0)
                        .to_string(),
                )
                .unwrap();

                PortfolioHistory {
                    id: format!("{}_{}", account_id, date.format("%Y-%m-%d")),
                    account_id: account_id.to_string(),
                    date: date.format("%Y-%m-%d").to_string(),
                    total_value: total_value.to_string().parse::<f64>().unwrap(),
                    market_value: market_value.to_string().parse::<f64>().unwrap(),
                    book_cost: book_cost.to_string().parse::<f64>().unwrap(),
                    available_cash: cumulative_cash.to_string().parse::<f64>().unwrap(),
                    net_deposit: net_deposit.to_string().parse::<f64>().unwrap(),
                    currency: account_currency.clone(),
                    base_currency: self.base_currency.to_string(),
                    total_gain_value: total_gain_value.to_string().parse::<f64>().unwrap(),
                    total_gain_percentage: total_gain_percentage
                        .to_string()
                        .parse::<f64>()
                        .unwrap(),
                    day_gain_percentage: day_gain_percentage.to_string().parse::<f64>().unwrap(),
                    day_gain_value: day_gain_value.to_string().parse::<f64>().unwrap(),
                    allocation_percentage: "100".to_string().parse::<f64>().unwrap(),
                    exchange_rate: exchange_rate.to_string().parse::<f64>().unwrap(),
                    holdings: Some(serde_json::to_string(&holdings).unwrap_or_default()),
                    calculated_at: Utc::now().naive_utc(),
                }
            })
            .collect();

        results
    }

    fn process_activity(
        &self,
        activity: &Activity,
        holdings: &mut HashMap<String, BigDecimal>,
        cumulative_cash: &mut BigDecimal,
        net_deposit: &mut BigDecimal,
        book_cost: &mut BigDecimal,
        account_currency: &str,
    ) {
        // Get exchange rate if activity currency is different from account currency
        let exchange_rate = BigDecimal::from_str(
            &self
                .fx_service
                .get_latest_exchange_rate(&activity.currency, account_currency)
                .unwrap_or(1.0)
                .to_string(),
        )
        .unwrap();

        let activity_amount = BigDecimal::from_str(&activity.quantity.to_string()).unwrap()
            * BigDecimal::from_str(&activity.unit_price.to_string()).unwrap()
            * &exchange_rate;
        let activity_fee =
            BigDecimal::from_str(&activity.fee.to_string()).unwrap() * &exchange_rate;

        match activity.activity_type.as_str() {
            "BUY" => {
                let buy_cost = &activity_amount + &activity_fee;
                *cumulative_cash -= &buy_cost;
                *book_cost += &buy_cost;
                *holdings
                    .entry(activity.asset_id.clone())
                    .or_insert(BigDecimal::from(0)) +=
                    BigDecimal::from_str(&activity.quantity.to_string()).unwrap();
            }
            "SELL" => {
                let sell_profit = &activity_amount - &activity_fee;
                *cumulative_cash += &sell_profit;
                *book_cost -= &activity_amount + &activity_fee;
                *holdings
                    .entry(activity.asset_id.clone())
                    .or_insert(BigDecimal::from(0)) -=
                    BigDecimal::from_str(&activity.quantity.to_string()).unwrap();
            }
            "DEPOSIT" | "TRANSFER_IN" | "CONVERSION_IN" => {
                *cumulative_cash += &activity_amount - &activity_fee;
                *net_deposit += &activity_amount;
            }
            "DIVIDEND" | "INTEREST" => {
                *cumulative_cash += &activity_amount - &activity_fee;
            }
            "WITHDRAWAL" | "TRANSFER_OUT" | "CONVERSION_OUT" => {
                *cumulative_cash -= &activity_amount + &activity_fee;
                *net_deposit -= &activity_amount;
            }
            "FEE" | "TAX" => {
                *cumulative_cash -= &activity_fee;
            }
            _ => {}
        }
    }

    fn save_historical_data(
        &self,
        history_data: &[PortfolioHistory],
        conn: &mut SqliteConnection,
    ) -> Result<()> {
        use crate::schema::portfolio_history::dsl::*;

        for record in history_data {
            diesel::insert_into(portfolio_history)
                .values((
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
                    calculated_at.eq(record.calculated_at),
                ))
                .on_conflict(id)
                .do_update()
                .set((
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
                    calculated_at.eq(record.calculated_at),
                ))
                .execute(conn)
                .map_err(PortfolioError::from)?;
        }

        Ok(())
    }

    fn calculate_holdings_value<'a>(
        &self,
        holdings: &HashMap<String, BigDecimal>,
        quotes: &'a HashMap<(String, NaiveDate), Quote>,
        date: NaiveDate,
        quote_cache: &DashMap<(String, NaiveDate), Option<&'a Quote>>,
        asset_currencies: &HashMap<String, String>,
        account_currency: &str,
    ) -> (BigDecimal, BigDecimal, BigDecimal) {
        let mut holdings_value = BigDecimal::from(0);
        let mut day_gain_value = BigDecimal::from(0);
        let mut opening_market_value = BigDecimal::from(0);

        for (asset_id, quantity) in holdings {
            if let Some(quote) = self.get_last_available_quote(asset_id, date, quotes, quote_cache)
            {
                let asset_currency = asset_currencies
                    .get(asset_id)
                    .map(String::as_str)
                    .unwrap_or(account_currency);

                let exchange_rate = BigDecimal::from_str(
                    &self
                        .fx_service
                        .get_latest_exchange_rate(asset_currency, account_currency)
                        .unwrap_or(1.0)
                        .to_string(),
                )
                .unwrap();

                let holding_value = quantity
                    * BigDecimal::from_str(&quote.close.to_string()).unwrap()
                    * &exchange_rate;
                let opening_value = quantity
                    * BigDecimal::from_str(&quote.open.to_string()).unwrap()
                    * &exchange_rate;
                let day_gain = quantity
                    * (BigDecimal::from_str(&quote.close.to_string()).unwrap()
                        - BigDecimal::from_str(&quote.open.to_string()).unwrap())
                    * &exchange_rate;

                holdings_value += &holding_value;
                day_gain_value += &day_gain;
                opening_market_value += &opening_value;
            }
        }

        (holdings_value, day_gain_value, opening_market_value)
    }

    fn get_last_available_quote<'a>(
        &self,
        asset_id: &str,
        date: NaiveDate,
        quotes: &'a HashMap<(String, NaiveDate), Quote>,
        quote_cache: &DashMap<(String, NaiveDate), Option<&'a Quote>>,
    ) -> Option<&'a Quote> {
        quote_cache
            .entry((asset_id.to_string(), date))
            .or_insert_with(|| {
                quotes.get(&(asset_id.to_string(), date)).or_else(|| {
                    (1..=30).find_map(|days_back| {
                        let lookup_date = date - chrono::Duration::days(days_back);
                        quotes.get(&(asset_id.to_string(), lookup_date))
                    })
                })
            })
            .clone()
    }

    fn get_last_portfolio_history(
        &self,
        conn: &mut SqliteConnection,
        some_account_id: &str,
    ) -> Result<Option<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;

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

    fn get_days_between(start: NaiveDate, end: NaiveDate) -> Vec<NaiveDate> {
        let mut days = Vec::new();
        let mut current = start;

        while current <= end {
            days.push(current);
            current += Duration::days(1);
        }

        days
    }

    fn get_last_historical_date(
        &self,
        conn: &mut SqliteConnection,
        some_account_id: &str,
    ) -> Result<Option<NaiveDate>> {
        use crate::schema::portfolio_history::dsl::*;

        let last_date_opt = portfolio_history
            .filter(account_id.eq(some_account_id))
            .select(date)
            .order(date.desc())
            .first::<String>(conn)
            .optional()
            .map_err(PortfolioError::from)?;

        if let Some(last_date_str) = last_date_opt {
            NaiveDate::parse_from_str(&last_date_str, "%Y-%m-%d")
                .map(Some)
                .map_err(|_| PortfolioError::ParseError("Invalid date format".to_string()))
        } else {
            Ok(None)
        }
    }

    // Add this new method to get account currency
    fn get_account_currency(
        &self,
        conn: &mut SqliteConnection,
        account_id: &str,
    ) -> Result<String> {
        use crate::schema::accounts::dsl::*;

        accounts
            .filter(id.eq(account_id))
            .select(currency)
            .first::<String>(conn)
            .map_err(PortfolioError::from)
    }
}
