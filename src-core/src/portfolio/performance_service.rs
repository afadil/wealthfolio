use crate::errors::{self, Result as ServiceResult, ValidationError};
use crate::market_data::market_data_service::MarketDataService;
use crate::portfolio::history_repository::HistoryRepository;

use chrono::NaiveDate;
use diesel::r2d2::ConnectionManager;
use diesel::SqliteConnection;
use r2d2::Pool;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use rust_decimal::Decimal;
use rust_decimal::MathematicalOps;
use rust_decimal_macros::dec;
use log::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CumulativeReturn {
    pub date: NaiveDate,
    #[serde(with = "rust_decimal::serde::str")]
    pub value: Decimal,
}


#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReturnMethod {
    TimeWeighted,
    MoneyWeighted,
}

impl Default for ReturnMethod {
    fn default() -> Self {
        ReturnMethod::TimeWeighted
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReturnData {
    pub date: NaiveDate,
    #[serde(with = "rust_decimal::serde::str")]
    pub value: Decimal,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceResponse {
    pub id: String,
    pub returns: Vec<ReturnData>,
    #[serde(with = "rust_decimal::serde::str")]
    pub total_return: Decimal,
    #[serde(with = "rust_decimal::serde::str")]
    pub annualized_return: Decimal,
    #[serde(with = "rust_decimal::serde::str")]
    pub volatility: Decimal,
    #[serde(with = "rust_decimal::serde::str")]
    pub max_drawdown: Decimal,
}

pub struct PerformanceService {
    history_repository: Arc<HistoryRepository>,
    market_data_service: Arc<MarketDataService>,
}

const TRADING_DAYS_PER_YEAR: u32 = 252;
const DAYS_PER_YEAR_DECIMAL: Decimal = dec!(365.25);
const SQRT_TRADING_DAYS_APPROX: Decimal = dec!(15.874507866); // sqrt(252)
const DECIMAL_PRECISION: u32 = 6;

impl PerformanceService {
    pub async fn new(
        pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    ) -> ServiceResult<Self> {
        let history_repository = Arc::new(HistoryRepository::new(pool.clone()));
        let market_data_service = Arc::new(MarketDataService::new(pool).await?);

        Ok(Self {
            history_repository,
            market_data_service,
        })
    }

    /// Calculates cumulative returns for a given item (account or symbol)
    pub async fn calculate_performance(
        &self,
        item_type: &str,
        item_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> ServiceResult<PerformanceResponse> {
        match item_type {
            "account" => {
                self.calculate_account_performance(
                    item_id,
                    start_date,
                    end_date,
                    ReturnMethod::TimeWeighted,
                )
                .await
            }
            "symbol" => {
                self.calculate_symbol_performance(item_id, start_date, end_date)
                    .await
            }
            _ => Err(errors::Error::Validation(ValidationError::InvalidInput(
                "Invalid item type".to_string(),
            ))),
        }
    }

    /// Internal function for calculating account performance (Refactored Logic)
    async fn calculate_account_performance(
        &self,
        account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
        method: ReturnMethod,
    ) -> ServiceResult<PerformanceResponse> {
        if start_date > end_date {
            return Err(errors::Error::Validation(ValidationError::InvalidInput(
                "Start date must be before end date".to_string(),
            )));
        }

        let full_history = self.history_repository.get_by_account(Some(account_id), Some(start_date), Some(end_date))?;

        // The repository already returns history sorted by date, so we can use it directly
        // We just need to ensure we have enough data points
        if full_history.len() < 2 {
            return Ok(PerformanceService::empty_response(account_id));
        }

        let capacity = full_history.len();  
        let mut returns = Vec::with_capacity(capacity);
        let mut daily_returns = Vec::with_capacity(capacity - 1);

        // Add initial point with zero value at the start date
        let first_date = NaiveDate::parse_from_str(&full_history[0].date, "%Y-%m-%d")
            .unwrap_or(NaiveDate::from_ymd_opt(1970, 1, 1).unwrap());
        
        // Add the initial zero point
        returns.push(ReturnData {
            date: first_date,
            value: Decimal::ZERO,
        });

        // Cache frequently used decimals
        let one = Decimal::ONE;
        let two = dec!(2.0);
        let mut cumulative_value = one;

        for window in full_history.windows(2) {
            let prev_point = &window[0];
            let curr_point = &window[1];

            // Validate values
            if prev_point.total_value.is_sign_negative() || curr_point.total_value.is_sign_negative() {
                return Err(errors::Error::Validation(ValidationError::InvalidInput(
                    "Negative values found in history records".to_string(),
                )));
            }

            let prev_total_value = prev_point.total_value;
            let prev_net_deposit = prev_point.net_deposit;
            let current_total_value = curr_point.total_value;
            let current_net_deposit = curr_point.net_deposit;

            let cash_flow = (current_net_deposit - prev_net_deposit).round_dp(DECIMAL_PRECISION);

            let period_return = match method {
                ReturnMethod::TimeWeighted => {
                    let denominator = (prev_total_value + cash_flow).round_dp(DECIMAL_PRECISION);
                    if denominator.is_zero() {
                        Decimal::ZERO
                    } else {
                        ((current_total_value / denominator) - one).round_dp(DECIMAL_PRECISION)
                    }
                }
                ReturnMethod::MoneyWeighted => {
                    let numerator = (current_total_value - prev_total_value - cash_flow).round_dp(DECIMAL_PRECISION);
                    let denominator = (prev_total_value + (cash_flow / two)).round_dp(DECIMAL_PRECISION);
                    if denominator.is_zero() {
                        Decimal::ZERO
                    } else {
                        (numerator / denominator).round_dp(DECIMAL_PRECISION)
                    }
                }
            };

            daily_returns.push(period_return);
            cumulative_value *= one + period_return;
            let cumulative_return_to_date = (cumulative_value - one).round_dp(DECIMAL_PRECISION);

            returns.push(ReturnData {
                date: NaiveDate::parse_from_str(&curr_point.date, "%Y-%m-%d")
                    .unwrap_or(NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()),
                value: cumulative_return_to_date,
            });
        }

        let total_return = returns.last().map_or(Decimal::ZERO, |r| r.value);
        let annualized_return =
            Self::calculate_annualized_return(start_date, end_date, total_return);
        let volatility = Self::calculate_volatility(&daily_returns);
        let max_drawdown = Self::calculate_max_drawdown(&daily_returns);

        let result = PerformanceResponse {
            id: account_id.to_string(),
            returns,
            total_return,
            annualized_return,
            volatility,
            max_drawdown,
        };

        Ok(result)
    }

    /// Internal function for calculating symbol performance (Refactored Logic)
    async fn calculate_symbol_performance(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> ServiceResult<PerformanceResponse> {
        if start_date > end_date {
            return Err(errors::Error::Validation(ValidationError::InvalidInput(
                "Start date must be before end date".to_string(),
            )));
        }

        let start_time = Instant::now();
        info!("Starting symbol performance calculation for symbol={}, start_date={}, end_date={}", 
            symbol, start_date, end_date);

        let mut fetch_start_date = start_date;
        let quote_history = self
            .market_data_service
            .get_historical_quotes_from_provider(symbol, fetch_start_date, end_date)
            .await?;

        let quote_map: HashMap<NaiveDate, Decimal> = quote_history
            .into_iter()
            .map(|quote| (quote.date.date(), quote.close.round_dp(DECIMAL_PRECISION)))
            .collect();

        let mut prev_price = match quote_map.get(&fetch_start_date).copied() {
            Some(price) => price,
            None => {
                let first_price = loop {
                    if fetch_start_date >= end_date {
                        if !quote_map.contains_key(&end_date) {
                            return Ok(PerformanceService::empty_response(symbol));
                        }
                        break *quote_map.get(&fetch_start_date).unwrap();
                    }

                    if let (Some(p1), Some(_p2)) = (
                        quote_map.get(&fetch_start_date),
                        quote_map.get(&fetch_start_date.succ_opt().unwrap_or(end_date)),
                    ) {
                        break *p1;
                    }
                    fetch_start_date = fetch_start_date.succ_opt().unwrap_or(end_date);
                };
                first_price
            }
        };

        let capacity = (end_date - start_date).num_days().max(0) as usize + 1;
        let mut returns = Vec::with_capacity(capacity);
        let mut daily_returns = Vec::with_capacity(capacity);
        let mut cumulative_value = Decimal::ONE;
        let mut current_date = start_date;
        let mut last_known_price = prev_price;

        while current_date <= end_date {
            let current_price = match quote_map.get(&current_date) {
                Some(price) => {
                    last_known_price = *price;
                    *price
                }
                None => last_known_price,
            };

            let daily_return = if prev_price.is_zero() {
                Decimal::ZERO
            } else {
                ((current_price / prev_price) - Decimal::ONE).round_dp(DECIMAL_PRECISION)
            };
            daily_returns.push(daily_return);
            cumulative_value *= Decimal::ONE + daily_return;
            let cumulative_return_to_date = (cumulative_value - Decimal::ONE).round_dp(DECIMAL_PRECISION);

            returns.push(ReturnData {
                date: current_date,
                value: cumulative_return_to_date,
            });

            prev_price = current_price;
            if let Some(next_date) = current_date.succ_opt() {
                current_date = next_date;
            } else {
                break;
            }
        }

        if returns.is_empty() {
            return Ok(PerformanceService::empty_response(symbol));
        }

        let total_return = returns.last().map_or(Decimal::ZERO, |r| r.value);
        let annualized_return =
            Self::calculate_annualized_return(start_date, end_date, total_return);
        let volatility = Self::calculate_volatility(&daily_returns);
        let max_drawdown = Self::calculate_max_drawdown(&daily_returns);

        let result = PerformanceResponse {
            id: symbol.to_string(),
            returns,
            total_return,
            annualized_return,
            volatility,
            max_drawdown,
        };

        let duration = start_time.elapsed();
        info!("Completed symbol performance calculation for symbol={} in {:?}", symbol, duration);
        Ok(result)
    }

    fn empty_response(id: &str) -> PerformanceResponse {
        PerformanceResponse {
            id: id.to_string(),
            returns: Vec::new(),
            total_return: Decimal::ZERO,
            annualized_return: Decimal::ZERO,
            volatility: Decimal::ZERO,
            max_drawdown: Decimal::ZERO,
        }
    }

    // --- Calculation Helper Functions (Unchanged logic, only rounding and constants) ---

    /// Calculates the annualized return from a total return over a period.
    fn calculate_annualized_return(
        start_date: NaiveDate,
        end_date: NaiveDate,
        total_return: Decimal,
    ) -> Decimal {
        if start_date > end_date {
            return Decimal::ZERO;
        }

        if total_return <= dec!(-1.0) {
            return Decimal::ZERO.round_dp(DECIMAL_PRECISION);
        }

        let days = (end_date - start_date).num_days();
        if days <= 0 {
            return total_return.round_dp(DECIMAL_PRECISION);
        }

        let years = (Decimal::from(days) / DAYS_PER_YEAR_DECIMAL).round_dp(DECIMAL_PRECISION);
        if years < dec!(0.01) {
            return total_return.round_dp(DECIMAL_PRECISION);
        }

        let base = (Decimal::ONE + total_return).round_dp(DECIMAL_PRECISION);
        if base <= Decimal::ZERO {
            return Decimal::ZERO.round_dp(DECIMAL_PRECISION);
        }

        let exponent = (Decimal::ONE / years).round_dp(DECIMAL_PRECISION);
        let ln_base = base.ln();
        let ln_times_exp = (ln_base * exponent).round_dp(DECIMAL_PRECISION);
        let annualized_factor = ln_times_exp.exp();
        (annualized_factor - Decimal::ONE).round_dp(DECIMAL_PRECISION)
    }

    /// Calculates the annualized volatility (sample standard deviation of daily returns).
    fn calculate_volatility(daily_returns: &[Decimal]) -> Decimal {
        if daily_returns.len() < 2 {
            return Decimal::ZERO;
        }

        let count = Decimal::from(daily_returns.len());
        let sum: Decimal = daily_returns.iter().sum();
        let mean = (sum / count).round_dp(DECIMAL_PRECISION);

        let sum_squared_diff: Decimal = daily_returns
            .iter()
            .map(|&r| {
                let diff = (r - mean).round_dp(DECIMAL_PRECISION);
                diff * diff
            })
            .sum();

        let variance = (sum_squared_diff / (count - Decimal::ONE)).round_dp(DECIMAL_PRECISION);
        let daily_volatility = variance
            .sqrt()
            .unwrap_or_else(|| dec!(0.0))
            .round_dp(DECIMAL_PRECISION);

        let annualization_factor = Decimal::from(TRADING_DAYS_PER_YEAR)
            .sqrt()
            .unwrap_or_else(|| SQRT_TRADING_DAYS_APPROX)
            .round_dp(DECIMAL_PRECISION);

        (daily_volatility * annualization_factor).round_dp(DECIMAL_PRECISION)
    }

    fn calculate_max_drawdown(daily_returns: &[Decimal]) -> Decimal {
        if daily_returns.is_empty() {
            return Decimal::ZERO;
        }

        let mut cumulative_value = Decimal::ONE;
        let mut peak_value = Decimal::ONE;
        let mut max_drawdown = Decimal::ZERO;

        for &daily_return in daily_returns {
            cumulative_value *= (Decimal::ONE + daily_return.round_dp(DECIMAL_PRECISION))
                .round_dp(DECIMAL_PRECISION);
            peak_value = peak_value.max(cumulative_value);
            let drawdown = ((peak_value - cumulative_value) / peak_value)
                .round_dp(DECIMAL_PRECISION);
            max_drawdown = max_drawdown.max(drawdown);
        }

        max_drawdown.round_dp(DECIMAL_PRECISION)
    }
}
