use crate::{
    activities::{activities_errors::ActivityError, activities_model::IncomeData, activities_traits::ActivityRepositoryTrait}, Error, Result
};
use chrono::{Datelike, NaiveDate, Utc};
use crate::constants::DISPLAY_DECIMAL_PRECISION;

use log::{debug, error};
use num_traits::Zero;
use rust_decimal::Decimal;
use std::sync::{Arc, RwLock};
use crate::fx::fx_traits::FxServiceTrait;
use super::IncomeSummary;
// Define the trait for the income service
pub trait IncomeServiceTrait: Send + Sync {
    fn get_income_summary(
        &self,
    ) -> Result<Vec<IncomeSummary>>;
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
    fn get_income_summary(
        &self,
    ) -> Result<Vec<IncomeSummary>> {
        debug!("Getting income summary...");

        let activities = match self.activity_repository.get_income_activities_data() {
            Ok(activity) => activity,
            Err(e) => {
                error!("Error getting aggregated income data: {:?}", e);
                return Err(Error::Activity(ActivityError::InvalidData(e.to_string())));
            }
        };

        if activities.is_empty() {
            return Ok(Vec::new());
        }

        let base_currency = self.base_currency.read().unwrap().clone();
        let current_date = Utc::now().naive_utc().date();
        let current_year = current_date.year();
        let last_year = current_year - 1;
        let two_years_ago = current_year - 2;
        let current_month = current_date.month();

        let oldest_date = match self.activity_repository.get_first_activity_date_overall() {
            Ok(date) => date,
            Err(e) => {
                error!("Error getting first transaction date: {:?}", e);
                return Err(e);
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

        let mut total_summary = IncomeSummary::new("TOTAL", base_currency.clone());
        let mut ytd_summary = IncomeSummary::new("YTD", base_currency.clone());
        let mut last_year_summary = IncomeSummary::new("LAST_YEAR", base_currency.clone());
        let mut two_years_ago_summary = IncomeSummary::new("TWO_YEARS_AGO", base_currency.clone());


        for activity in activities {
            let date = match NaiveDate::parse_from_str(&format!("{}-01", activity.date), "%Y-%m-%d")
            {
                Ok(d) => d,
                Err(e) => {
                    error!("Error parsing date {}: {:?}", activity.date, e);
                    continue;
                }
            };

            // Correctly call methods on the FxService instance within the Arc
            let converted_amount = match self.fx_service.convert_currency(
                activity.amount.clone(),
                &activity.currency,
                &base_currency,
            ) {
                Ok(amount) => amount,
                Err(e) => {
                    error!("Error converting currency: {:?}", e);
                    // Consider if returning the original amount is the correct fallback
                    activity.amount.clone()
                }
            };

            // Create a copy of the activity with cloned fields to avoid ownership issues
            let activity_copy = IncomeData {
                date: activity.date.clone(),
                income_type: activity.income_type.clone(),
                symbol: activity.symbol.clone(),
                symbol_name: activity.symbol_name.clone(),
                currency: activity.currency.clone(),
                amount: activity.amount.clone(), // Keep original amount in activity_copy if needed elsewhere
            };

            total_summary.add_income(&activity_copy, converted_amount.clone());

            if date.year() == current_year {
                ytd_summary.add_income(&activity_copy, converted_amount.clone());
            } else if date.year() == last_year {
                last_year_summary.add_income(&activity_copy, converted_amount.clone());
            } else if date.year() == two_years_ago {
                two_years_ago_summary.add_income(&activity_copy, converted_amount.clone());
            }
        }

        total_summary.calculate_monthly_average(Some(months_since_first_transaction as u32));
        ytd_summary.calculate_monthly_average(Some(current_month as u32));
        last_year_summary.calculate_monthly_average(Some(months_in_last_year as u32));
        two_years_ago_summary.calculate_monthly_average(Some(months_two_years_ago as u32));

        // Calculate Year-over-Year Growth using the static helper method
        let ytd_yoy_growth =
            IncomeService::calculate_yoy_growth(ytd_summary.total_income, last_year_summary.total_income);
        let last_year_yoy_growth = IncomeService::calculate_yoy_growth(
            last_year_summary.total_income,
            two_years_ago_summary.total_income,
        );

        ytd_summary.yoy_growth = Some(ytd_yoy_growth);
        last_year_summary.yoy_growth = Some(last_year_yoy_growth);

        // Two years ago YoY growth can't be calculated without activity from three years ago
        two_years_ago_summary.yoy_growth = None;

        // Round the calculated values before returning
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
                summary
            })
            .collect();

        debug!("Income summary calculation and rounding completed successfully");
        Ok(rounded_summaries)
    }
}
