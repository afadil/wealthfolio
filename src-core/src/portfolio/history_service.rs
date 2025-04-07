use crate::errors::Result;
use crate::models::{ HistorySummary, HistoryRecord};
use crate::accounts::Account;
use crate::activities::Activity;
use crate::market_data::market_data_model::Quote;

// Import the traits
use crate::fx::fx_traits::FxServiceTrait;
use crate::market_data::market_data_traits::MarketDataServiceTrait;
use crate::portfolio::history_traits::{HistoryRepositoryTrait, HistoryServiceTrait};
use async_trait::async_trait; // Import async_trait

use rust_decimal::Decimal;
use chrono::{Duration, NaiveDate, Utc};
use log::warn;
use std::collections::HashMap;
use std::default::Default;
use std::str::FromStr;
use std::sync::Arc;
use rayon::prelude::*;

pub struct HistoryService {
    base_currency: String,
    fx_service: Arc<dyn FxServiceTrait>,
    market_data_service: Arc<dyn MarketDataServiceTrait>,
    repository: Arc<dyn HistoryRepositoryTrait>,
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
    const QUANTITY_THRESHOLD: &'static str = "0.0000000001";

    fn is_quantity_significant(quantity: &Decimal) -> bool {
        let threshold = Decimal::from_str(Self::QUANTITY_THRESHOLD).unwrap_or(Decimal::ZERO);
        quantity.abs() >= threshold
    }

    pub fn new(
        base_currency: String,
        fx_service: Arc<dyn FxServiceTrait>,
        market_data_service: Arc<dyn MarketDataServiceTrait>,
        repository: Arc<dyn HistoryRepositoryTrait>,
    ) -> Self {
        Self {
            base_currency,
            fx_service,
            market_data_service,
            repository,
        }
    }

    pub fn get_all_accounts_history(&self) -> Result<Vec<HistoryRecord>> {
        self.repository.get_all()
    }

    pub fn get_portfolio_history(
        &self,
        input_account_id: Option<&str>,
    ) -> Result<Vec<HistoryRecord>> {
        self.repository.get_by_account(input_account_id, None, None)
    }

    pub fn get_latest_account_history(
        &self,
        input_account_id: &str,
    ) -> Result<HistoryRecord> {
        self.repository.get_latest_by_account(input_account_id)
    }

    pub async fn calculate_historical_data(
        &self,
        accounts: &[Account],
        activities: &[Activity],
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>> {
        // Initialize FX service - Assuming FxServiceTrait has an async initialize method
        // If not, this might need to be handled differently (e.g., during construction)
        self.fx_service.initialize()?;
        let end_date = Utc::now().naive_utc().date();

        // Load and prepare all required data - Assuming MarketDataServiceTrait has get_all_historical_quotes
        let quotes = Arc::new(self.market_data_service.get_all_historical_quotes()?);
        let account_currencies = self.get_account_currencies(accounts)?;

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
            // Assuming HistoryRepositoryTrait has get_all_last_histories
            self.repository.get_all_last_histories(&accounts.iter().map(|a| a.id.clone()).collect::<Vec<_>>())?
        } else {
            HashMap::new()
        };

        let (start_dates, last_histories) = self.calculate_start_dates_and_last_histories(
            accounts,
            &account_activities,
            &all_last_histories,
            force_full_calculation,
        );

        // Parallel calculations might need adjustment if calculate_account_history becomes async
        // For now, keeping it synchronous as in the original code, but this might need `async move` and `.await`
        let summaries_and_histories: Vec<_> = if accounts.len() > 10 {
            accounts.par_iter().map(|account| {
                self.calculate_account_history(
                    account,
                    &account_activities,
                    &quotes, // Pass Arc<Quotes> directly
                    &start_dates,
                    &last_histories,
                    end_date,
                    &account_currencies,
                )
            }).collect()
        } else {
            accounts.iter().map(|account| {
                 self.calculate_account_history(
                    account,
                    &account_activities,
                    &quotes, // Pass Arc<Quotes> directly
                    &start_dates,
                    &last_histories,
                    end_date,
                    &account_currencies,
                )
            }).collect()
        };

        let mut summaries: Vec<HistorySummary> = summaries_and_histories
            .iter()
            .map(|(summary, _)| summary.clone())
            .collect();

        let account_histories: Vec<HistoryRecord> = summaries_and_histories
            .into_iter()
            .flat_map(|(_, histories)| histories)
            .collect();

        if force_full_calculation {
            // Assuming HistoryRepositoryTrait has delete_by_accounts
            self.repository.delete_by_accounts(accounts)?;
        }

        // Assuming HistoryRepositoryTrait has save_batch
        self.repository.save_batch(&account_histories)?;

        // calculate_total_portfolio_history might need to become async if it uses async repo methods
        let total_history = self.calculate_total_portfolio_history()?; // Might need .await if changed

        // Assuming HistoryRepositoryTrait has save_batch
        self.repository.save_batch(&total_history)?;

        let total_summary = self.create_total_summary(&total_history);
        summaries.push(total_summary);

        Ok(summaries)
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

    fn calculate_start_dates_and_last_histories(
        &self,
        accounts: &[Account],
        account_activities: &HashMap<String, Vec<Activity>>,
        all_last_histories: &HashMap<String, Option<HistoryRecord>>,
        force_full_calculation: bool,
    ) -> (
        HashMap<String, NaiveDate>,
        HashMap<String, Option<HistoryRecord>>,
    ) {
        let mut start_dates = HashMap::new();
        let mut last_histories = HashMap::new();

        for account in accounts {
            let start_date = if force_full_calculation {
                account_activities
                    .get(&account.id)
                    .and_then(|activities| activities.iter().map(|a| a.activity_date.naive_utc().date()).min())
                    .unwrap_or_else(|| Utc::now().naive_utc().date())
            } else {
                match all_last_histories.get(&account.id) {
                    Some(Some(history)) => NaiveDate::parse_from_str(&history.date, "%Y-%m-%d")
                        .map(|date| date + Duration::days(1))
                        .unwrap_or_else(|_| Utc::now().naive_utc().date()),
                    _ => account_activities
                        .get(&account.id)
                        .and_then(|activities| {
                            activities.iter().map(|a| a.activity_date.naive_utc().date()).min()
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
        accounts: &[Account],
    ) -> Result<HashMap<String, Option<HistoryRecord>>> {
        let account_ids: Vec<String> = accounts.iter().map(|a| a.id.clone()).collect();
        self.repository.get_all_last_histories(&account_ids)
    }

    fn calculate_account_history(
        &self,
        account: &Account,
        account_activities: &HashMap<String, Vec<Activity>>,
        quotes: &Arc<HashMap<String, Vec<(NaiveDate, Quote)>>>,
        start_dates: &HashMap<String, NaiveDate>,
        last_histories: &HashMap<String, Option<HistoryRecord>>,
        end_date: NaiveDate,
        account_currencies: &HashMap<String, String>,
    ) -> (HistorySummary, Vec<HistoryRecord>) {
        let activities = account_activities
            .get(&account.id)
            .cloned()
            .unwrap_or_default();

        if activities.is_empty() {
            warn!("No activities found for account {}, returning empty history", account.id);
            return self.create_empty_summary_and_history(&account.id);
        }

        let start_date = *start_dates.get(&account.id).unwrap();
        let account_currency = account_currencies
            .get(&account.id)
            .cloned()
            .unwrap_or_else(|| account.currency.clone());
        let last_history = last_histories.get(&account.id).cloned().unwrap_or(None);

        let new_history = self.calculate_historical_value(
            &account.id,
            &activities,
            quotes,
            start_date,
            end_date,
            account_currency,
            last_history,
        );
     

        let summary = self.create_summary(&account.id, &new_history);
       

        (summary, new_history)
    }

    fn create_empty_summary_and_history(
        &self,
        account_id: &str,
    ) -> (HistorySummary, Vec<HistoryRecord>) {
        let mut summary = HistorySummary::default();
        summary.id = Some(account_id.to_string());
        (summary, Vec::new())
    }

    fn create_summary(&self, account_id: &str, history: &[HistoryRecord]) -> HistorySummary {
        HistorySummary {
            id: Some(account_id.to_string()),
            start_date: history.first().map(|h| h.date.clone()).unwrap_or_default(),
            end_date: history.last().map(|h| h.date.clone()).unwrap_or_default(),
            entries_count: history.len(),
        }
    }

    fn calculate_total_portfolio_history(
        &self,
    ) -> Result<Vec<HistoryRecord>> {
         // Get all histories for active accounts using the repository
        let all_histories = self.repository.get_all_active_account_histories()?;

        let mut grouped_histories: HashMap<String, Vec<HistoryRecord>> = HashMap::new();
        for history in all_histories {
            grouped_histories
                .entry(history.date.clone())
                .or_default()
                .push(history);
        }

        let mut total_history: Vec<HistoryRecord> = grouped_histories
            .into_iter()
            .map(|(history_date, histories)| {
                let mut total = HistoryRecord {
                    id: format!("TOTAL_{}", history_date),
                    account_id: "TOTAL".to_string(),
                    date: history_date,
                    total_value: Decimal::ZERO,
                    market_value: Decimal::ZERO,
                    book_cost: Decimal::ZERO,
                    available_cash: Decimal::ZERO,
                    net_deposit: Decimal::ZERO,
                    currency: self.base_currency.clone(),
                    base_currency: self.base_currency.clone(),
                    total_gain_value: Decimal::ZERO,
                    total_gain_percentage: Decimal::ZERO,
                    day_gain_percentage: Decimal::ZERO,
                    day_gain_value: Decimal::ZERO,
                    allocation_percentage: Decimal::ONE_HUNDRED,
                    exchange_rate: Decimal::ONE,
                    holdings: Some("{}".to_string()),
                    calculated_at: Utc::now().naive_utc(),
                };

                for history in histories {
                    let currency_exchange_rate = self.fx_service
                        .get_exchange_rate_for_date(
                            &history.currency,
                            &self.base_currency,
                            NaiveDate::parse_from_str(&history.date, "%Y-%m-%d").unwrap_or_default(),
                        )
                        .unwrap_or(Decimal::ONE);

                    let exchange_rate_bd = currency_exchange_rate;
                    total.total_value += history.total_value * &exchange_rate_bd;
                    total.market_value += history.market_value * &exchange_rate_bd;
                    total.book_cost += history.book_cost * &exchange_rate_bd;
                    total.available_cash += history.available_cash * &exchange_rate_bd;
                    total.net_deposit += history.net_deposit * &exchange_rate_bd;
                    total.day_gain_value += history.day_gain_value * &exchange_rate_bd;
                    total.exchange_rate = exchange_rate_bd;
                }

                // Recalculate percentages
                // Calculate total gain value
                total.total_gain_value = &total.total_value - &total.net_deposit;
                
                // Calculate total gain percentage
                if total.net_deposit != Decimal::ZERO {
                    total.total_gain_percentage = (&total.total_gain_value * Decimal::ONE_HUNDRED) / &total.net_deposit;
                } else {
                    total.total_gain_percentage = Decimal::ZERO;
                }
                
                // Calculate day gain percentage        
                if total.market_value != Decimal::ZERO {
                    total.day_gain_percentage = (&total.day_gain_value * Decimal::ONE_HUNDRED) / &total.market_value;
                } else {
                    total.day_gain_percentage = Decimal::ZERO;
                }

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
        last_history: Option<HistoryRecord>,
    ) -> Vec<HistoryRecord> {
        let max_history_days = 36500; // 100 years
        let today = Utc::now().naive_utc().date();
        let start_date = start_date.max(today - Duration::days(max_history_days));
        let end_date = end_date.min(today);

        // Initialize values from the last HistoryRecord or use default values
        let mut cumulative_cash = last_history.as_ref().map_or(Decimal::ZERO, |h| {
            h.available_cash.clone()
        });

        let mut net_deposit = last_history.as_ref().map_or(Decimal::ZERO, |h| {
            h.net_deposit.clone()
        });
        let mut book_cost = last_history.as_ref().map_or(Decimal::ZERO, |h| {
            h.book_cost.clone()
        });

        // Initialize holdings based on the last history or use an empty HashMap
        let mut holdings: HashMap<String, Decimal> = last_history
            .as_ref()
            .and_then(|h| h.holdings.as_ref())
            .and_then(|json_str| serde_json::from_str(json_str).ok())
            .unwrap_or_default();

        let all_dates = Self::get_days_between(start_date, end_date);

        let results: Vec<HistoryRecord> = all_dates
            .iter()
            .map(|&date| {
                // Process activities for the current date
                for activity in activities.iter().filter(|a| a.activity_date.naive_utc().date() == date) {
                    self.process_activity(
                        activity,
                        &mut holdings,
                        &mut cumulative_cash,
                        &mut net_deposit,
                        &mut book_cost,
                        &account_currency,
                        date,
                    );
                }

                // Update market value based on quotes
                let (updated_market_value, day_gain_value, opening_market_value) = self
                    .calculate_holdings_value(
                        &holdings,
                        quotes,
                        date,
                        &account_currency,
                    );

                let market_value = updated_market_value;

                let total_value = if cumulative_cash > Decimal::ZERO {
                    &cumulative_cash + &market_value
                } else {
                    market_value.clone()
                };

                let day_gain_percentage = if opening_market_value != Decimal::ZERO {
                    &day_gain_value / &opening_market_value * Decimal::ONE_HUNDRED
                } else {
                    Decimal::ZERO
                };

                let total_gain_value = &total_value - &net_deposit;
                let total_gain_percentage = if net_deposit != Decimal::ZERO {
                    &total_gain_value / &net_deposit * Decimal::ONE_HUNDRED
                } else {
                    Decimal::ZERO
                };
                
                let exchange_rate = self.fx_service
                    .get_exchange_rate_for_date(account_currency.as_str(), &self.base_currency, date)
                    .unwrap_or(Decimal::ONE);

                HistoryRecord {
                    id: format!("{}_{}", account_id, date.format("%Y-%m-%d")),
                    account_id: account_id.to_string(),
                    date: date.format("%Y-%m-%d").to_string(),
                    total_value: total_value,
                    market_value: market_value,
                    book_cost: book_cost.clone(),
                    available_cash: cumulative_cash.clone(),
                    net_deposit: net_deposit.clone(),
                    currency: account_currency.clone(),
                    base_currency: self.base_currency.clone(),
                    total_gain_value: total_gain_value,
                    total_gain_percentage: total_gain_percentage,
                    day_gain_percentage: day_gain_percentage,
                    day_gain_value: day_gain_value,
                    allocation_percentage: Decimal::ONE_HUNDRED,
                    exchange_rate: exchange_rate,
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
    ) -> HashMap<String, Vec<(NaiveDate, Decimal)>> {
        use crate::activities::activities_constants::ACTIVITY_TYPE_SPLIT;
        let mut split_factors: HashMap<String, Vec<(NaiveDate, Decimal)>> = HashMap::new();

        for activity in activities.iter().filter(|a| {
            a.activity_type == ACTIVITY_TYPE_SPLIT
                && a.activity_date.naive_utc().date() >= start_date
                && a.activity_date.naive_utc().date() <= end_date
        }) {
           let split_ratio = activity.amount.clone();
            split_factors
                .entry(activity.asset_id.clone())
                .or_default()
                .push((activity.activity_date.naive_utc().date(), split_ratio.unwrap_or_default()));
        }

        split_factors
    }

    fn adjust_activities_for_splits(
        &self,
        activities: &[Activity],
        split_factors: &HashMap<String, Vec<(NaiveDate, Decimal)>>,
    ) -> Vec<Activity> {
        use crate::activities::activities_constants::ACTIVITY_TYPE_SPLIT;
        let mut adjusted_activities = activities.to_vec();

        for (asset_id, splits) in split_factors {
            if splits.is_empty() {
                continue;
            }

            // Reverse the splits to apply future splits to past activities
            let mut future_splits = splits.clone();
            future_splits.sort_by(|a, b| b.0.cmp(&a.0)); // Sort in descending order

            for activity in adjusted_activities.iter_mut() {
                if activity.asset_id == *asset_id && activity.activity_type != ACTIVITY_TYPE_SPLIT {
                    let mut cumulative_factor = Decimal::ONE;

                    // Apply splits that occur after the activity date
                    for &(split_date, ref split_factor) in &future_splits {
                        if split_date > activity.activity_date.naive_utc().date() {
                            cumulative_factor = cumulative_factor * split_factor;
                        }
                    }

                    // Adjust quantity and unit price
            
                    activity.quantity = activity.quantity * cumulative_factor;
                    activity.unit_price = activity.unit_price / cumulative_factor;
                }
            }
        }

        adjusted_activities
    }

    /// Gets the amount for a cash activity, applying exchange rate and handling missing values
    fn get_amount(&self, activity: &Activity, exchange_rate: &Decimal) -> Decimal {
        match &activity.amount {
            Some(amt) => amt.clone() * exchange_rate,
            None => {
                warn!("Amount not provided for {} activity ID: {}, using zero", 
                      activity.activity_type, activity.id);
                Decimal::ZERO
            }
        }
    }

    fn process_activity(
        &self,
        activity: &Activity,
        holdings: &mut HashMap<String, Decimal>,
        cumulative_cash: &mut Decimal,
        net_deposit: &mut Decimal,
        book_cost: &mut Decimal,
        account_currency: &str,
        date: NaiveDate,
    ) {
        use crate::activities::ActivityType;
        use std::str::FromStr;

        // Get exchange rate if activity currency is different from account currency
        let exchange_rate = self.fx_service
            .get_exchange_rate_for_date(&activity.currency, account_currency, date)
            .unwrap_or(Decimal::ONE);

        let activity_fee = &activity.fee * &exchange_rate;
        
        // Parse the activity type string to enum
        let activity_type = match ActivityType::from_str(&activity.activity_type) {
            Ok(t) => t,
            Err(_e) => {
                warn!("Unknown activity type: {} for activity ID: {}, skipping processing", 
                      activity.activity_type, activity.id);
                return;
            }
        };

        match activity_type {
            ActivityType::Buy => {
                let quantity = activity.quantity.clone();
                let price = &activity.unit_price * &exchange_rate;
                let total_cost = &quantity * &price + &activity_fee;

                holdings
                    .entry(activity.asset_id.clone())
                    .and_modify(|e| *e += &quantity)
                    .or_insert(quantity);

                *cumulative_cash -= &total_cost;
                *book_cost += total_cost;
            }
            ActivityType::Sell => {
                let quantity = activity.quantity.clone();
                let quantity_clone = quantity.clone();
                let price = &activity.unit_price * &exchange_rate;
                let total_amount = &quantity * &price - &activity_fee;

                // Calculate the average cost per share before updating holdings
                let avg_cost_per_share = holdings
                    .get(&activity.asset_id)
                    .map(|h| &*book_cost / h)
                    .unwrap_or_default();

                holdings
                    .entry(activity.asset_id.clone())
                    .and_modify(|e| *e -= &quantity)
                    .or_insert(-quantity);

                *cumulative_cash += &total_amount;
                *book_cost -= &quantity_clone * &avg_cost_per_share;
            }
            ActivityType::TransferIn => {
                if activity.asset_id.starts_with("$CASH") {
                    // For cash transfers, get amount from the amount field
                    let amount = self.get_amount(activity, &exchange_rate);
                    
                    // For cash transfers, both cumulative_cash and net_deposit should include the full amount
                    *cumulative_cash += &amount - &activity_fee;
                    *net_deposit += &amount;
                } else {
                    // For backward compatibility, handle non-cash transfers as ADD_HOLDING
                    warn!("Using TransferIn for non-cash asset in history calculation. Consider using AddHolding instead for asset ID: {}", activity.asset_id);
                    let amount = &activity.quantity * &activity.unit_price * &exchange_rate;
                    *holdings
                        .entry(activity.asset_id.clone())
                        .or_insert(Decimal::ZERO) += &activity.quantity;
                    *book_cost += &amount;
                }
            }
            ActivityType::TransferOut => {
                if activity.asset_id.starts_with("$CASH") {
                    // For cash transfers, get amount from the amount field
                    let amount = self.get_amount(activity, &exchange_rate);
                    
                    // For cash transfers, both cumulative_cash and net_deposit should be reduced by the full amount
                    *cumulative_cash -= &amount + &activity_fee;
                    *net_deposit -= &amount;
                } else {
                    // For backward compatibility, handle non-cash transfers as REMOVE_HOLDING
                    warn!("Using TransferOut for non-cash asset in history calculation. Consider using RemoveHolding instead for asset ID: {}", activity.asset_id);
                    let quantity = &activity.quantity;
                    let old_quantity = holdings
                        .get(&activity.asset_id)
                        .cloned()
                        .unwrap_or_default();
                    if old_quantity != Decimal::ZERO {
                        let transfer_ratio = (quantity / &old_quantity).round_dp(6);
                        let adjustment = transfer_ratio * book_cost.clone();
                        *book_cost -= adjustment;
                    }
                    *holdings
                        .entry(activity.asset_id.clone())
                        .or_insert(Decimal::ZERO) -= quantity;
                }
            }
            ActivityType::AddHolding => {
                let amount = &activity.quantity * &activity.unit_price * &exchange_rate;
                *holdings
                    .entry(activity.asset_id.clone())
                    .or_insert(Decimal::ZERO) += &activity.quantity;
                *book_cost += &amount;
            }
            ActivityType::RemoveHolding => {
                let quantity = &activity.quantity;
                let old_quantity = holdings
                    .get(&activity.asset_id)
                    .cloned()
                    .unwrap_or_default();
                if old_quantity != Decimal::ZERO {
                    let transfer_ratio = (quantity / &old_quantity).round_dp(6);
                    let adjustment = transfer_ratio * book_cost.clone();
                    *book_cost -= adjustment;
                }
                *holdings
                    .entry(activity.asset_id.clone())
                    .or_insert(Decimal::ZERO) -= quantity;
            }
            ActivityType::Deposit => {
                // For deposits, get amount from the amount field
                let amount = self.get_amount(activity, &exchange_rate);
                
                *cumulative_cash += &amount - &activity_fee;
                *net_deposit += &amount;
            }
            ActivityType::Withdrawal => {
                // For withdrawals, get amount from the amount field
                let amount = self.get_amount(activity, &exchange_rate);
                
                *cumulative_cash -= &amount + &activity_fee;
                *net_deposit -= &amount;
            }
            ActivityType::Interest | ActivityType::Dividend => {
                // For interest and dividends, get amount from the amount field
                let amount = self.get_amount(activity, &exchange_rate);
                
                *cumulative_cash += &amount - &activity_fee;
            }
            ActivityType::Fee | ActivityType::Tax => {
                *cumulative_cash -= &activity_fee;
            }
          
            ActivityType::ConversionIn => {
                // For ConversionIn, get amount from the amount field
                let amount = self.get_amount(activity, &exchange_rate);
                
                // For ConversionIn, we're receiving currency from another account
                let total_amount = &amount - &activity_fee;
                *cumulative_cash += &total_amount;
                *net_deposit += &total_amount;
            }
            ActivityType::ConversionOut => {
                // For ConversionOut, get amount from the amount field
                let amount = self.get_amount(activity, &exchange_rate);
                
                // For ConversionOut, we're sending currency to another account
                let total_amount = &amount + &activity_fee;
                *cumulative_cash -= &total_amount;
                *net_deposit -= &total_amount;
            }
            _ => {}
        }

        // Remove holdings with zero quantity
        holdings.retain(|_, quantity| Self::is_quantity_significant(quantity));
    }

    fn calculate_holdings_value(
        &self,
        holdings: &HashMap<String, Decimal>,
        quotes: &Arc<HashMap<String, Vec<(NaiveDate, Quote)>>>,
        date: NaiveDate,
        account_currency: &str,
    ) -> (Decimal, Decimal, Decimal) {
        let mut holdings_value = Decimal::ZERO;
        let mut day_gain_value = Decimal::ZERO;
        let mut opening_market_value = Decimal::ZERO;

        for (asset_id, quantity) in holdings {
            if let Some(quote) = self.get_last_available_quote(asset_id, date, quotes) {
                let exchange_rate = self.fx_service
                    .get_exchange_rate_for_date(&quote.currency, account_currency, date)
                    .unwrap_or(Decimal::ONE);

                // No need to adjust quantity here, as it's already adjusted in process_activity
                let holding_value =
                    quantity * quote.close.clone() * &exchange_rate;
                let opening_value =
                    quantity * quote.open.clone() * &exchange_rate;
                let day_gain = quantity
                    * (quote.close.clone() - quote.open.clone())
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

    fn create_total_summary(&self, total_history: &[HistoryRecord]) -> HistorySummary {
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
}

#[async_trait]
impl HistoryServiceTrait for HistoryService {
    fn get_all_accounts_history(&self) -> Result<Vec<HistoryRecord>> {
        self.repository.get_all()
    }

    fn get_portfolio_history(
        &self,
        input_account_id: Option<&str>,
    ) -> Result<Vec<HistoryRecord>> {
        self.repository.get_by_account(input_account_id, None, None)
    }

    fn get_latest_account_history(
        &self,
        input_account_id: &str,
    ) -> Result<HistoryRecord> {
        self.repository.get_latest_by_account(input_account_id)
    }

    async fn calculate_historical_data(
        &self,
        accounts: &[Account],
        activities: &[Activity],
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>> {
        // Initialize FX service - Assuming FxServiceTrait has an async initialize method
        // If not, this might need to be handled differently (e.g., during construction)
        self.fx_service.initialize()?;
        let end_date = Utc::now().naive_utc().date();

        // Load and prepare all required data - Assuming MarketDataServiceTrait has get_all_historical_quotes
        let quotes = Arc::new(self.market_data_service.get_all_historical_quotes()?);
        let account_currencies = self.get_account_currencies(accounts)?;

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
            // Assuming HistoryRepositoryTrait has get_all_last_histories
            self.repository.get_all_last_histories(&accounts.iter().map(|a| a.id.clone()).collect::<Vec<_>>())?
        } else {
            HashMap::new()
        };

        let (start_dates, last_histories) = self.calculate_start_dates_and_last_histories(
            accounts,
            &account_activities,
            &all_last_histories,
            force_full_calculation,
        );

        // Parallel calculations might need adjustment if calculate_account_history becomes async
        // For now, keeping it synchronous as in the original code, but this might need `async move` and `.await`
        let summaries_and_histories: Vec<_> = if accounts.len() > 10 {
            accounts.par_iter().map(|account| {
                self.calculate_account_history(
                    account,
                    &account_activities,
                    &quotes, // Pass Arc<Quotes> directly
                    &start_dates,
                    &last_histories,
                    end_date,
                    &account_currencies,
                )
            }).collect()
        } else {
            accounts.iter().map(|account| {
                 self.calculate_account_history(
                    account,
                    &account_activities,
                    &quotes, // Pass Arc<Quotes> directly
                    &start_dates,
                    &last_histories,
                    end_date,
                    &account_currencies,
                )
            }).collect()
        };

        let mut summaries: Vec<HistorySummary> = summaries_and_histories
            .iter()
            .map(|(summary, _)| summary.clone())
            .collect();

        let account_histories: Vec<HistoryRecord> = summaries_and_histories
            .into_iter()
            .flat_map(|(_, histories)| histories)
            .collect();

        if force_full_calculation {
            // Assuming HistoryRepositoryTrait has delete_by_accounts
            self.repository.delete_by_accounts(accounts)?;
        }

        // Assuming HistoryRepositoryTrait has save_batch
        self.repository.save_batch(&account_histories)?;

        // calculate_total_portfolio_history might need to become async if it uses async repo methods
        let total_history = self.calculate_total_portfolio_history()?; // Might need .await if changed

        // Assuming HistoryRepositoryTrait has save_batch
        self.repository.save_batch(&total_history)?;

        let total_summary = self.create_total_summary(&total_history);
        summaries.push(total_summary);

        Ok(summaries)
    }

    // Note: Helper methods like group_activities_by_account, get_account_currencies, etc.,
    // are kept in the impl HistoryService block as they are implementation details
    // and not part of the public trait contract unless explicitly needed.
}
