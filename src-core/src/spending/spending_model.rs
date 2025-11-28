use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Raw spending data retrieved from activities
#[derive(Debug, Clone)]
pub struct SpendingData {
    pub date: String,              // "YYYY-MM" format
    pub activity_type: String,     // WITHDRAWAL, FEE, TAX, DEPOSIT (expense-categorized)
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub category_color: Option<String>,
    pub sub_category_id: Option<String>,
    pub sub_category_name: Option<String>,
    pub account_id: String,
    pub account_name: String,
    pub currency: String,
    pub amount: Decimal,
    pub name: Option<String>,      // Transaction description/name
}

/// Summary of spending data for a given period
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingSummary {
    pub period: String,                                    // "TOTAL", "YTD", "LAST_YEAR", etc.
    pub by_month: HashMap<String, Decimal>,                // Month -> Amount
    pub by_category: HashMap<String, CategorySpending>,    // CategoryId -> CategorySpending
    pub by_account: HashMap<String, Decimal>,              // AccountId -> Amount
    pub total_spending: Decimal,
    pub currency: String,
    pub monthly_average: Decimal,
    pub transaction_count: i32,
    pub yoy_growth: Option<Decimal>,
}

/// Detailed spending info per category
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategorySpending {
    pub category_id: Option<String>,
    pub category_name: String,
    pub color: Option<String>,
    pub amount: Decimal,
    pub transaction_count: i32,
}

impl SpendingSummary {
    pub fn new(period: &str, currency: String) -> Self {
        SpendingSummary {
            period: period.to_string(),
            by_month: HashMap::new(),
            by_category: HashMap::new(),
            by_account: HashMap::new(),
            total_spending: Decimal::ZERO,
            currency,
            monthly_average: Decimal::ZERO,
            transaction_count: 0,
            yoy_growth: None,
        }
    }

    pub fn add_spending(&mut self, data: &SpendingData, converted_amount: Decimal) {
        // Aggregate by month
        *self
            .by_month
            .entry(data.date.clone())
            .or_insert(Decimal::ZERO) += converted_amount;

        // Aggregate by category
        let category_key = data
            .category_id
            .clone()
            .unwrap_or_else(|| "uncategorized".to_string());
        let category_entry = self
            .by_category
            .entry(category_key.clone())
            .or_insert_with(|| CategorySpending {
                category_id: data.category_id.clone(),
                category_name: data
                    .category_name
                    .clone()
                    .unwrap_or_else(|| "Uncategorized".to_string()),
                color: data.category_color.clone(),
                amount: Decimal::ZERO,
                transaction_count: 0,
            });
        category_entry.amount += converted_amount;
        category_entry.transaction_count += 1;

        // Aggregate by account
        *self
            .by_account
            .entry(data.account_id.clone())
            .or_insert(Decimal::ZERO) += converted_amount;

        // Update totals
        self.total_spending += converted_amount;
        self.transaction_count += 1;
    }

    pub fn calculate_monthly_average(&mut self, num_months: Option<u32>) {
        let months = num_months.unwrap_or_else(|| self.by_month.len() as u32);
        if months > 0 {
            self.monthly_average = self.total_spending / Decimal::new(months as i64, 0);
        }
    }
}
