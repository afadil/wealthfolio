use crate::constants::DISPLAY_DECIMAL_PRECISION;
use crate::{
    activities::{activities_errors::ActivityError, activities_traits::ActivityRepositoryTrait},
    Error, Result,
};
use chrono::{Datelike, NaiveDate, Utc};

use super::{SpendingData, SpendingSummary};
use crate::fx::fx_traits::FxServiceTrait;
use log::{debug, error};
use num_traits::Zero;
use rust_decimal::Decimal;
use std::sync::{Arc, RwLock};

/// Trait defining the contract for the spending service
pub trait SpendingServiceTrait: Send + Sync {
    fn get_spending_summary(&self) -> Result<Vec<SpendingSummary>>;
}

pub struct SpendingService {
    fx_service: Arc<dyn FxServiceTrait>,
    activity_repository: Arc<dyn ActivityRepositoryTrait>,
    base_currency: Arc<RwLock<String>>,
}

impl SpendingService {
    pub fn new(
        fx_service: Arc<dyn FxServiceTrait>,
        activity_repository: Arc<dyn ActivityRepositoryTrait>,
        base_currency: Arc<RwLock<String>>,
    ) -> Self {
        SpendingService {
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

impl SpendingServiceTrait for SpendingService {
    fn get_spending_summary(&self) -> Result<Vec<SpendingSummary>> {
        debug!("Getting spending summary...");

        let activities = match self.activity_repository.get_spending_activities_data() {
            Ok(activity) => activity,
            Err(e) => {
                error!("Error getting aggregated spending data: {:?}", e);
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

        let mut total_summary = SpendingSummary::new("TOTAL", base_currency.clone());
        let mut ytd_summary = SpendingSummary::new("YTD", base_currency.clone());
        let mut last_year_summary = SpendingSummary::new("LAST_YEAR", base_currency.clone());
        let mut two_years_ago_summary = SpendingSummary::new("TWO_YEARS_AGO", base_currency.clone());

        for activity in &activities {
            let date = match NaiveDate::parse_from_str(&format!("{}-01", activity.date), "%Y-%m-%d")
            {
                Ok(d) => d,
                Err(e) => {
                    error!("Error parsing date {}: {:?}", activity.date, e);
                    continue;
                }
            };

            let converted_amount = match self.fx_service.convert_currency(
                activity.amount.clone(),
                &activity.currency,
                &base_currency,
            ) {
                Ok(amount) => amount,
                Err(e) => {
                    error!("Error converting currency: {:?}", e);
                    activity.amount.clone()
                }
            };

            let activity_copy = SpendingData {
                date: activity.date.clone(),
                activity_type: activity.activity_type.clone(),
                category_id: activity.category_id.clone(),
                category_name: activity.category_name.clone(),
                category_color: activity.category_color.clone(),
                sub_category_id: activity.sub_category_id.clone(),
                sub_category_name: activity.sub_category_name.clone(),
                account_id: activity.account_id.clone(),
                account_name: activity.account_name.clone(),
                currency: activity.currency.clone(),
                amount: activity.amount.clone(),
                name: activity.name.clone(),
            };

            total_summary.add_spending(&activity_copy, converted_amount.clone());

            if date.year() == current_year {
                ytd_summary.add_spending(&activity_copy, converted_amount.clone());
            } else if date.year() == last_year {
                last_year_summary.add_spending(&activity_copy, converted_amount.clone());
            } else if date.year() == two_years_ago {
                two_years_ago_summary.add_spending(&activity_copy, converted_amount.clone());
            }
        }

        total_summary.calculate_monthly_average(Some(months_since_first_transaction as u32));
        ytd_summary.calculate_monthly_average(Some(current_month as u32));
        last_year_summary.calculate_monthly_average(Some(months_in_last_year as u32));
        two_years_ago_summary.calculate_monthly_average(Some(months_two_years_ago as u32));

        let ytd_yoy_growth = SpendingService::calculate_yoy_growth(
            ytd_summary.total_spending,
            last_year_summary.total_spending,
        );
        let last_year_yoy_growth = SpendingService::calculate_yoy_growth(
            last_year_summary.total_spending,
            two_years_ago_summary.total_spending,
        );

        ytd_summary.yoy_growth = Some(ytd_yoy_growth);
        last_year_summary.yoy_growth = Some(last_year_yoy_growth);
        two_years_ago_summary.yoy_growth = None;

        let summaries = vec![
            total_summary,
            ytd_summary,
            last_year_summary,
            two_years_ago_summary,
        ];

        let rounded_summaries = summaries
            .into_iter()
            .map(|mut summary| {
                summary.total_spending = summary.total_spending.round_dp(DISPLAY_DECIMAL_PRECISION);
                summary.monthly_average =
                    summary.monthly_average.round_dp(DISPLAY_DECIMAL_PRECISION);
                if let Some(growth) = summary.yoy_growth {
                    summary.yoy_growth = Some(growth.round_dp(DISPLAY_DECIMAL_PRECISION));
                }

                for val in summary.by_month.values_mut() {
                    *val = val.round_dp(DISPLAY_DECIMAL_PRECISION);
                }
                for cat in summary.by_category.values_mut() {
                    cat.amount = cat.amount.round_dp(DISPLAY_DECIMAL_PRECISION);
                }
                for subcat in summary.by_subcategory.values_mut() {
                    subcat.amount = subcat.amount.round_dp(DISPLAY_DECIMAL_PRECISION);
                }
                for val in summary.by_account.values_mut() {
                    *val = val.round_dp(DISPLAY_DECIMAL_PRECISION);
                }
                for month_map in summary.by_month_by_category.values_mut() {
                    for val in month_map.values_mut() {
                        *val = val.round_dp(DISPLAY_DECIMAL_PRECISION);
                    }
                }
                for month_map in summary.by_month_by_subcategory.values_mut() {
                    for val in month_map.values_mut() {
                        *val = val.round_dp(DISPLAY_DECIMAL_PRECISION);
                    }
                }
                summary
            })
            .collect();

        debug!("Spending summary calculation and rounding completed successfully");
        Ok(rounded_summaries)
    }
}
