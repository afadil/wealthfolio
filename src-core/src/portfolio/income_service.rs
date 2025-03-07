use crate::fx::fx_service::FxService;
use crate::{
    models::{IncomeData, IncomeSummary},
    schema::activities,
};
use chrono::{Datelike, NaiveDate, NaiveDateTime, Utc};
use diesel::dsl::min;
use diesel::prelude::*;
use log::{debug, error};
use std::sync::Arc;
use bigdecimal::BigDecimal;
use std::str::FromStr;
use num_traits::Zero;

pub struct IncomeService {
    fx_service: Arc<FxService>,
    base_currency: String,
}

impl IncomeService {
    pub fn new(fx_service: Arc<FxService>, base_currency: String) -> Self {
        IncomeService {
            fx_service,
            base_currency,
        }
    }

    fn get_income_activities(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<IncomeData>, diesel::result::Error> {
        let query = "SELECT strftime('%Y-%m', a.activity_date) as date,
             a.activity_type as income_type,
             a.asset_id as symbol,
             COALESCE(ast.name, 'Unknown') as symbol_name,
             a.currency,
             a.amount
             FROM activities a
             LEFT JOIN assets ast ON a.asset_id = ast.id
             INNER JOIN accounts acc ON a.account_id = acc.id
             WHERE a.activity_type IN ('DIVIDEND', 'INTEREST', 'OTHER_INCOME')
             AND acc.is_active = 1
             ORDER BY a.activity_date";

        // Define a struct to hold the raw query results including quantity and unit_price
        #[derive(QueryableByName, Debug)]
        struct RawIncomeData {
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub date: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub income_type: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub symbol: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub symbol_name: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub currency: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub amount: String,
        }

        let raw_results = diesel::sql_query(query).load::<RawIncomeData>(conn)?;
        
        // Transform raw results into IncomeData, using amount directly from the database
        let results = raw_results
            .into_iter()
            .map(|raw| {
                // Parse the TEXT value into BigDecimal
                let amount = BigDecimal::from_str(&raw.amount).unwrap_or_else(|_| BigDecimal::zero());
                
                IncomeData {
                    date: raw.date,
                    income_type: raw.income_type,
                    symbol: raw.symbol,
                    symbol_name: raw.symbol_name,
                    currency: raw.currency,
                    amount,
                }
            })
            .collect();

        Ok(results)
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

    fn calculate_yoy_growth(current: BigDecimal, previous: BigDecimal) -> BigDecimal {
        if previous > BigDecimal::zero() {
            ((&current - &previous) / &previous) * BigDecimal::from(100)
        } else {
            BigDecimal::zero()
        }
    }

    pub fn get_income_summary(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<IncomeSummary>, diesel::result::Error> {
        debug!("Getting income summary...");

        let activities = match self.get_income_activities(conn) {
            Ok(activity) => activity,
            Err(e) => {
                error!("Error getting aggregated income data: {:?}", e);
                return Err(e);
            }
        };

        if activities.is_empty() {
            return Ok(Vec::new());
        }

        let base_currency = self.base_currency.clone();
        let current_date = Utc::now().naive_utc().date();
        let current_year = current_date.year();
        let last_year = current_year - 1;
        let two_years_ago = current_year - 2;
        let current_month = current_date.month();

        let oldest_date = match self.get_first_transaction_date(conn) {
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

        let _ = self.fx_service.initialize();

        for activity in activities {
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

            // Create a copy of the activity with cloned fields to avoid ownership issues
            let activity_copy = IncomeData {
                date: activity.date.clone(),
                income_type: activity.income_type.clone(),
                symbol: activity.symbol.clone(),
                symbol_name: activity.symbol_name.clone(),
                currency: activity.currency.clone(),
                amount: activity.amount.clone(),
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

        // Calculate Year-over-Year Growth
        let ytd_yoy_growth =
            Self::calculate_yoy_growth(ytd_summary.total_income.clone(), last_year_summary.total_income.clone());
        let last_year_yoy_growth = Self::calculate_yoy_growth(
            last_year_summary.total_income.clone(),
            two_years_ago_summary.total_income.clone(),
        );

        ytd_summary.yoy_growth = Some(ytd_yoy_growth);
        last_year_summary.yoy_growth = Some(last_year_yoy_growth);

        // Two years ago YoY growth can't be calculated without activity from three years ago
        two_years_ago_summary.yoy_growth = None;

        debug!("Income summary calculation completed successfully");
        Ok(vec![
            total_summary,
            ytd_summary,
            last_year_summary,
            two_years_ago_summary,
        ])
    }
}
