use crate::fx::fx_service::CurrencyExchangeService;
use crate::{
    models::{IncomeData, IncomeSummary},
    schema::activities,
};
use chrono::{Datelike, NaiveDate, NaiveDateTime, Utc};
use diesel::dsl::min;
use diesel::prelude::*;
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
        let query = "SELECT strftime('%Y-%m', a.activity_date) as date,
             a.activity_type as income_type,
             a.asset_id as symbol,
             COALESCE(ast.name, 'Unknown') as symbol_name,
             a.currency,
             SUM(a.quantity * a.unit_price) as amount
             FROM activities a
             LEFT JOIN assets ast ON a.asset_id = ast.id
             INNER JOIN accounts acc ON a.account_id = acc.id
             WHERE a.activity_type IN ('DIVIDEND', 'INTEREST', 'OTHER_INCOME')
             AND acc.is_active = 1
             GROUP BY date, a.activity_type, a.asset_id, ast.name, a.currency";

        let result = diesel::sql_query(query).load::<IncomeData>(conn);

        result
    }

    fn get_first_transaction_date(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<NaiveDateTime, diesel::result::Error> {
        activities::table
            .select(min(activities::activity_date))
            .first::<Option<NaiveDateTime>>(conn)
            .optional()
            .map(|result| result.flatten())
            .and_then(|opt| opt.ok_or(diesel::NotFound))
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
        let current_month = current_date.month();

        let oldest_date = self.get_first_transaction_date(conn)?;
        println!("Income computed since {}", oldest_date);
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

        for data in income_data {
            let date = NaiveDate::parse_from_str(&format!("{}-01", data.date), "%Y-%m-%d").unwrap();
            let converted_amount = self
                .fx_service
                .convert_currency(data.amount, &data.currency, &base_currency)
                .unwrap_or(data.amount);

            total_summary.add_income(&data, converted_amount);

            if date.year() == current_year {
                ytd_summary.add_income(&data, converted_amount);
            } else if date.year() == last_year {
                last_year_summary.add_income(&data, converted_amount);
            } else if date.year() == two_years_ago {
                two_years_ago_summary.add_income(&data, converted_amount);
            }
        }

        total_summary.calculate_monthly_average(Some(months_since_first_transaction as u32));
        ytd_summary.calculate_monthly_average(Some(current_month as u32));
        last_year_summary.calculate_monthly_average(Some(months_in_last_year as u32));
        two_years_ago_summary.calculate_monthly_average(Some(months_two_years_ago as u32));

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
