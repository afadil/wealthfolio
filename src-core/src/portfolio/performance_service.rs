use crate::errors::{self, Result as ServiceResult, ValidationError};
use crate::market_data::market_data_service::MarketDataService;
use crate::portfolio::history_repository::HistoryRepository;

use chrono::NaiveDate;
use log::info;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use rust_decimal::Decimal;
use rust_decimal::prelude::*;
use rust_decimal_macros::dec;
use rust_decimal::MathematicalOps;
use std::str::FromStr;
use num_traits::ToPrimitive;

/// Represents a single data point for cumulative returns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CumulativeReturn {
    pub date: NaiveDate,
    pub value: Decimal,
}

/// Represents a portfolio history record with date, total value, and net deposits
pub struct HistoryRecord {
    pub date: NaiveDate,
    pub total_value: Decimal,
    pub net_deposits: Decimal,
}

/// Method for calculating returns
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReturnMethod {
    /// Time-weighted return - adjusts for the timing and size of cash flows
    TimeWeighted,
    /// Money-weighted return - accounts for the size and timing of all cash flows
    MoneyWeighted,
}

impl Default for ReturnMethod {
    fn default() -> Self {
        ReturnMethod::TimeWeighted
    }
}

/// Single return data point with date and value
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnData {
    pub date: NaiveDate,
    pub value: Decimal,
}

/// API response structure for cumulative returns
#[derive(Debug, Serialize, Deserialize)]

#[serde(rename_all = "camelCase")]
pub struct CumulativeReturnsResponse {
    pub id: String,
    pub returns: Vec<ReturnData>,
    pub total_return: Decimal,
    pub annualized_return: Decimal,
    pub volatility: Decimal,
    pub max_drawdown: Decimal,
}

/// Service for calculating portfolio performance metrics
pub struct PerformanceService {
    history_repository: Arc<HistoryRepository>,
    market_data_service: Arc<MarketDataService>,
}

impl PerformanceService {
    /// Creates a new PerformanceService instance
    pub fn new(
        history_repository: Arc<HistoryRepository>,
        market_data_service: Arc<MarketDataService>,
    ) -> Self {
        Self {
            history_repository,
            market_data_service,
        }
    }

    /// Rounds a Decimal value to the specified number of decimal places
    fn round_decimal(value: &Decimal, places: u32) -> Decimal {
        value.round_dp(places)
    }

    /// Safely converts a string to a Decimal, returning zero if conversion fails
    fn parse_decimal(value: &str) -> Decimal {
        Decimal::from_str(value).unwrap_or_else(|_| Decimal::ZERO)
    }

    /// Calculates cumulative returns for a given item (account or symbol)
    pub async fn calculate_performance(
        &self,
        item_type: &str,
        item_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> ServiceResult<CumulativeReturnsResponse> {
        info!("Calculating returns for {} {} from {} to {}", item_type, item_id, start_date, end_date);
        match item_type {
            "account" => self.calculate_account_performance(item_id, start_date, end_date, ReturnMethod::TimeWeighted).await,
            "symbol" => self.calculate_symbol_performance(item_id, start_date, end_date).await,
            _ => Err(errors::Error::Validation(ValidationError::InvalidInput("Invalid item type".to_string()))),
        }
    }

    /// Calculates cumulative returns for an account
    pub async fn calculate_account_performance(
        &self,
        account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
        method: ReturnMethod,
    ) -> ServiceResult<CumulativeReturnsResponse> {
        let start_time = Instant::now();

        let portfolio_history = self.history_repository.get_by_account(Some(account_id))?;

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

        let mut returns = Vec::new();
        let mut daily_returns = Vec::new();

        // Handle empty history gracefully.
        if sorted_history.is_empty() {
            return Ok(CumulativeReturnsResponse {
                id: account_id.to_string(),
                returns: Vec::new(),
                total_return: dec!(0),
                annualized_return: dec!(0),
                volatility: dec!(0),
                max_drawdown: dec!(0),
            });
        }

        // Use helper method for conversion
        let mut prev_total_value =
            Self::parse_decimal(&sorted_history[0].1.total_value.to_string());
        let mut prev_net_deposit =
            Self::parse_decimal(&sorted_history[0].1.net_deposit.to_string());
        let mut cumulative_value = dec!(1);

        // Reuse these constants
        let one = dec!(1);
        let two = dec!(2);

        for (date, history) in sorted_history.iter() {
            // Use helper method for conversion
            let current_total_value = Self::parse_decimal(&history.total_value.to_string());
            let current_net_deposit = Self::parse_decimal(&history.net_deposit.to_string());

            // Avoid cloning by using references where possible
            let deposit_change = current_net_deposit - prev_net_deposit;

            // Calculate daily return based on the method
            let daily_return = match method {
                ReturnMethod::TimeWeighted => {
                    if prev_total_value.is_zero() {
                        dec!(0)
                    } else {
                        // Adjust for deposits/withdrawals
                        let adjusted_prev_value = prev_total_value + deposit_change;
                        if adjusted_prev_value.is_zero() {
                            dec!(0)
                        } else {
                            (current_total_value / adjusted_prev_value) - one
                        }
                    }
                }
                ReturnMethod::MoneyWeighted => {
                    // For money-weighted, we need to handle deposits differently
                    if prev_total_value.is_zero() {
                        dec!(0)
                    } else {
                        // If there was a deposit/withdrawal, use the midpoint formula
                        if !deposit_change.is_zero() {
                            let denominator = prev_total_value + (deposit_change / two);
                            if denominator.is_zero() {
                                dec!(0)
                            } else {
                                (current_total_value - prev_total_value - deposit_change) / denominator
                            }
                        } else {
                            // No deposit/withdrawal, simple return calculation
                            (current_total_value / prev_total_value) - one
                        }
                    }
                }
            };

            // Store daily return for volatility calculation
            daily_returns.push(daily_return);

            // Update cumulative return
            cumulative_value = cumulative_value * (one + daily_return);
            let cumulative_return_for_period = cumulative_value - one;

            returns.push(ReturnData {
                date: *date,
                value: Self::round_decimal(&cumulative_return_for_period, 6),
            });

            // Update previous values for next iteration
            prev_total_value = current_total_value;
            prev_net_deposit = current_net_deposit;
        }

        let total_return = returns.last().map(|r| r.value).unwrap_or(dec!(0));
        let annualized_return = Self::calculate_annualized_return(start_date, end_date, &total_return);
        
        // Calculate volatility and max drawdown
        let volatility = Self::calculate_volatility(&daily_returns);
        let max_drawdown = Self::calculate_max_drawdown(&returns);

        info!(
            "Account returns calculation completed in: {:.4} seconds with {} data points",
            start_time.elapsed().as_secs_f64(),
            returns.len()
        );

        Ok(CumulativeReturnsResponse {
            id: account_id.to_string(),
            returns,
            total_return,
            annualized_return,
            volatility,
            max_drawdown,
        })
    }

    /// Calculates cumulative returns for a symbol
    pub async fn calculate_symbol_performance(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> ServiceResult<CumulativeReturnsResponse> {
        let start_time = Instant::now();
        
        // Fetch historical quotes
        let quote_history = self
            .market_data_service
            .get_historical_quotes_from_provider(symbol, start_date, end_date)
            .await?;

        if quote_history.is_empty() {
            return Ok(CumulativeReturnsResponse {
                id: symbol.to_string(),
                returns: Vec::new(),
                total_return: dec!(0),
                annualized_return: dec!(0),
                volatility: dec!(0),
                max_drawdown: dec!(0),
            });
        }

        // Create quote map and fill missing dates
        let quote_map: HashMap<NaiveDate, Decimal> = quote_history
            .into_iter()
            .map(|quote| {
                let decimal_value = Decimal::from_str(&quote.close.to_string())
                    .unwrap_or(dec!(0));
                (quote.date.date(), decimal_value)
            })
            .collect();

        let mut filled_quotes = Vec::new();
        let mut current_date = start_date;
        let mut last_value: Option<Decimal> = None;

        // Pre-allocate with capacity
        filled_quotes.reserve((end_date - start_date).num_days() as usize + 1);

        while current_date <= end_date {
            match quote_map.get(&current_date) {
                Some(value) => {
                    filled_quotes.push((current_date, *value));
                    last_value = Some(*value);
                }
                None => {
                    if let Some(last) = last_value {
                        filled_quotes.push((current_date, last));
                    }
                }
            }
            current_date = current_date.succ_opt().unwrap_or(current_date);
        }

        // Calculate returns
        let mut returns = Vec::new();
        let mut daily_returns = Vec::new();
        returns.reserve(filled_quotes.len().saturating_sub(1));
        daily_returns.reserve(filled_quotes.len().saturating_sub(1));

        let mut cumulative_return = dec!(1);
        let one = dec!(1);
        
        for window in filled_quotes.windows(2) {
            let (_, prev_value) = window[0];
            let (curr_date, curr_value) = window[1];
            
            // Skip division if previous value is zero to avoid NaN
            let daily_return = if prev_value.is_zero() {
                dec!(0)
            } else {
                (curr_value / prev_value) - one
            };
            
            // Store daily return for volatility calculation
            daily_returns.push(daily_return);
            
            // Update cumulative return
            cumulative_return = cumulative_return * (one + daily_return);
            let cumulative_return_for_period = cumulative_return - one;
            
            returns.push(ReturnData {
                date: curr_date,
                value: Self::round_decimal(&cumulative_return_for_period, 6),
            });
        }

        let total_return = returns.last().map(|r| r.value).unwrap_or(dec!(0));
        let annualized_return = Self::calculate_annualized_return(start_date, end_date, &total_return);
        
        // Calculate volatility and max drawdown
        let volatility = Self::calculate_volatility(&daily_returns);
        let max_drawdown = Self::calculate_max_drawdown(&returns);
        
        info!(
            "Symbol returns calculation completed in: {:.4} seconds with {} data points",
            start_time.elapsed().as_secs_f64(),
            returns.len()
        );

        Ok(CumulativeReturnsResponse {
            id: symbol.to_string(),
            returns,
            total_return,
            annualized_return,
            volatility,
            max_drawdown,
        })
    }

    /// Calculates the annualized return from a total return over a period
    /// 
    /// Formula: (1 + total_return)^(1/years) - 1
    fn calculate_annualized_return(
        start_date: NaiveDate,
        end_date: NaiveDate,
        total_return: &Decimal,
    ) -> Decimal {
        // Handle edge cases and invalid inputs
        if total_return <= &dec!(-1) {
            return dec!(0); // Return 0 if total_return is -100% or worse.
        }

        let days = (end_date - start_date).num_days();
        if days <= 0 {
            return *total_return; // Return total_return if duration is zero or negative
        }

        // Convert days to years using Decimal
        let years = Decimal::from_i64(days).unwrap_or(dec!(1)) / dec!(365.25);
        if years < dec!(0.01) {
            // Avoid very small time periods.
            return *total_return;
        }

        let base = dec!(1) + total_return;
        
        // Using the mathematical identity: x^y = e^(y * ln(x))
        // Formula: (1 + total_return)^(1/years) - 1
        let exponent = dec!(1) / years;
        
        // Try using Decimal math first for higher precision
        if let Some(ln_base) = base.checked_ln() {
            let power = ln_base * exponent;
            
            if let Some(result) = power.checked_exp() {
                return Self::round_decimal(&(result - dec!(1)), 6);
            }
        }
        
        // Fall back to f64 if Decimal math fails
        if let (Some(base_f64), Some(years_f64)) = (base.to_f64(), years.to_f64()) {
            let exponent_f64 = 1.0 / years_f64;
            let result_f64 = base_f64.powf(exponent_f64) - 1.0;
            
            if let Some(result) = Decimal::from_f64(result_f64) {
                return Self::round_decimal(&result, 6);
            }
        }
        
        // Fallback if all calculations fail
        dec!(0)
    }

    /// Calculates the volatility (standard deviation of returns) annualized
    /// 
    /// Volatility is a measure of the dispersion of returns and is typically annualized
    /// Formula: Standard Deviation of Daily Returns * sqrt(trading days per year)
    fn calculate_volatility(daily_returns: &[Decimal]) -> Decimal {
        if daily_returns.is_empty() {
            return dec!(0);
        }

        // Calculate mean of daily returns
        let sum: Decimal = daily_returns.iter().sum();
        let count = Decimal::from(daily_returns.len());
        let mean = sum / count;

        // Calculate sum of squared differences
        let sum_squared_diff: Decimal = daily_returns
            .iter()
            .map(|&r| {
                let diff = r - mean;
                diff * diff
            })
            .sum();

        // Calculate variance
        let variance = if count > dec!(1) {
            sum_squared_diff / (count - dec!(1))
        } else {
            dec!(0)
        };

        // Calculate standard deviation (daily volatility)
        let daily_volatility = match variance.sqrt() {
            Some(value) => value,
            None => {
                // Fallback to f64 if Decimal sqrt fails
                if let Some(variance_f64) = variance.to_f64() {
                    let std_dev_f64 = variance_f64.sqrt();
                    Decimal::from_f64(std_dev_f64).unwrap_or(dec!(0))
                } else {
                    dec!(0)
                }
            }
        };

        // Annualize volatility (standard market practice: multiply by sqrt(252) for trading days)
        let trading_days_sqrt = match Decimal::from_str("15.87") { // sqrt(252) ≈ 15.87
            Ok(value) => value,
            Err(_) => dec!(15.87),
        };
        
        let annualized_volatility = daily_volatility * trading_days_sqrt;
        Self::round_decimal(&annualized_volatility, 6)
    }

    /// Calculates the maximum drawdown from a series of cumulative returns
    /// 
    /// Maximum drawdown measures the largest peak-to-trough decline in the value of a portfolio
    /// Formula: (Trough Value - Peak Value) / Peak Value
    fn calculate_max_drawdown(returns: &[ReturnData]) -> Decimal {
        if returns.is_empty() {
            return dec!(0);
        }

        let mut max_drawdown = dec!(0);
        let mut peak_value = dec!(1) + returns[0].value;

        for return_data in returns {
            let current_value = dec!(1) + return_data.value;
            
            // Update peak if we reach a new high
            if current_value > peak_value {
                peak_value = current_value;
            } 
            // Calculate drawdown if we're below the peak
            else if !peak_value.is_zero() {
                let drawdown = (peak_value - current_value) / peak_value;
                if drawdown > max_drawdown {
                    max_drawdown = drawdown;
                }
            }
        }

        Self::round_decimal(&max_drawdown, 6)
    }
}
