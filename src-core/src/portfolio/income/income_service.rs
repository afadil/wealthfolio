use crate::constants::DISPLAY_DECIMAL_PRECISION;
use crate::{
    activities::{
        activities_model::IncomeData,
        activities_traits::ActivityRepositoryTrait,
    },
    Result,
};
use chrono::{Datelike, NaiveDate, Utc};

use super::{CashIncomeData, IncomeSummary};
use crate::fx::fx_traits::FxServiceTrait;
use log::{debug, error, warn};
use num_traits::Zero;
use rust_decimal::Decimal;
use std::sync::{Arc, RwLock};

// Define the trait for the income service
pub trait IncomeServiceTrait: Send + Sync {
    fn get_income_summary(&self) -> Result<Vec<IncomeSummary>>;
}

pub struct IncomeService {
    fx_service: Arc<dyn FxServiceTrait>,
    activity_repository: Arc<dyn ActivityRepositoryTrait>,
    base_currency: Arc<RwLock<String>>,
}

impl IncomeService {
    pub fn new(
        fx_service: Arc<dyn FxServiceTrait>,
        activity_repository: Arc<dyn ActivityRepositoryTrait>,
        base_currency: Arc<RwLock<String>>,
    ) -> Self {
        IncomeService {
            fx_service,
            activity_repository,
            base_currency,
        }
    }

    fn calculate_yoy_growth(current: Decimal, previous: Decimal) -> Decimal {
        if previous > Decimal::zero() {
            (current - previous) / previous
        } else {
            Decimal::zero()
        }
    }
}

// Implement the trait for IncomeService
impl IncomeServiceTrait for IncomeService {
    fn get_income_summary(&self) -> Result<Vec<IncomeSummary>> {
        debug!("Getting holistic income summary (investment + cash)...");

        let base_currency = self.base_currency.read().unwrap().clone();
        let current_date = Utc::now().naive_utc().date();
        let current_year = current_date.year();
        let last_year = current_year - 1;
        let two_years_ago = current_year - 2;
        let current_month = current_date.month();

        // Get oldest activity date for monthly average calculation
        let oldest_date = match self.activity_repository.get_first_activity_date_overall() {
            Ok(date) => date,
            Err(e) => {
                warn!("No activities found for income calculation: {:?}", e);
                return Ok(Vec::new());
            }
        };

        let mut months_since_first_transaction: i32 =
            (current_date.year() - oldest_date.year()) * 12;
        months_since_first_transaction = months_since_first_transaction
            + current_date.month() as i32
            - oldest_date.month() as i32;

        let mut months_in_last_year: i32 = 12;
        if oldest_date.year() >= current_year - 1 {
            months_in_last_year = 13 - oldest_date.month() as i32
        }

        let mut months_two_years_ago: i32 = 12;
        if oldest_date.year() >= current_year - 2 {
            months_two_years_ago = 13 - oldest_date.month() as i32
        }

        // Initialize summaries for each period
        let mut total_summary = IncomeSummary::new("TOTAL", base_currency.clone());
        let mut ytd_summary = IncomeSummary::new("YTD", base_currency.clone());
        let mut last_year_summary = IncomeSummary::new("LAST_YEAR", base_currency.clone());
        let mut two_years_ago_summary = IncomeSummary::new("TWO_YEARS_AGO", base_currency.clone());

        // Process investment income (dividends, interest, etc.)
        let investment_activities = self.activity_repository.get_income_activities_data().unwrap_or_default();
        for activity in &investment_activities {
            if let Some((date, converted_amount, activity_copy)) = self.process_investment_income(activity, &base_currency) {
                total_summary.add_income(&activity_copy, converted_amount.clone());

                if date.year() == current_year {
                    ytd_summary.add_income(&activity_copy, converted_amount.clone());
                } else if date.year() == last_year {
                    last_year_summary.add_income(&activity_copy, converted_amount.clone());
                } else if date.year() == two_years_ago {
                    two_years_ago_summary.add_income(&activity_copy, converted_amount.clone());
                }
            }
        }

        // Process cash income (deposits with income categories)
        let cash_activities = self.activity_repository.get_cash_income_activities_data().unwrap_or_default();
        for activity in &cash_activities {
            if let Some((date, converted_amount, activity_copy)) = self.process_cash_income(activity, &base_currency) {
                total_summary.add_cash_income(&activity_copy, converted_amount.clone());

                if date.year() == current_year {
                    ytd_summary.add_cash_income(&activity_copy, converted_amount.clone());
                } else if date.year() == last_year {
                    last_year_summary.add_cash_income(&activity_copy, converted_amount.clone());
                } else if date.year() == two_years_ago {
                    two_years_ago_summary.add_cash_income(&activity_copy, converted_amount.clone());
                }
            }
        }

        total_summary.calculate_monthly_average(Some(months_since_first_transaction as u32));
        ytd_summary.calculate_monthly_average(Some(current_month));
        last_year_summary.calculate_monthly_average(Some(months_in_last_year as u32));
        two_years_ago_summary.calculate_monthly_average(Some(months_two_years_ago as u32));

        // Calculate source type breakdowns
        total_summary.calculate_source_type_breakdown();
        ytd_summary.calculate_source_type_breakdown();
        last_year_summary.calculate_source_type_breakdown();
        two_years_ago_summary.calculate_source_type_breakdown();

        // Calculate Year-over-Year Growth
        let ytd_yoy_growth = IncomeService::calculate_yoy_growth(
            ytd_summary.total_income,
            last_year_summary.total_income,
        );
        let last_year_yoy_growth = IncomeService::calculate_yoy_growth(
            last_year_summary.total_income,
            two_years_ago_summary.total_income,
        );

        ytd_summary.yoy_growth = Some(ytd_yoy_growth);
        last_year_summary.yoy_growth = Some(last_year_yoy_growth);
        two_years_ago_summary.yoy_growth = None;

        // Round and return
        let summaries = vec![
            total_summary,
            ytd_summary,
            last_year_summary,
            two_years_ago_summary,
        ];

        let rounded_summaries = summaries
            .into_iter()
            .map(|mut summary| {
                summary.total_income = summary.total_income.round_dp(DISPLAY_DECIMAL_PRECISION);
                summary.investment_income = summary.investment_income.round_dp(DISPLAY_DECIMAL_PRECISION);
                summary.cash_income = summary.cash_income.round_dp(DISPLAY_DECIMAL_PRECISION);
                summary.capital_gains = summary.capital_gains.round_dp(DISPLAY_DECIMAL_PRECISION);
                summary.monthly_average = summary.monthly_average.round_dp(DISPLAY_DECIMAL_PRECISION);

                if let Some(growth) = summary.yoy_growth {
                    summary.yoy_growth = Some(growth.round_dp(DISPLAY_DECIMAL_PRECISION));
                }

                for val in summary.by_month.values_mut() {
                    *val = val.round_dp(DISPLAY_DECIMAL_PRECISION);
                }
                for val in summary.by_type.values_mut() {
                    *val = val.round_dp(DISPLAY_DECIMAL_PRECISION);
                }
                for val in summary.by_symbol.values_mut() {
                    *val = val.round_dp(DISPLAY_DECIMAL_PRECISION);
                }
                for val in summary.by_currency.values_mut() {
                    *val = val.round_dp(DISPLAY_DECIMAL_PRECISION);
                }

                // Round source type breakdown
                for source in summary.by_source_type.iter_mut() {
                    source.amount = source.amount.round_dp(DISPLAY_DECIMAL_PRECISION);
                    source.percentage = source.percentage.round_dp(DISPLAY_DECIMAL_PRECISION);
                }

                summary
            })
            .collect();

        debug!("Holistic income summary calculation completed successfully");
        Ok(rounded_summaries)
    }
}

impl IncomeService {
    /// Process investment income activity and return parsed date, converted amount, and activity copy
    fn process_investment_income(
        &self,
        activity: &IncomeData,
        base_currency: &str,
    ) -> Option<(NaiveDate, Decimal, IncomeData)> {
        let date = match NaiveDate::parse_from_str(&format!("{}-01", activity.date), "%Y-%m-%d") {
            Ok(d) => d,
            Err(e) => {
                error!("Error parsing investment income date {}: {:?}", activity.date, e);
                return None;
            }
        };

        let converted_amount = match self.fx_service.convert_currency(
            activity.amount.clone(),
            &activity.currency,
            base_currency,
        ) {
            Ok(amount) => amount,
            Err(e) => {
                error!("Error converting investment income currency: {:?}", e);
                activity.amount.clone()
            }
        };

        let activity_copy = IncomeData {
            date: activity.date.clone(),
            income_type: activity.income_type.clone(),
            symbol: activity.symbol.clone(),
            symbol_name: activity.symbol_name.clone(),
            currency: activity.currency.clone(),
            amount: activity.amount.clone(),
        };

        Some((date, converted_amount, activity_copy))
    }

    /// Process cash income activity and return parsed date, converted amount, and activity copy
    fn process_cash_income(
        &self,
        activity: &CashIncomeData,
        base_currency: &str,
    ) -> Option<(NaiveDate, Decimal, CashIncomeData)> {
        let date = match NaiveDate::parse_from_str(&format!("{}-01", activity.date), "%Y-%m-%d") {
            Ok(d) => d,
            Err(e) => {
                error!("Error parsing cash income date {}: {:?}", activity.date, e);
                return None;
            }
        };

        let converted_amount = match self.fx_service.convert_currency(
            activity.amount.clone(),
            &activity.currency,
            base_currency,
        ) {
            Ok(amount) => amount,
            Err(e) => {
                error!("Error converting cash income currency: {:?}", e);
                activity.amount.clone()
            }
        };

        Some((date, converted_amount, activity.clone()))
    }
}
