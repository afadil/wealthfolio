use crate::activities::activities_model::IncomeData;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeSummary {
    pub period: String,
    pub by_month: HashMap<String, Decimal>,
    pub by_type: HashMap<String, Decimal>,
    pub by_symbol: HashMap<String, Decimal>,
    pub by_currency: HashMap<String, Decimal>,
    pub total_income: Decimal,
    pub currency: String,
    pub monthly_average: Decimal,
    pub yoy_growth: Option<Decimal>,
}

impl IncomeSummary {
    pub fn new(period: &str, currency: String) -> Self {
        IncomeSummary {
            period: period.to_string(),
            by_month: HashMap::new(),
            by_type: HashMap::new(),
            by_symbol: HashMap::new(),
            by_currency: HashMap::new(),
            total_income: Decimal::ZERO,
            currency,
            monthly_average: Decimal::ZERO,
            yoy_growth: None,
        }
    }

    pub fn add_income(&mut self, data: &IncomeData, converted_amount: Decimal) {
        *self
            .by_month
            .entry(data.date.to_string())
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self
            .by_type
            .entry(data.income_type.clone())
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self
            .by_symbol
            .entry(format!("[{}]-{}", data.symbol, data.symbol_name))
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self
            .by_currency
            .entry(data.currency.clone())
            .or_insert_with(|| Decimal::ZERO) += &data.amount;
        self.total_income += &converted_amount;
    }

    pub fn calculate_monthly_average(&mut self, num_months: Option<u32>) {
        let months = num_months.unwrap_or_else(|| self.by_month.len() as u32);
        if months > 0 {
            self.monthly_average = &self.total_income / Decimal::new(months as i64, 0);
        }
    }
}
