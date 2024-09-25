use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{IncomeData, IncomeSummary};
use chrono::{Datelike, NaiveDate, Utc};
use diesel::prelude::*;
use std::collections::HashSet;

pub struct IncomeService {
    fx_service: CurrencyExchangeService,
    base_currency: String,
}

impl IncomeService {
    pub fn new(fx_service: CurrencyExchangeService, base_currency: String) -> Self {
        IncomeService {
            fx_service,
            base_currency,
        }
    }

    fn get_aggregated_income_data(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<IncomeData>, diesel::result::Error> {
        diesel::sql_query(
            "SELECT strftime('%Y-%m', activity_date) as date,
             activity_type as income_type,
             asset_id as symbol,
             currency,
             SUM(quantity * unit_price) as amount
             FROM activities
             WHERE activity_type IN ('DIVIDEND', 'INTEREST', 'OTHER_INCOME')
             GROUP BY date, activity_type, asset_id, currency",
        )
        .load::<IncomeData>(conn)
    }

    fn calculate_yoy_growth(current: f64, previous: f64) -> f64 {
        if previous > 0.0 {
            ((current - previous) / previous) * 100.0
        } else {
            0.0
        }
    }

    pub fn get_income_summary(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<IncomeSummary>, diesel::result::Error> {
        let income_data = self.get_aggregated_income_data(conn)?;

        let base_currency = self.base_currency.clone();
        let current_date = Utc::now().naive_utc().date();
        let current_year = current_date.year();
        let last_year = current_year - 1;
        let two_years_ago = current_year - 2;

        let mut total_summary = IncomeSummary::new("TOTAL", base_currency.clone());
        let mut ytd_summary = IncomeSummary::new("YTD", base_currency.clone());
        let mut last_year_summary = IncomeSummary::new("LAST_YEAR", base_currency.clone());
        let mut two_years_ago_summary = IncomeSummary::new("TWO_YEARS_AGO", base_currency.clone());

        let mut ytd_months = HashSet::new();
        let mut last_year_months = HashSet::new();
        let mut two_years_ago_months = HashSet::new();

        for data in income_data {
            let date = NaiveDate::parse_from_str(&format!("{}-01", data.date), "%Y-%m-%d").unwrap();
            let converted_amount = self
                .fx_service
                .convert_currency(data.amount, &data.currency, &base_currency)
                .unwrap_or(data.amount);

            total_summary.add_income(&data, converted_amount);

            if date.year() == current_year {
                ytd_summary.add_income(&data, converted_amount);
                ytd_months.insert(date.format("%Y-%m").to_string());
            } else if date.year() == last_year {
                last_year_summary.add_income(&data, converted_amount);
                last_year_months.insert(date.format("%Y-%m").to_string());
            } else if date.year() == two_years_ago {
                two_years_ago_summary.add_income(&data, converted_amount);
                two_years_ago_months.insert(date.format("%Y-%m").to_string());
            }
        }

        total_summary.calculate_monthly_average(None);
        ytd_summary.calculate_monthly_average(Some(ytd_months.len() as f64));
        last_year_summary.calculate_monthly_average(Some(last_year_months.len() as f64));
        two_years_ago_summary.calculate_monthly_average(Some(two_years_ago_months.len() as f64));

        // Calculate Year-over-Year Growth
        let ytd_yoy_growth =
            Self::calculate_yoy_growth(ytd_summary.total_income, last_year_summary.total_income);
        let last_year_yoy_growth = Self::calculate_yoy_growth(
            last_year_summary.total_income,
            two_years_ago_summary.total_income,
        );

        ytd_summary.yoy_growth = Some(ytd_yoy_growth);
        last_year_summary.yoy_growth = Some(last_year_yoy_growth);

        // Two years ago YoY growth can't be calculated without data from three years ago
        two_years_ago_summary.yoy_growth = None;

        Ok(vec![
            total_summary,
            ytd_summary,
            last_year_summary,
            two_years_ago_summary,
        ])
    }

    // Helper function to calculate YoY growth
}
