use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{IncomeData, IncomeSummary};
use chrono::{Datelike, NaiveDateTime};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;

pub struct IncomeService {
    fx_service: CurrencyExchangeService,
    base_currency: String,
    pool: Pool<ConnectionManager<SqliteConnection>>,
}

impl IncomeService {
    pub fn new(
        pool: Pool<ConnectionManager<SqliteConnection>>,
        fx_service: CurrencyExchangeService,
        base_currency: String,
    ) -> Self {
        IncomeService {
            fx_service,
            base_currency,
            pool,
        }
    }

    pub fn get_income_data(&self) -> Result<Vec<IncomeData>, diesel::result::Error> {
        use crate::schema::activities;
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        activities::table
            .filter(activities::activity_type.eq_any(vec!["DIVIDEND", "INTEREST"]))
            .select((
                activities::activity_date,
                activities::activity_type,
                activities::asset_id,
                activities::quantity * activities::unit_price,
                activities::currency,
            ))
            .load::<(NaiveDateTime, String, String, f64, String)>(&mut conn)
            .map(|results| {
                results
                    .into_iter()
                    .map(|(date, income_type, symbol, amount, currency)| IncomeData {
                        date,
                        income_type,
                        symbol,
                        amount,
                        currency,
                    })
                    .collect()
            })
    }

    pub fn get_income_summary(&self) -> Result<IncomeSummary, diesel::result::Error> {
        let income_data = self.get_income_data()?;

        let mut by_month: HashMap<String, f64> = HashMap::new();
        let mut by_type: HashMap<String, f64> = HashMap::new();
        let mut by_symbol: HashMap<String, f64> = HashMap::new();
        let mut total_income = 0.0;
        let mut total_income_ytd = 0.0;

        let current_year = chrono::Local::now().year();

        for data in income_data {
            let month = data.date.format("%Y-%m").to_string();
            let converted_amount = self
                .fx_service
                .convert_currency(data.amount, &data.currency, &self.base_currency)
                .unwrap_or(data.amount);

            *by_month.entry(month).or_insert(0.0) += converted_amount;
            *by_type.entry(data.income_type).or_insert(0.0) += converted_amount;
            *by_symbol.entry(data.symbol).or_insert(0.0) += converted_amount;
            total_income += converted_amount;

            if data.date.year() == current_year {
                total_income_ytd += converted_amount;
            }
        }

        Ok(IncomeSummary {
            by_month,
            by_type,
            by_symbol,
            total_income,
            total_income_ytd,
            currency: self.base_currency.clone(),
        })
    }
}
