use crate::categories::Category;
use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Budget configuration - global monthly targets
#[derive(
    Queryable, Identifiable, AsChangeset, Selectable, PartialEq, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::budget_config)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct BudgetConfig {
    pub id: String,
    pub monthly_spending_target: String,
    pub monthly_income_target: String,
    pub currency: String,
    pub created_at: String,
    pub updated_at: String,
}

impl BudgetConfig {
    pub fn spending_target_decimal(&self) -> Decimal {
        self.monthly_spending_target
            .parse()
            .unwrap_or(Decimal::ZERO)
    }

    pub fn income_target_decimal(&self) -> Decimal {
        self.monthly_income_target.parse().unwrap_or(Decimal::ZERO)
    }
}

/// Input for creating/updating budget config
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::budget_config)]
#[serde(rename_all = "camelCase")]
pub struct NewBudgetConfig {
    pub id: Option<String>,
    pub monthly_spending_target: String,
    pub monthly_income_target: String,
    pub currency: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Budget allocation - category-specific amount
#[derive(
    Queryable,
    Identifiable,
    Associations,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(belongs_to(BudgetConfig))]
#[diesel(belongs_to(Category))]
#[diesel(table_name = crate::schema::budget_allocations)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct BudgetAllocation {
    pub id: String,
    pub budget_config_id: String,
    pub category_id: String,
    pub amount: String,
    pub created_at: String,
    pub updated_at: String,
}

impl BudgetAllocation {
    pub fn amount_decimal(&self) -> Decimal {
        self.amount.parse().unwrap_or(Decimal::ZERO)
    }
}

/// Input for creating/updating a budget allocation
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::budget_allocations)]
#[serde(rename_all = "camelCase")]
pub struct NewBudgetAllocation {
    pub id: Option<String>,
    pub budget_config_id: Option<String>,
    pub category_id: String,
    pub amount: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Budget allocation with category details for frontend
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BudgetAllocationWithCategory {
    pub id: String,
    pub category_id: String,
    pub category_name: String,
    pub category_color: Option<String>,
    pub amount: f64,
    pub is_income: bool,
}

/// Complete budget summary for frontend display
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BudgetSummary {
    pub config: Option<BudgetConfigDto>,
    pub expense_allocations: Vec<BudgetAllocationWithCategory>,
    pub income_allocations: Vec<BudgetAllocationWithCategory>,
    pub unallocated_spending: f64,
    pub unallocated_income: f64,
}

/// DTO for budget config with numeric values
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BudgetConfigDto {
    pub id: String,
    pub monthly_spending_target: f64,
    pub monthly_income_target: f64,
    pub currency: String,
}

impl From<BudgetConfig> for BudgetConfigDto {
    fn from(config: BudgetConfig) -> Self {
        let spending = config.spending_target_decimal();
        let income = config.income_target_decimal();
        BudgetConfigDto {
            id: config.id,
            monthly_spending_target: spending.to_string().parse().unwrap_or(0.0),
            monthly_income_target: income.to_string().parse().unwrap_or(0.0),
            currency: config.currency,
        }
    }
}

/// Budget vs actual comparison for a month
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BudgetVsActual {
    pub month: String,
    pub currency: String,
    pub spending: BudgetVsActualSummary,
    pub income: BudgetVsActualSummary,
    pub by_category: Vec<CategoryBudgetVsActual>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BudgetVsActualSummary {
    pub budgeted: f64,
    pub actual: f64,
    pub difference: f64,
    pub percent_used: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBudgetVsActual {
    pub category_id: String,
    pub category_name: String,
    pub category_color: Option<String>,
    pub budgeted: f64,
    pub actual: f64,
    pub difference: f64,
    pub percent_used: f64,
    pub is_over_budget: bool,
}
