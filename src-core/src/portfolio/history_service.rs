use crate::errors::{CurrencyError, Error, Result};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::market_data::market_data_service::MarketDataService;
use crate::models::{Account, Activity, HistorySummary, PortfolioHistory, Quote};
use chrono::{Duration, NaiveDate, Utc};
use diesel::result::Error as DieselError;

use bigdecimal::BigDecimal;
use diesel::prelude::*;
use diesel::sql_types::Text;
use diesel::SqliteConnection;
use log::{debug,warn};
use rayon::prelude::*;
use std::collections::HashMap;
use std::default::Default;
use std::sync::Arc;

use num_traits::FromPrimitive;
use num_traits::ToPrimitive;
pub struct HistoryService {
    base_currency: String,
    market_data_service: Arc<MarketDataService>,
    fx_service: CurrencyExchangeService,
}

impl Default for HistorySummary {
    fn default() -> Self {
        HistorySummary {
            id: None,
            start_date: String::new(),
            end_date: String::new(),
            entries_count: 0,
        }
    }
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

        let result = portfolio_history.load::<PortfolioHistory>(conn)?;
        Ok(result)
    }

    pub fn get_portfolio_history(
        &self,
        conn: &mut SqliteConnection,
        input_account_id: Option<&str>,
    ) -> Result<Vec<PortfolioHistory>> {
        use crate::schema::portfolio_history::dsl::*;

        let mut query = portfolio_history.into_boxed();

        if let Some(other_id) = input_account_id {
            query = query.filter(account_id.eq(other_id));
        }

        let result = query.order(date.asc()).load::<PortfolioHistory>(conn)?;
        Ok(result)
    }

    pub fn get_latest_account_history(
        &self,
        conn: &mut SqliteConnection,
        input_account_id: &str,
    ) -> Result<PortfolioHistory> {
        use crate::schema::portfolio_history::dsl::*;

        let result = portfolio_history
            .filter(account_id.eq(input_account_id))
            .order(date.desc())
            .first(conn)?;

        Ok(result)
    }

    pub fn calculate_historical_data(
        &self,
        conn: &mut SqliteConnection,
        accounts: &[Account],
        activities: &[Activity],
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>> {
        self.initialize_fx_service(conn)?;

        // Load and prepare all required data
        let end_date = Utc::now().naive_utc().date();
        let quotes = Arc::new(self.market_data_service.load_quotes(conn));
        let account_currencies = self.get_account_currencies(accounts)?;
        let asset_currencies = self.get_asset_currencies(conn, activities);

        // Calculate split factors for all activities
        let split_factors = self.calculate_split_factors(
            activities,
            NaiveDate::from_ymd_opt(1900, 1, 1).unwrap(),
            end_date,
        );

        // Adjust all activities for splits
        let adjusted_activities = self.adjust_activities_for_splits(activities, &split_factors);

        // Group adjusted activities by account
        let account_activities = self.group_activities_by_account(&adjusted_activities);

        let all_last_histories = if !force_full_calculation {
            self.get_all_last_portfolio_histories(conn, accounts)?
        } else {
            HashMap::new()
        };

        let (start_dates, last_histories) = self.calculate_start_dates_and_last_histories(
            accounts,
            &account_activities,
            &all_last_histories,
            force_full_calculation,
        );

        // Parallel calculations without database access
        let summaries_and_histories: Vec<(HistorySummary, Vec<PortfolioHistory>)> = accounts
            .par_iter()
            .map(|account| {
                self.calculate_account_history(
                    account,
                    &account_activities,
                    &quotes,
                    &start_dates,
                    &last_histories,
                    end_date,
                    &account_currencies,
                    &asset_currencies,
                )
            })
            .collect();

        // Process results
        let mut summaries: Vec<HistorySummary> = summaries_and_histories
            .iter()
            .map(|(summary, _)| summary.clone())
            .collect();

        debug!("Calculated summaries: {:?}", summaries);

        let account_histories: Vec<PortfolioHistory> = summaries_and_histories
            .into_iter()
            .flat_map(|(_, histories)| histories)
            .collect();

        debug!("Calculated histories: {:?}", account_histories);

        // If force_full_calculation is true, delete existing history for the accounts and TOTAL
        if force_full_calculation {
            self.delete_existing_history(conn, accounts)?;
        }

        // Save data
        self.save_historical_data(&account_histories, conn)?;

        let total_history = self.calculate_total_portfolio_history(conn)?;
        self.save_historical_data(&total_history, conn)?;

        let total_summary = self.create_total_summary(&total_history);
        summaries.push(total_summary);

        Ok(summaries)
    }

    fn initialize_fx_service(&self, conn: &mut SqliteConnection) -> Result<()> {
        self.fx_service
            .initialize(conn)
            .map_err(|e| Error::Currency(CurrencyError::ConversionFailed(e.to_string())))
    }

    fn group_activities_by_account(
        &self,
        activities: &[Activity],
    ) -> HashMap<String, Vec<Activity>> {
        let mut account_activities: HashMap<String, Vec<Activity>> = HashMap::new();
        for activity in activities {
            account_activities
                .entry(activity.account_id.clone())
                .or_default()
                .push(activity.clone());
        }
        account_activities
    }
    fn get_account_currencies(&self, accounts: &[Account]) -> Result<HashMap<String, String>> {
        Ok(accounts
            .iter()
            .map(|account| (account.id.clone(), account.currency.clone()))
            .collect())
    }

    fn get_asset_currencies(
        &self,
        conn: &mut SqliteConnection,
        activities: &[Activity],
    ) -> HashMap<String, String> {
        let asset_ids: Vec<String> = activities.iter().map(|a| a.asset_id.clone()).collect();
        self.market_data_service
            .get_asset_currencies(conn, asset_ids)
    }

    fn calculate_start_dates_and_last_histories(
        &self,
        accounts: &[Account],
        account_activities: &HashMap<String, Vec<Activity>>,
        all_last_histories: &HashMap<String, Option<PortfolioHistory>>,
        force_full_calculation: bool,
    ) -> (
        HashMap<String, NaiveDate>,
        HashMap<String, Option<PortfolioHistory>>,
    ) {
        let mut start_dates = HashMap::new();
        let mut last_histories = HashMap::new();

        for account in accounts {
            let start_date = if force_full_calculation {
                account_activities
                    .get(&account.id)
                    .and_then(|activities| activities.iter().map(|a| a.activity_date.date()).min())
                    .unwrap_or_else(|| Utc::now().naive_utc().date())
            } else {
                match all_last_histories.get(&account.id) {
                    Some(Some(history)) => NaiveDate::parse_from_str(&history.date, "%Y-%m-%d")
                        .map(|date| date + Duration::days(1))
                        .unwrap_or_else(|_| Utc::now().naive_utc().date()),
                    _ => account_activities
                        .get(&account.id)
                        .and_then(|activities| {
                            activities.iter().map(|a| a.activity_date.date()).min()
                        })
                        .unwrap_or_else(|| Utc::now().naive_utc().date()),
                }
            };

            start_dates.insert(account.id.clone(), start_date);

            if !force_full_calculation {
                last_histories.insert(
                    account.id.clone(),
                    all_last_histories.get(&account.id).cloned().flatten(),
                );
            }
        }

        (start_dates, last_histories)
    }

    fn get_all_last_portfolio_histories(
        &self,
        conn: &mut SqliteConnection,
        accounts: &[Account],
    ) -> Result<HashMap<String, Option<PortfolioHistory>>> {
        let account_ids: Vec<String> = accounts.iter().map(|a| a.id.clone()).collect();

        let query = "
        SELECT ph.*
        FROM portfolio_history ph
        INNER JOIN (
            SELECT account_id, MAX(date) as max_date
            FROM portfolio_history
            WHERE account_id = ?
            GROUP BY account_id
        ) latest
        ON ph.account_id = latest.account_id AND ph.date = latest.max_date
    ";

        let mut last_histories = Vec::new();

        for account_id in &account_ids {
            let history = diesel::sql_query(query)
                .bind::<Text, _>(account_id)
                .get_result::<PortfolioHistory>(conn);

            match history {
                Ok(history) => {
                    last_histories.push(history);
                }
                Err(DieselError::NotFound) => {
                    // Skip if no history found for this account
                    warn!("No history found for account {}", account_id);
                }
                Err(e) => {
                    return Err(Error::from(e));
                }
            }
        }

        let result: HashMap<String, Option<PortfolioHistory>> = last_histories
            .into_iter()
            .map(|history| (history.account_id.clone(), Some(history)))
            .collect();

        Ok(result)
    }

    fn calculate_account_history(
        &self,
        account: &Account,
        account_activities: &HashMap<String, Vec<Activity>>,
        quotes: &Arc<HashMap<String, Vec<(NaiveDate, Quote)>>>,
        start_dates: &HashMap<String, NaiveDate>,
        last_histories: &HashMap<String, Option<PortfolioHistory>>,
        end_date: NaiveDate,
        account_currencies: &HashMap<String, String>,
        asset_currencies: &HashMap<String, String>,
    ) -> (HistorySummary, Vec<PortfolioHistory>) {
        let activities = account_activities
            .get(&account.id)
            .cloned()
            .unwrap_or_default();

        if activities.is_empty() {
            return self.create_empty_summary_and_history(&account.id);
        }

        let start_date = *start_dates.get(&account.id).unwrap();
        let account_currency = account_currencies
            .get(&account.id)
            .cloned()
            .unwrap_or(self.base_currency.clone());
        let last_history = last_histories.get(&account.id).cloned().unwrap_or(None);

        let new_history = self.calculate_historical_value(
            &account.id,
            &activities,
            quotes,
            start_date,
            end_date,
            account_currency,
            asset_currencies,
            last_history,
        );

        let summary = self.create_summary(&account.id, &new_history);

        (summary, new_history)
    }

    fn create_empty_summary_and_history(
        &self,
        account_id: &str,
    ) -> (HistorySummary, Vec<PortfolioHistory>) {
        let mut summary = HistorySummary::default();
        summary.id = Some(account_id.to_string());
        (summary, Vec::new())
    }

    fn create_summary(&self, account_id: &str, history: &[PortfolioHistory]) -> HistorySummary {
        HistorySummary {
            id: Some(account_id.to_string()),
            start_date: history.first().map(|h| h.date.clone()).unwrap_or_default(),
            end_date: history.last().map(|h| h.date.clone()).unwrap_or_default(),
            entries_count: history.len(),
        }
    }

    fn calculate_total_portfolio_history(
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

        let mut grouped_histories: HashMap<String, Vec<PortfolioHistory>> = HashMap::new();
        for history in all_histories {
            grouped_histories
                .entry(history.date.clone())
                .or_default()
                .push(history);
        }

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
        quotes: &Arc<HashMap<String, Vec<(NaiveDate, Quote)>>>,
        start_date: NaiveDate,
        end_date: NaiveDate,
        account_currency: String,
        asset_currencies: &HashMap<String, String>,
        last_history: Option<PortfolioHistory>,
    ) -> Vec<PortfolioHistory> {
        let max_history_days = 36500; // For example, 100 years
        let today = Utc::now().naive_utc().date();
        let start_date = start_date.max(today - Duration::days(max_history_days));
        let end_date = end_date.min(today);

        // Initialize values from the last PortfolioHistory or use default values
        let mut cumulative_cash = last_history.as_ref().map_or(BigDecimal::from(0), |h| {
            BigDecimal::from_f64(h.available_cash).unwrap()
        });

        let mut net_deposit = last_history.as_ref().map_or(BigDecimal::from(0), |h| {
            BigDecimal::from_f64(h.net_deposit).unwrap()
        });
        let mut book_cost = last_history.as_ref().map_or(BigDecimal::from(0), |h| {
            BigDecimal::from_f64(h.book_cost).unwrap()
        });

        // Initialize holdings based on the last history or use an empty HashMap
        let mut holdings: HashMap<String, BigDecimal> = last_history
            .as_ref()
            .and_then(|h| h.holdings.as_ref())
            .and_then(|json_str| serde_json::from_str(json_str).ok())
            .unwrap_or_default();

        let all_dates = Self::get_days_between(start_date, end_date);

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
                        asset_currencies,
                        &account_currency,
                    );

                let market_value = updated_market_value;

                let total_value = if cumulative_cash > BigDecimal::from(0) {
                    &cumulative_cash + &market_value
                } else {
                    market_value.clone()
                };

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

                let exchange_rate = BigDecimal::from_f64(
                    self.fx_service
                        .get_latest_exchange_rate(&account_currency, &self.base_currency)
                        .unwrap_or(1.0),
                )
                .unwrap();

                PortfolioHistory {
                    id: format!("{}_{}", account_id, date.format("%Y-%m-%d")),
                    account_id: account_id.to_string(),
                    date: date.format("%Y-%m-%d").to_string(),
                    total_value: total_value.to_f64().unwrap(),
                    market_value: market_value.to_f64().unwrap(),
                    book_cost: book_cost.to_f64().unwrap(),
                    available_cash: cumulative_cash.to_f64().unwrap(),
                    net_deposit: net_deposit.to_f64().unwrap(),
                    currency: account_currency.clone(),
                    base_currency: self.base_currency.clone(),
                    total_gain_value: total_gain_value.to_f64().unwrap(),
                    total_gain_percentage: total_gain_percentage.to_f64().unwrap(),
                    day_gain_percentage: day_gain_percentage.to_f64().unwrap(),
                    day_gain_value: day_gain_value.to_f64().unwrap(),
                    allocation_percentage: 100.0,
                    exchange_rate: exchange_rate.to_f64().unwrap(),
                    holdings: Some(serde_json::to_string(&holdings).unwrap_or_default()),
                    calculated_at: Utc::now().naive_utc(),
                }
            })
            .collect();

        results
    }

    fn calculate_split_factors(
        &self,
        activities: &[Activity],
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> HashMap<String, Vec<(NaiveDate, BigDecimal)>> {
        let mut split_factors: HashMap<String, Vec<(NaiveDate, BigDecimal)>> = HashMap::new();

        for activity in activities.iter().filter(|a| {
            a.activity_type == "SPLIT"
                && a.activity_date.date() >= start_date
                && a.activity_date.date() <= end_date
        }) {
            let split_ratio = BigDecimal::from_f64(activity.unit_price).unwrap();
            split_factors
                .entry(activity.asset_id.clone())
                .or_default()
                .push((activity.activity_date.date(), split_ratio));
        }

        split_factors
    }

    fn adjust_activities_for_splits(
        &self,
        activities: &[Activity],
        split_factors: &HashMap<String, Vec<(NaiveDate, BigDecimal)>>,
    ) -> Vec<Activity> {
        let mut adjusted_activities = activities.to_vec();

        for (asset_id, splits) in split_factors {
            // Reverse the splits to apply future splits to past activities
            let mut future_splits = splits.clone();
            future_splits.sort_by(|a, b| b.0.cmp(&a.0)); // Sort in descending order

            for activity in adjusted_activities.iter_mut() {
                if activity.asset_id == *asset_id && activity.activity_type != "SPLIT" {
                    let mut cumulative_factor = BigDecimal::from(1);

                    // Apply splits that occur after the activity date
                    for &(split_date, ref split_factor) in &future_splits {
                        if split_date > activity.activity_date.date() {
                            cumulative_factor *= split_factor;
                        }
                    }

                    // Adjust quantity and unit price
                    let quantity = BigDecimal::from_f64(activity.quantity).unwrap();
                    let unit_price = BigDecimal::from_f64(activity.unit_price).unwrap();

                    activity.quantity = (quantity * &cumulative_factor).to_f64().unwrap();
                    activity.unit_price = (unit_price / &cumulative_factor).to_f64().unwrap();
                }
            }
        }

        adjusted_activities
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
        let exchange_rate = BigDecimal::from_f64(
            self.fx_service
                .get_latest_exchange_rate(&activity.currency, account_currency)
                .unwrap_or(1.0),
        )
        .unwrap();

        let activity_fee = BigDecimal::from_f64(activity.fee).unwrap() * &exchange_rate;

        let activity_amount = BigDecimal::from_f64(activity.quantity).unwrap()
            * BigDecimal::from_f64(activity.unit_price).unwrap()
            * &exchange_rate;

        match activity.activity_type.as_str() {
            "BUY" => {
                let quantity = BigDecimal::from_f64(activity.quantity).unwrap();
                let price = BigDecimal::from_f64(activity.unit_price).unwrap();
                let amount = &quantity * &price * &exchange_rate;

                let buy_cost = &amount + &activity_fee;
                *cumulative_cash -= &buy_cost;
                *book_cost += &buy_cost;
                *holdings
                    .entry(activity.asset_id.clone())
                    .or_insert(BigDecimal::from(0)) += &quantity;
            }
            "SELL" => {
                let quantity = BigDecimal::from_f64(activity.quantity).unwrap();
                let price = BigDecimal::from_f64(activity.unit_price).unwrap();
                let amount = &quantity * &price * &exchange_rate;

                let sell_profit = &amount - &activity_fee;
                *cumulative_cash += &sell_profit;
                let old_quantity = holdings
                    .get(&activity.asset_id)
                    .cloned()
                    .unwrap_or_default();
                if old_quantity != BigDecimal::from(0) {
                    let sell_ratio = (&quantity / &old_quantity).round(6);
                    let adjustment = sell_ratio * book_cost.clone();
                    *book_cost -= adjustment;
                }
                *holdings
                    .entry(activity.asset_id.clone())
                    .or_insert(BigDecimal::from(0)) -= &quantity;
            }
            "TRANSFER_IN" => {
                if activity.asset_id.starts_with("$CASH") {
                    *cumulative_cash += &activity_amount - &activity_fee;
                    *net_deposit += &activity_amount - &activity_fee;
                } else {
                    let quantity = BigDecimal::from_f64(activity.quantity).unwrap();
                    *holdings
                        .entry(activity.asset_id.clone())
                        .or_insert(BigDecimal::from(0)) += &quantity;
                    *book_cost += &activity_amount;
                }
            }
            "TRANSFER_OUT" => {
                if activity.asset_id.starts_with("$CASH") {
                    *cumulative_cash -= &activity_amount + &activity_fee;
                    *net_deposit -= &activity_amount + &activity_fee;
                } else {
                    let quantity = BigDecimal::from_f64(activity.quantity).unwrap();
                    let old_quantity = holdings
                        .get(&activity.asset_id)
                        .cloned()
                        .unwrap_or_default();
                    if old_quantity != BigDecimal::from(0) {
                        let transfer_ratio = (&quantity / &old_quantity).round(6);
                        let adjustment = transfer_ratio * book_cost.clone();
                        *book_cost -= adjustment;
                    }
                    *holdings
                        .entry(activity.asset_id.clone())
                        .or_insert(BigDecimal::from(0)) -= &quantity;
                }
            }
            "DEPOSIT" => {
                *cumulative_cash += &activity_amount - &activity_fee;
                *net_deposit += &activity_amount;
            }
            "WITHDRAWAL" => {
                *cumulative_cash -= &activity_amount + &activity_fee;
                *net_deposit -= &activity_amount;
            }
            "CONVERSION_IN" => {
                *cumulative_cash += &activity_amount - &activity_fee;
                *net_deposit += &activity_amount - &activity_fee;
            }
            "CONVERSION_OUT" => {
                *cumulative_cash -= &activity_amount + &activity_fee;
                *net_deposit -= &activity_amount + &activity_fee;
            }
            "DIVIDEND" | "INTEREST" => {
                *cumulative_cash += &activity_amount - &activity_fee;
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
                .execute(conn)?;
        }

        Ok(())
    }

    fn calculate_holdings_value(
        &self,
        holdings: &HashMap<String, BigDecimal>,
        quotes: &Arc<HashMap<String, Vec<(NaiveDate, Quote)>>>,
        date: NaiveDate,
        asset_currencies: &HashMap<String, String>,
        account_currency: &str,
    ) -> (BigDecimal, BigDecimal, BigDecimal) {
        let mut holdings_value = BigDecimal::from(0);
        let mut day_gain_value = BigDecimal::from(0);
        let mut opening_market_value = BigDecimal::from(0);

        for (asset_id, quantity) in holdings {
            if let Some(quote) = self.get_last_available_quote(asset_id, date, quotes) {
                let asset_currency = asset_currencies
                    .get(asset_id)
                    .map(String::as_str)
                    .unwrap_or(account_currency);

                let exchange_rate = BigDecimal::from_f64(
                    self.fx_service
                        .get_latest_exchange_rate(asset_currency, account_currency)
                        .unwrap_or(1.0),
                )
                .unwrap();

                // No need to adjust quantity here, as it's already adjusted in process_activity
                let holding_value =
                    quantity * BigDecimal::from_f64(quote.close).unwrap() * &exchange_rate;
                let opening_value =
                    quantity * BigDecimal::from_f64(quote.open).unwrap() * &exchange_rate;
                let day_gain = quantity
                    * (BigDecimal::from_f64(quote.close).unwrap()
                        - BigDecimal::from_f64(quote.open).unwrap())
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
        quotes: &'a Arc<HashMap<String, Vec<(NaiveDate, Quote)>>>,
    ) -> Option<&'a Quote> {

        quotes
            .get(asset_id)
            .and_then(|alt_quotes| {
                alt_quotes
                    .iter()
                    .find(|(quote_date, _)| *quote_date <= date)
                    .map(|(_, quote)| quote)
        })
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

    fn create_total_summary(&self, total_history: &[PortfolioHistory]) -> HistorySummary {
        HistorySummary {
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
        }
    }

    fn delete_existing_history(
        &self,
        conn: &mut SqliteConnection,
        accounts: &[Account],
    ) -> Result<()> {
        use crate::schema::portfolio_history::dsl::*;
        use diesel::delete;

        let mut account_ids: Vec<String> = accounts.iter().map(|a| a.id.clone()).collect();
        account_ids.push("TOTAL".to_string());

        delete(portfolio_history.filter(account_id.eq_any(account_ids))).execute(conn)?;

        Ok(())
    }
}
