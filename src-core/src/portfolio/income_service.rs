use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{IncomeData, IncomeSummary};
use chrono::Datelike;
use diesel::prelude::*;
use std::collections::HashMap;

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

    pub fn get_income_summary(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<IncomeSummary>, diesel::result::Error> {
        let income_data = self.get_aggregated_income_data(conn)?;

        let base_currency = self.base_currency.clone();
        let current_year = chrono::Utc::now().year().to_string();

        let mut by_month_total: HashMap<String, f64> = HashMap::new();
        let mut by_type_total: HashMap<String, f64> = HashMap::new();
        let mut by_symbol_total: HashMap<String, f64> = HashMap::new();
        let mut by_currency_total: HashMap<String, f64> = HashMap::new();
        let mut total_income = 0.0;

        let mut by_month_ytd: HashMap<String, f64> = HashMap::new();
        let mut by_type_ytd: HashMap<String, f64> = HashMap::new();
        let mut by_symbol_ytd: HashMap<String, f64> = HashMap::new();
        let mut by_currency_ytd: HashMap<String, f64> = HashMap::new();
        let mut total_income_ytd = 0.0;

        for data in income_data {
            let converted_amount = self
                .fx_service
                .convert_currency(data.amount, &data.currency, &base_currency)
                .unwrap_or(data.amount);

            *by_month_total.entry(data.date.to_string()).or_insert(0.0) += converted_amount;
            *by_type_total.entry(data.income_type.clone()).or_insert(0.0) += converted_amount;
            *by_symbol_total.entry(data.symbol.clone()).or_insert(0.0) += converted_amount;
            *by_currency_total
                .entry(data.currency.clone())
                .or_insert(0.0) += data.amount; // Use original amount for by_currency_total
            total_income += converted_amount;

            // Aggregate YTD data if the year matches the current year
            if data.date.starts_with(&current_year) {
                *by_month_ytd.entry(data.date.to_string()).or_insert(0.0) += converted_amount;
                *by_type_ytd.entry(data.income_type.clone()).or_insert(0.0) += converted_amount;
                *by_symbol_ytd.entry(data.symbol.clone()).or_insert(0.0) += converted_amount;
                *by_currency_ytd.entry(data.currency.clone()).or_insert(0.0) += data.amount; // Use original amount for by_currency_ytd
                total_income_ytd += converted_amount;
            }
        }

        Ok(vec![
            IncomeSummary {
                period: "TOTAL".to_string(),
                by_month: by_month_total,
                by_type: by_type_total,
                by_symbol: by_symbol_total,
                by_currency: by_currency_total,
                total_income,
                currency: base_currency.clone(),
            },
            IncomeSummary {
                period: "YTD".to_string(),
                by_month: by_month_ytd,
                by_type: by_type_ytd,
                by_symbol: by_symbol_ytd,
                by_currency: by_currency_ytd,
                total_income: total_income_ytd,
                currency: base_currency,
            },
        ])
    }
}
