use crate::accounts::AccountService;
use crate::activities::ActivityService;
use crate::fx::fx_service::FxService;
use crate::market_data::market_data_service::MarketDataService;
use crate::models::{
    AccountSummary, CumulativeReturn, CumulativeReturns, HistorySummary, Holding, IncomeSummary, PortfolioHistory
};
use crate::errors::{Error, Result, ValidationError};

use diesel::r2d2::{Pool, ConnectionManager};
use diesel::sqlite::SqliteConnection;
use log::info;

use std::sync::Arc;

use crate::portfolio::history_service::HistoryService;
use crate::portfolio::holdings_service::HoldingsService;
use crate::portfolio::income_service::IncomeService;

use chrono::NaiveDate;
use std::collections::HashMap;


#[derive(Debug, Clone, Copy)]
pub enum ReturnMethod {
    TimeWeighted,
    MoneyWeighted,
}

impl Default for ReturnMethod {
    fn default() -> Self {
        ReturnMethod::TimeWeighted
    }
}

pub struct PortfolioService {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    account_service: Arc<AccountService>,
    activity_service: Arc<ActivityService>,
    market_data_service: Arc<MarketDataService>,
    income_service: Arc<IncomeService>,
    holdings_service: Arc<HoldingsService>,
    history_service: Arc<HistoryService>,
    base_currency: String,
}

impl PortfolioService {
    pub async fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, base_currency: String) -> Result<Self> {
        let base_currency = base_currency.clone();
        // Initialize services that require async initialization first
        let market_data_service = Arc::new(MarketDataService::new(pool.clone()).await?);
        let activity_service = Arc::new(ActivityService::new(pool.clone(), base_currency.clone()).await?);
        let holdings_service = Arc::new(HoldingsService::new(pool.clone(), base_currency.clone()).await?);

        // Initialize synchronous services
        let account_service = Arc::new(AccountService::new(pool.clone(), base_currency.clone()));
        let fx_service = FxService::new(pool.clone());
        let income_service = Arc::new(IncomeService::new(
            Arc::new(fx_service),
            base_currency.clone(),
        ));
        let history_service = Arc::new(HistoryService::new(
            pool.clone(),
            base_currency.clone(),
            FxService::new(pool.clone()),
            market_data_service.clone(),
        ));

        Ok(Self {
            pool,
            account_service,
            activity_service,
            market_data_service,
            income_service,
            holdings_service,
            history_service,
            base_currency,
        })
    }

    pub async fn compute_holdings(&self) -> Result<Vec<Holding>> {
        self.holdings_service.compute_holdings()
    }

    pub async fn calculate_historical_data(
        &self,
        account_ids: Option<Vec<String>>,
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>> {
        // First, sync quotes
        self.market_data_service
            .sync_all_quotes()
            .await?;

        let accounts = match &account_ids {
            Some(ids) => self.account_service.get_accounts_by_ids(ids)?,
            None => self.account_service.get_active_accounts()?,
        };

        let activities = match &account_ids {
            Some(ids) => self.activity_service.get_activities_by_account_ids(ids)?,
            None => self.activity_service.get_activities()?,
        };

        self.history_service
            .calculate_historical_data(&accounts, &activities, force_full_calculation)
            .await
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))
    }

    pub fn get_income_summary(&self) -> Result<Vec<IncomeSummary>> {
        let mut conn = self.pool.get()?;
        self.income_service.get_income_summary(&mut conn).map_err(Error::from)
    }

    pub async fn update_portfolio(&self) -> Result<Vec<HistorySummary>> {
        use std::time::Instant;
        let start = Instant::now();

        // Calculate historical data with specified performance mode
        let result = self.calculate_historical_data(None, false).await;

        let duration = start.elapsed();
        info!(
            "update_portfolio completed in: {:?} seconds",
            duration.as_secs_f64()
        );

        result
    }

    pub fn get_all_accounts_history(&self) -> Result<Vec<PortfolioHistory>> {
        self.history_service
            .get_all_accounts_history()
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))
    }

    pub fn get_portfolio_history(&self, account_id: Option<&str>) -> Result<Vec<PortfolioHistory>> {
        self.history_service
            .get_portfolio_history(account_id)
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))
    }

    pub fn get_accounts_summary(&self) -> Result<Vec<AccountSummary>> {
        let accounts = self.account_service.get_active_accounts()?;
        let mut account_summaries = Vec::new();

        // First, get the total portfolio value
        let total_portfolio_value = self
            .history_service
            .get_latest_account_history("TOTAL")
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))?
            .market_value;

        // Then, calculate the allocation percentage for each account
        for account in accounts {
            if let Ok(history) = self
                .history_service
                .get_latest_account_history(&account.id)
            {
                let allocation_percentage = if total_portfolio_value > 0.0 {
                    (history.market_value / total_portfolio_value) * 100.0
                } else {
                    0.0
                };

                account_summaries.push(AccountSummary {
                    account,
                    performance: PortfolioHistory {
                        allocation_percentage,
                        ..history
                    },
                });
            }
        }

        Ok(account_summaries)
    }

    pub fn calculate_account_cumulative_returns(
        &self,
        account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
        method: ReturnMethod,
    ) -> Result<CumulativeReturns> {
        let portfolio_history = self
            .history_service
            .get_portfolio_history(Some(account_id))
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))?;

        // Parse dates and filter history
        let mut sorted_history: Vec<_> = portfolio_history
            .iter()
            .filter_map(|h| {
                NaiveDate::parse_from_str(&h.date, "%Y-%m-%d")
                    .ok()
                    .filter(|date| date >= &start_date && date <= &end_date)
                    .map(|date| (date, h))
            })
            .collect();

        // Sort by parsed date
        sorted_history.sort_by_key(|(date, _)| *date);

        let mut cumulative_returns = Vec::new();

        if let Some((_, first_day)) = sorted_history.first() {
            let mut prev_total_value = first_day.total_value;
            let mut prev_net_deposit = first_day.net_deposit;

            for (date, history) in sorted_history.iter() {
                let deposit_change = history.net_deposit - prev_net_deposit;

                let period_return = match method {
                    ReturnMethod::TimeWeighted => {
                        if prev_total_value != 0.0 {
                            if deposit_change != 0.0 {
                                let adjusted_end_value = history.total_value - deposit_change;
                                (adjusted_end_value - prev_total_value) / prev_total_value
                            } else {
                                (history.total_value - prev_total_value) / prev_total_value
                            }
                        } else {
                            0.0
                        }
                    }
                    ReturnMethod::MoneyWeighted => {
                        let denominator = prev_total_value + (deposit_change / 2.0);
                        if denominator != 0.0 {
                            (history.total_value - prev_total_value - deposit_change) / denominator
                        } else {
                            0.0
                        }
                    }
                };

                cumulative_returns.push(CumulativeReturn {
                    date: date.format("%Y-%m-%d").to_string(),
                    value: period_return,
                });

                prev_total_value = history.total_value;
                prev_net_deposit = history.net_deposit;
            }

            // Calculate cumulative returns
            let mut cumulative_value = 1.0;
            for ret in cumulative_returns.iter_mut() {
                cumulative_value *= 1.0 + ret.value;
                ret.value = cumulative_value - 1.0;
            }
        }

        let total_return = cumulative_returns
            .last()
            .map(|ret| ret.value)
            .unwrap_or(0.0);

        let years = (end_date - start_date).num_days() as f64 / 365.25;
        let annualized_return =
            if !cumulative_returns.is_empty() && total_return > -1.0 && years > 0.0 {
                ((1.0 + total_return).powf(1.0 / years)) - 1.0
            } else {
                total_return
            };

        Ok(CumulativeReturns {
            id: account_id.to_string(),
            cumulative_returns,
            total_return,
            annualized_return,
        })
    }

    pub async fn calculate_symbol_cumulative_returns(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<CumulativeReturns> {
        let quote_history = self
            .market_data_service
            .get_symbol_history_from_provider(symbol, start_date, end_date)
            .await
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))?;

        // Create a complete date range
        let mut all_dates: Vec<NaiveDate> = Vec::new();
        let mut current_date = start_date;
        while current_date <= end_date {
            all_dates.push(current_date);
            current_date = current_date.succ_opt().unwrap();
        }

        // Create a map of existing quotes
        let quote_map: HashMap<NaiveDate, f64> = quote_history
            .iter()
            .map(|quote| (quote.date.date(), quote.close))
            .collect();

        // Fill in missing dates with interpolated values
        let mut filled_quotes: Vec<(NaiveDate, f64)> = Vec::with_capacity(all_dates.len());
        let mut last_value = None;

        for date in all_dates {
            if let Some(&value) = quote_map.get(&date) {
                filled_quotes.push((date, value));
                last_value = Some(value);
            } else if let Some(last) = last_value {
                // Use last known value for missing dates
                filled_quotes.push((date, last));
            }
        }

        // Calculate returns
        let mut symbol_returns = Vec::new();
        let mut prev_value = None;

        for (date, value) in filled_quotes {
            if let Some(prev) = prev_value {
                let daily_return = (value / prev) - 1.0;
                symbol_returns.push((date, daily_return));
            }
            prev_value = Some(value);
        }

        let mut cumulative_returns = Vec::new();
        let mut total_return = 1.0;

        for (date, return_value) in symbol_returns {
            total_return *= 1.0 + return_value;
            cumulative_returns.push(CumulativeReturn {
                date: date.format("%Y-%m-%d").to_string(),
                value: total_return - 1.0,
            });
        }

        let total_return = if !cumulative_returns.is_empty() {
            cumulative_returns.last().unwrap().value
        } else {
            0.0
        };

        let annualized_return = if !cumulative_returns.is_empty() && total_return > -1.0 {
            let years = (end_date - start_date).num_days() as f64 / 365.25;
            if years > 0.0 {
                ((1.0 + total_return).powf(1.0 / years)) - 1.0
            } else {
                total_return
            }
        } else {
            0.0
        };

        Ok(CumulativeReturns {
            id: symbol.to_string(),
            cumulative_returns,
            total_return,
            annualized_return,
        })
    }

}
