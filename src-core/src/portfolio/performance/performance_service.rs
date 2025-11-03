use crate::constants::{DECIMAL_PRECISION, PORTFOLIO_TOTAL_ACCOUNT_ID};
use crate::errors::{self, Result, ValidationError};
use crate::market_data::MarketDataServiceTrait;
use crate::performance::ReturnData;
use crate::valuation::ValuationServiceTrait;

use async_trait::async_trait;
use chrono::{Duration, NaiveDate};
use std::collections::HashMap;
use std::sync::Arc;

use log::{debug, warn};
use rust_decimal::Decimal;
use rust_decimal::MathematicalOps;
use rust_decimal_macros::dec;

use super::{PerformanceMetrics, SimplePerformanceMetrics};
use crate::portfolio::valuation::DailyAccountValuation;

#[async_trait]
pub trait PerformanceServiceTrait: Send + Sync {
    async fn calculate_performance_history(
        &self,
        item_type: &str,
        item_id: &str,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<PerformanceMetrics>;

    async fn calculate_performance_summary(
        &self,
        item_type: &str,
        item_id: &str,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<PerformanceMetrics>;

    /// Calculates simple performance metrics (daily returns, cumulative returns, portfolio weights) for multiple accounts.
    /// This method efficiently fetches the latest and previous day's valuations in bulk to minimize database queries.
    /// Can be used for a single account by passing a slice with one ID.
    fn calculate_accounts_simple_performance(
        &self,
        account_ids: &[String],
    ) -> Result<Vec<SimplePerformanceMetrics>>;
}

pub struct PerformanceService {
    valuation_service: Arc<dyn ValuationServiceTrait + Send + Sync>,
    market_data_service: Arc<dyn MarketDataServiceTrait + Send + Sync>,
}

const TRADING_DAYS_PER_YEAR: u32 = 252;
const DAYS_PER_YEAR_DECIMAL: Decimal = dec!(365.25);
const SQRT_TRADING_DAYS_APPROX: Decimal = dec!(15.874507866); // sqrt(252)

impl PerformanceService {
    pub fn new(
        valuation_service: Arc<dyn ValuationServiceTrait + Send + Sync>,
        market_data_service: Arc<dyn MarketDataServiceTrait + Send + Sync>,
    ) -> Self {
        Self {
            valuation_service,
            market_data_service,
        }
    }

    fn get_account_boundary_data(
        &self,
        account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<(
        DailyAccountValuation,
        DailyAccountValuation,
        NaiveDate,
        NaiveDate,
        String,
    )> {
        let full_history = self.valuation_service.get_historical_valuations(
            account_id,
            start_date_opt,
            end_date_opt,
        )?;

        if full_history.len() < 2 {
            warn!(
                "Account '{}': Not enough history data ({} points). Cannot calculate performance.",
                account_id,
                full_history.len()
            );
            return Err(errors::Error::Calculation(
                errors::CalculatorError::Calculation(format!(
                    "Account '{}': Not enough history data ({} points).",
                    account_id,
                    full_history.len()
                )),
            ));
        }

        let start_point: DailyAccountValuation = full_history.first().unwrap().clone();
        let end_point: DailyAccountValuation = full_history.last().unwrap().clone();

        let actual_start_date = start_point.valuation_date;
        let actual_end_date = end_point.valuation_date;
        let currency = start_point.account_currency.clone();

        Ok((
            start_point,
            end_point,
            actual_start_date,
            actual_end_date,
            currency,
        ))
    }

    /// Internal function for calculating account performance (Full)
    async fn calculate_account_performance(
        &self,
        account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<PerformanceMetrics> {
        if let (Some(start), Some(end)) = (start_date_opt, end_date_opt) {
            if start > end {
                return Err(errors::Error::Validation(ValidationError::InvalidInput(
                    "Start date must be before end date".to_string(),
                )));
            }
        }

        let full_history = self.valuation_service.get_historical_valuations(
            account_id,
            start_date_opt,
            end_date_opt,
        )?;

        if full_history.len() < 2 {
            warn!("Performance calculation for account '{}': Not enough valuation data ({} points). Returning empty response.", account_id, full_history.len());
            return Ok(PerformanceService::empty_response(account_id));
        }

        let start_point: &DailyAccountValuation = full_history.first().unwrap();
        let end_point: &DailyAccountValuation = full_history.last().unwrap();
        let actual_start_date = start_point.valuation_date;
        let actual_end_date = end_point.valuation_date;
        let currency = start_point.account_currency.clone();

        let capacity = full_history.len();
        let mut returns = Vec::with_capacity(capacity);
        let mut daily_twr_returns = Vec::with_capacity(capacity - 1);

        returns.push(ReturnData {
            date: actual_start_date,
            value: Decimal::ZERO,
        });

        let one = Decimal::ONE;
        let two = dec!(2.0);
        let mut cumulative_twr_value = one;
        let mut cumulative_mwr_value = one;

        for window in full_history.windows(2) {
            let prev_point = &window[0];
            let curr_point = &window[1];

            if prev_point.total_value.is_sign_negative()
                || curr_point.total_value.is_sign_negative()
            {
                return Err(errors::Error::Validation(ValidationError::InvalidInput(
                    "Negative total value found in valuation history records".to_string(),
                )));
            }

            let prev_total_value = prev_point.total_value;
            let prev_net_contribution = prev_point.net_contribution;
            let current_total_value = curr_point.total_value;
            let current_net_contribution = curr_point.net_contribution;

            let cash_flow = current_net_contribution - prev_net_contribution;

            let twr_period_return = {
                let denominator = prev_total_value + cash_flow;
                if denominator.is_zero() {
                    Decimal::ZERO
                } else {
                    (current_total_value / denominator) - one
                }
            };

            let mwr_period_return = {
                let numerator = current_total_value - prev_total_value - cash_flow;
                let denominator = prev_total_value + (cash_flow / two);
                if denominator.is_zero() {
                    Decimal::ZERO
                } else {
                    numerator / denominator
                }
            };

            daily_twr_returns.push(twr_period_return);
            cumulative_twr_value *= one + twr_period_return;
            cumulative_mwr_value *= one + mwr_period_return;

            let cumulative_twr_to_date = cumulative_twr_value - one;

            returns.push(ReturnData {
                date: curr_point.valuation_date,
                value: cumulative_twr_to_date.round_dp(DECIMAL_PRECISION),
            });
        }

        let cumulative_twr = returns.last().map_or(Decimal::ZERO, |r| r.value);
        let annualized_twr =
            Self::calculate_annualized_return(actual_start_date, actual_end_date, cumulative_twr);
        let volatility = Self::calculate_volatility(&daily_twr_returns);
        let max_drawdown = Self::calculate_max_drawdown(&daily_twr_returns);

        let start_net_contribution = start_point.net_contribution;
        let end_net_contribution = end_point.net_contribution;
        let net_cash_flow = end_net_contribution - start_net_contribution;

        let start_value_for_gain_calc = start_point.total_value;

        let gain_loss_amount = end_point.total_value - start_value_for_gain_calc - net_cash_flow;

        let simple_total_return = if start_value_for_gain_calc.is_zero() {
            // If the effective start value for gain calculation is zero, simple return is tricky.
            // If gain_loss_amount is also zero, return 0. Otherwise, it could be infinite or undefined.
            // For simplicity, returning 0 if gain_loss_amount is also 0, else could be an error or specific value.
            if gain_loss_amount.is_zero() {
                Decimal::ZERO
            } else {
                // Consider what to return if start_value_for_gain_calc is zero but gain_loss_amount is not.
                // This case implies infinite return or an anomaly. For now, returning zero to avoid division by zero error.
                // A more robust solution might be None or an error.
                warn!("Simple total return calculation: start_value_for_gain_calc is zero but gain_loss_amount is non-zero for account_id: {}. Returning 0.", account_id);
                Decimal::ZERO
            }
        } else {
            gain_loss_amount / start_value_for_gain_calc
        };

        let annualized_simple_return = Self::calculate_annualized_return(
            actual_start_date,
            actual_end_date,
            simple_total_return,
        );

        let cumulative_mwr = cumulative_mwr_value - one;
        let annualized_mwr =
            Self::calculate_annualized_return(actual_start_date, actual_end_date, cumulative_mwr);

        let result = PerformanceMetrics {
            id: account_id.to_string(),
            returns,
            period_start_date: Some(actual_start_date),
            period_end_date: Some(actual_end_date),
            currency,
            cumulative_twr: cumulative_twr.round_dp(DECIMAL_PRECISION),
            gain_loss_amount: Some(gain_loss_amount.round_dp(DECIMAL_PRECISION)),
            annualized_twr: annualized_twr.round_dp(DECIMAL_PRECISION),
            simple_return: simple_total_return.round_dp(DECIMAL_PRECISION),
            annualized_simple_return: annualized_simple_return.round_dp(DECIMAL_PRECISION),
            cumulative_mwr: cumulative_mwr.round_dp(DECIMAL_PRECISION),
            annualized_mwr: annualized_mwr.round_dp(DECIMAL_PRECISION),
            volatility: volatility.round_dp(DECIMAL_PRECISION),
            max_drawdown: max_drawdown.round_dp(DECIMAL_PRECISION),
        };

        Ok(result)
    }

    /// Internal function for calculating account performance (Summary)
    async fn calculate_account_performance_summary(
        &self,
        account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<PerformanceMetrics> {
        let (start_point, end_point, actual_start_date, actual_end_date, currency): (
            DailyAccountValuation,
            DailyAccountValuation,
            NaiveDate,
            NaiveDate,
            String,
        ) = self.get_account_boundary_data(account_id, start_date_opt, end_date_opt)?;

        let start_value = start_point.total_value;
        let end_value = end_point.total_value;
        let start_net_contribution = start_point.net_contribution;
        let end_net_contribution = end_point.net_contribution;
        let net_cash_flow = end_net_contribution - start_net_contribution;

        let gain_loss_amount = end_value - start_value - net_cash_flow;

        let simple_total_return = if start_value.is_zero() {
            if end_value == start_value && net_cash_flow.is_zero() {
                Decimal::ZERO
            } else {
                Decimal::ZERO
            }
        } else {
            (end_value - start_value - net_cash_flow) / start_value
        };

        let annualized_simple_return = Self::calculate_annualized_return(
            actual_start_date,
            actual_end_date,
            simple_total_return,
        );

        let result = PerformanceMetrics {
            id: account_id.to_string(),
            returns: Vec::new(),
            period_start_date: Some(actual_start_date),
            period_end_date: Some(actual_end_date),
            currency,
            cumulative_twr: Decimal::ZERO,
            gain_loss_amount: Some(gain_loss_amount.round_dp(DECIMAL_PRECISION)),
            annualized_twr: Decimal::ZERO,
            simple_return: simple_total_return.round_dp(DECIMAL_PRECISION),
            annualized_simple_return: annualized_simple_return.round_dp(DECIMAL_PRECISION),
            cumulative_mwr: Decimal::ZERO,
            annualized_mwr: Decimal::ZERO,
            volatility: Decimal::ZERO,
            max_drawdown: Decimal::ZERO,
        };

        Ok(result)
    }

    /// Internal function for calculating symbol performance (Full)
    async fn calculate_symbol_performance(
        &self,
        symbol: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<PerformanceMetrics> {
        let effective_end_date =
            end_date_opt.unwrap_or_else(|| chrono::Local::now().naive_local().date());
        let effective_start_date =
            start_date_opt.unwrap_or_else(|| effective_end_date - chrono::Duration::days(365));

        if effective_start_date > effective_end_date {
            return Err(errors::Error::Validation(ValidationError::InvalidInput(
                format!(
                    "Effective start date {} must be before effective end date {}",
                    effective_start_date, effective_end_date
                ),
            )));
        }

        let quote_history = self
            .market_data_service
            .get_historical_quotes_from_provider(symbol, effective_start_date, effective_end_date)
            .await?;

        if quote_history.is_empty() {
            warn!(
                "Symbol '{}': No quote data found between {} and {}. Returning empty response.",
                symbol, effective_start_date, effective_end_date
            );
            return Ok(PerformanceService::empty_response(symbol));
        }

        let actual_start_date = quote_history.first().unwrap().timestamp.date_naive();
        let actual_end_date = quote_history.last().unwrap().timestamp.date_naive();
        let currency = quote_history.first().unwrap().currency.clone();

        let quote_map: HashMap<NaiveDate, Decimal> = quote_history
            .into_iter()
            .map(|quote| {
                (
                    quote.timestamp.date_naive(),
                    quote.close.round_dp(DECIMAL_PRECISION),
                )
            })
            .collect();

        let mut current_loop_date = actual_start_date;
        let mut prev_price = Decimal::ZERO;
        let mut found_start_price = false;
        while current_loop_date <= actual_end_date {
            if let Some(price) = quote_map.get(&current_loop_date).copied() {
                prev_price = price;
                found_start_price = true;
                break;
            }
            if let Some(next_date) = current_loop_date.succ_opt() {
                current_loop_date = next_date;
            } else {
                break;
            }
        }

        if !found_start_price {
            warn!("Symbol '{}': Could not find starting price point within quote map. Returning empty response.", symbol);
            return Ok(PerformanceService::empty_response(symbol));
        }

        let capacity = (actual_end_date - actual_start_date).num_days().max(0) as usize + 1;
        let mut returns = Vec::with_capacity(capacity);
        let mut daily_returns = Vec::with_capacity(capacity);
        let mut cumulative_value = Decimal::ONE;
        let mut current_date = actual_start_date;
        let mut last_known_price = prev_price;

        while current_date <= actual_end_date {
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
                (current_price / prev_price) - Decimal::ONE
            };
            daily_returns.push(daily_return);
            cumulative_value *= Decimal::ONE + daily_return;
            let cumulative_return_to_date = cumulative_value - Decimal::ONE;

            returns.push(ReturnData {
                date: current_date,
                value: cumulative_return_to_date.round_dp(DECIMAL_PRECISION),
            });

            if let Some(price) = quote_map.get(&current_date) {
                prev_price = *price;
            }
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
            Self::calculate_annualized_return(actual_start_date, actual_end_date, total_return);
        let volatility = Self::calculate_volatility(&daily_returns);
        let max_drawdown = Self::calculate_max_drawdown(&daily_returns);

        let result = PerformanceMetrics {
            id: symbol.to_string(),
            returns,
            period_start_date: Some(actual_start_date),
            period_end_date: Some(actual_end_date),
            currency,
            cumulative_twr: total_return.round_dp(DECIMAL_PRECISION),
            gain_loss_amount: None,
            annualized_twr: annualized_return.round_dp(DECIMAL_PRECISION),
            simple_return: Decimal::ZERO,
            annualized_simple_return: Decimal::ZERO,
            cumulative_mwr: Decimal::ZERO,
            annualized_mwr: Decimal::ZERO,
            volatility: volatility.round_dp(DECIMAL_PRECISION),
            max_drawdown: max_drawdown.round_dp(DECIMAL_PRECISION),
        };

        Ok(result)
    }

    fn empty_response(id: &str) -> PerformanceMetrics {
        PerformanceMetrics {
            id: id.to_string(),
            returns: Vec::new(),
            period_start_date: None,
            period_end_date: None,
            currency: "".to_string(),
            cumulative_twr: Decimal::ZERO,
            gain_loss_amount: None,
            annualized_twr: Decimal::ZERO,
            simple_return: Decimal::ZERO,
            annualized_simple_return: Decimal::ZERO,
            cumulative_mwr: Decimal::ZERO,
            annualized_mwr: Decimal::ZERO,
            volatility: Decimal::ZERO,
            max_drawdown: Decimal::ZERO,
        }
    }

    fn calculate_annualized_return(
        start_date: NaiveDate,
        end_date: NaiveDate,
        total_return: Decimal,
    ) -> Decimal {
        if start_date > end_date {
            return Decimal::ZERO;
        }

        // If total_return is -100% or less, base would be 0 or negative.
        // powd might handle base = 0, but negative base for non-integer exponent is problematic.
        // Directly returning -1.0 (i.e., -100% loss) is a sensible cap.
        if total_return <= dec!(-1.0) {
            return dec!(-1.0);
        }

        let days = (end_date - start_date).num_days();

        if days <= 0 {
            return total_return;
        }

        let years = Decimal::from(days) / DAYS_PER_YEAR_DECIMAL;

        if years < Decimal::ONE {
            return total_return;
        }

        let base = Decimal::ONE + total_return;

        // This check is theoretically covered by `total_return <= dec!(-1.0)`,
        // but as a safeguard if `total_return` was just slightly above -1.0,
        // leading to `base` being zero or negative due to precision.
        if base <= Decimal::ZERO {
            return dec!(-1.0);
        }

        let exponent = Decimal::ONE / years;

        base.powd(exponent) - Decimal::ONE
    }

    fn calculate_volatility(daily_returns: &[Decimal]) -> Decimal {
        if daily_returns.len() < 2 {
            return Decimal::ZERO;
        }

        let count = Decimal::from(daily_returns.len());
        let sum: Decimal = daily_returns.iter().sum();
        let mean = sum / count;

        let sum_squared_diff: Decimal = daily_returns
            .iter()
            .map(|&r| {
                let diff = r - mean;
                diff * diff
            })
            .sum();

        let variance = sum_squared_diff / (count - Decimal::ONE);
        if variance.is_sign_negative() {
            return Decimal::ZERO;
        }

        let daily_volatility = variance.sqrt().unwrap_or(Decimal::ZERO);

        let annualization_factor = Decimal::from(TRADING_DAYS_PER_YEAR)
            .sqrt()
            .unwrap_or(SQRT_TRADING_DAYS_APPROX);

        daily_volatility * annualization_factor
    }

    fn calculate_max_drawdown(daily_returns: &[Decimal]) -> Decimal {
        if daily_returns.is_empty() {
            return Decimal::ZERO;
        }

        let mut cumulative_value = Decimal::ONE;
        let mut peak_value = Decimal::ONE;
        let mut max_drawdown = Decimal::ZERO;

        for &daily_return in daily_returns {
            cumulative_value *= Decimal::ONE + daily_return;
            peak_value = peak_value.max(cumulative_value);
            if peak_value.is_zero() {
                max_drawdown = max_drawdown.max(Decimal::ONE);
            } else {
                let drawdown = (peak_value - cumulative_value) / peak_value;
                max_drawdown = max_drawdown.max(drawdown);
            }
        }

        max_drawdown.max(Decimal::ZERO)
    }

    pub fn calculate_simple_performance(
        current: &DailyAccountValuation,
        previous: Option<&DailyAccountValuation>,
        total_portfolio_value_base: Option<Decimal>,
    ) -> SimplePerformanceMetrics {
        // Use self for the current valuation data
        let total_gain_loss_amount = current.total_value - current.net_contribution;
        let denominator_cumulative_return = current.net_contribution;
        let cumulative_return_percent = if !denominator_cumulative_return.is_zero() {
            Some((total_gain_loss_amount / denominator_cumulative_return).round_dp(4))
        } else {
            if total_gain_loss_amount.is_zero() {
                Some(Decimal::ZERO)
            } else {
                None
            }
        };

        let (day_gain_loss_amount, day_return_percent_mod_dietz) = if let Some(prev) = previous {
            let start_value = prev.total_value;
            let end_value = current.total_value;
            let cash_flow_day = current.net_contribution - prev.net_contribution;
            let gain_day = end_value - start_value - cash_flow_day;

            let denominator_mod_dietz = start_value + (Decimal::new(5, 1) * cash_flow_day);

            let percent_day_mod_dietz = if !denominator_mod_dietz.is_zero() {
                Some((gain_day / denominator_mod_dietz).round_dp(4))
            } else {
                if gain_day.is_zero() {
                    Some(Decimal::ZERO)
                } else {
                    None
                }
            };
            (Some(gain_day.round_dp(2)), percent_day_mod_dietz)
        } else {
            (None, None)
        };

        let total_value_base = current.total_value * current.fx_rate_to_base;
        let portfolio_weight = if let Some(total_portfolio) = total_portfolio_value_base {
            if !total_portfolio.is_zero() {
                Some(
                    (total_value_base / total_portfolio)
                        .max(Decimal::ZERO)
                        .min(Decimal::ONE)
                        .round_dp(4),
                )
            } else {
                if total_value_base.is_zero() {
                    Some(Decimal::ZERO)
                } else {
                    None
                }
            }
        } else {
            None
        };

        SimplePerformanceMetrics {
            account_id: current.account_id.clone(),
            total_value: Some(current.total_value),
            account_currency: Some(current.account_currency.clone()),
            base_currency: Some(current.base_currency.clone()),
            fx_rate_to_base: Some(current.fx_rate_to_base),
            total_gain_loss_amount: Some(total_gain_loss_amount.round_dp(2)),
            cumulative_return_percent,
            day_gain_loss_amount,
            day_return_percent_mod_dietz,
            portfolio_weight,
        }
    }
}

#[async_trait::async_trait]
impl PerformanceServiceTrait for PerformanceService {
    /// Calculates cumulative returns for a given item (account or symbol)
    async fn calculate_performance_history(
        &self,
        item_type: &str,
        item_id: &str,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<PerformanceMetrics> {
        match item_type {
            "account" => {
                self.calculate_account_performance(item_id, start_date, end_date)
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

    /// Calculates summary performance metrics only (no returns array, vol, maxDD)
    /// Currently only implemented for item_type = "account"
    async fn calculate_performance_summary(
        &self,
        item_type: &str,
        item_id: &str,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<PerformanceMetrics> {
        match item_type {
            "account" => {
                self.calculate_account_performance_summary(item_id, start_date, end_date)
                    .await
            }
            "symbol" => {
                warn!("Performance summary calculation is not supported for symbols. Returning empty response.");
                Ok(PerformanceService::empty_response(item_id))
            }
            _ => Err(errors::Error::Validation(ValidationError::InvalidInput(
                "Invalid item type".to_string(),
            ))),
        }
    }

    fn calculate_accounts_simple_performance(
        &self,
        account_ids: &[String],
    ) -> Result<Vec<SimplePerformanceMetrics>> {
        if account_ids.is_empty() {
            return Ok(Vec::new());
        }

        // Include "TOTAL" to get the total portfolio value reference date
        let mut ids_to_fetch = account_ids.to_vec();
        if !account_ids.contains(&PORTFOLIO_TOTAL_ACCOUNT_ID.to_string()) {
            ids_to_fetch.push(PORTFOLIO_TOTAL_ACCOUNT_ID.to_string());
        }

        // 1. Fetch the *absolute* latest record for each account
        let latest_daily_valuations = self
            .valuation_service
            .get_latest_valuations(&ids_to_fetch)?;

        let latest_daily_map: HashMap<String, DailyAccountValuation> = latest_daily_valuations
            .into_iter()
            .map(|d| (d.account_id.clone(), d))
            .collect();

        // 2. Determine the previous date for each account based on its absolute latest found date
        //    and group accounts by the previous date needed.
        let mut prev_dates_needed: HashMap<NaiveDate, Vec<String>> = HashMap::new();
        for account_id in account_ids {
            // Iterate over original requested IDs
            if let Some(latest_record) = latest_daily_map.get(account_id) {
                let prev_date = latest_record.valuation_date - Duration::days(1);
                prev_dates_needed
                    .entry(prev_date)
                    .or_default()
                    .push(account_id.clone());
            }
        }

        // 3. Fetch the previous day's records in bulk for all needed dates
        let mut previous_daily_map: HashMap<String, DailyAccountValuation> = HashMap::new();
        for (prev_date, ids) in prev_dates_needed {
            match self
                .valuation_service
                .get_valuations_on_date(&ids, prev_date)
            {
                Ok(records) => {
                    for record in records {
                        previous_daily_map.insert(record.account_id.clone(), record);
                    }
                }
                Err(e) => {
                    warn!(
                        "Failed to fetch valuation data for date {}: {}",
                        prev_date, e
                    );
                }
            }
        }

        // 4. Calculate total portfolio value using the absolute latest "TOTAL" valuation
        let total_portfolio_value_base = latest_daily_map
            .get(PORTFOLIO_TOTAL_ACCOUNT_ID)
            .map(|p| p.total_value * p.fx_rate_to_base);

        // 5. Construct results using the absolute latest and previous-to-latest records
        let mut results = Vec::with_capacity(account_ids.len());
        for account_id in account_ids {
            if let Some(current) = latest_daily_map.get(account_id) {
                let previous = previous_daily_map.get(account_id);
                let performance_metrics = Self::calculate_simple_performance(
                    current,
                    previous,
                    total_portfolio_value_base,
                );
                results.push(performance_metrics);
            } else {
                // This case might happen if history calculation failed or account is new
                debug!(
                    "No DailyAccountValuation found for account '{}' when fetching latest",
                    account_id
                );
            }
        }

        Ok(results)
    }
}
