use crate::budget::budget_model::{
    BudgetAllocation, BudgetAllocationWithCategory, BudgetConfig, BudgetConfigDto, BudgetSummary,
    BudgetVsActual, BudgetVsActualSummary, CategoryBudgetVsActual, NewBudgetAllocation,
    NewBudgetConfig,
};
use crate::budget::budget_traits::{BudgetRepositoryTrait, BudgetServiceTrait};
use crate::errors::Result;
use crate::spending::SpendingServiceTrait;
use async_trait::async_trait;
use rust_decimal::Decimal;
use std::sync::Arc;

pub struct BudgetService {
    repository: Arc<dyn BudgetRepositoryTrait>,
    spending_service: Arc<dyn SpendingServiceTrait>,
}

impl BudgetService {
    pub fn new(
        repository: Arc<dyn BudgetRepositoryTrait>,
        spending_service: Arc<dyn SpendingServiceTrait>,
    ) -> Self {
        BudgetService {
            repository,
            spending_service,
        }
    }
}

#[async_trait]
impl BudgetServiceTrait for BudgetService {
    fn get_budget_config(&self) -> Result<Option<BudgetConfig>> {
        self.repository.get_budget_config()
    }

    async fn upsert_budget_config(&self, config: NewBudgetConfig) -> Result<BudgetConfig> {
        self.repository.upsert_budget_config(config).await
    }

    fn get_budget_summary(&self) -> Result<BudgetSummary> {
        let config = self.repository.get_budget_config()?;
        let allocations = self.repository.get_allocations_with_categories()?;

        let expense_allocations: Vec<BudgetAllocationWithCategory> = allocations
            .iter()
            .filter(|a| !a.is_income)
            .cloned()
            .collect();

        let income_allocations: Vec<BudgetAllocationWithCategory> = allocations
            .iter()
            .filter(|a| a.is_income)
            .cloned()
            .collect();

        let (unallocated_spending, unallocated_income) = if let Some(ref cfg) = config {
            let total_expense_allocated: f64 = expense_allocations.iter().map(|a| a.amount).sum();
            let total_income_allocated: f64 = income_allocations.iter().map(|a| a.amount).sum();

            let spending_target: f64 = cfg
                .spending_target_decimal()
                .to_string()
                .parse()
                .unwrap_or(0.0);
            let income_target: f64 = cfg
                .income_target_decimal()
                .to_string()
                .parse()
                .unwrap_or(0.0);

            (
                (spending_target - total_expense_allocated).max(0.0),
                (income_target - total_income_allocated).max(0.0),
            )
        } else {
            (0.0, 0.0)
        };

        Ok(BudgetSummary {
            config: config.map(BudgetConfigDto::from),
            expense_allocations,
            income_allocations,
            unallocated_spending,
            unallocated_income,
        })
    }

    fn get_allocations(&self) -> Result<Vec<BudgetAllocationWithCategory>> {
        self.repository.get_allocations_with_categories()
    }

    async fn set_allocation(&self, category_id: String, amount: f64) -> Result<BudgetAllocation> {
        let allocation = NewBudgetAllocation {
            id: None,
            budget_config_id: None,
            category_id,
            amount: amount.to_string(),
            created_at: None,
            updated_at: None,
        };
        self.repository.upsert_allocation(allocation).await
    }

    async fn delete_allocation(&self, category_id: &str) -> Result<usize> {
        self.repository.delete_allocation(category_id).await
    }

    fn get_budget_vs_actual(&self, month: &str) -> Result<BudgetVsActual> {
        let config = self.repository.get_budget_config()?;
        let allocations = self.repository.get_allocations_with_categories()?;

        let spending_summaries = self
            .spending_service
            .get_spending_summary(None, false)?;

        let month_spending = spending_summaries
            .iter()
            .find(|s| s.by_month.contains_key(month));

        let (spending_target, income_target, currency) = if let Some(cfg) = &config {
            (
                cfg.spending_target_decimal()
                    .to_string()
                    .parse()
                    .unwrap_or(0.0),
                cfg.income_target_decimal()
                    .to_string()
                    .parse()
                    .unwrap_or(0.0),
                cfg.currency.clone(),
            )
        } else {
            (0.0, 0.0, "USD".to_string())
        };

        let actual_spending: f64 = month_spending
            .and_then(|s| s.by_month.get(month))
            .map(|d| decimal_to_f64(d))
            .unwrap_or(0.0);

        let month_category_spending = month_spending
            .and_then(|s| s.by_month_by_category.get(month))
            .cloned()
            .unwrap_or_default();

        let expense_allocations: Vec<&BudgetAllocationWithCategory> =
            allocations.iter().filter(|a| !a.is_income).collect();

        let by_category: Vec<CategoryBudgetVsActual> = expense_allocations
            .iter()
            .map(|alloc| {
                let actual = month_category_spending
                    .get(&alloc.category_id)
                    .map(|d| decimal_to_f64(d))
                    .unwrap_or(0.0);
                let budgeted = alloc.amount;
                let difference = budgeted - actual;
                let percent_used = if budgeted > 0.0 {
                    (actual / budgeted) * 100.0
                } else {
                    0.0
                };

                CategoryBudgetVsActual {
                    category_id: alloc.category_id.clone(),
                    category_name: alloc.category_name.clone(),
                    category_color: alloc.category_color.clone(),
                    budgeted,
                    actual,
                    difference,
                    percent_used,
                    is_over_budget: actual > budgeted,
                }
            })
            .collect();

        let spending_percent = if spending_target > 0.0 {
            (actual_spending / spending_target) * 100.0
        } else {
            0.0
        };

        // For income, we'd need income data - for now just use placeholder
        // This could be enhanced to fetch income data similar to spending
        let actual_income = 0.0; // TODO: Fetch from income service when available
        let income_percent = if income_target > 0.0 {
            (actual_income / income_target) * 100.0
        } else {
            0.0
        };

        Ok(BudgetVsActual {
            month: month.to_string(),
            currency,
            spending: BudgetVsActualSummary {
                budgeted: spending_target,
                actual: actual_spending,
                difference: spending_target - actual_spending,
                percent_used: spending_percent,
            },
            income: BudgetVsActualSummary {
                budgeted: income_target,
                actual: actual_income,
                difference: income_target - actual_income,
                percent_used: income_percent,
            },
            by_category,
        })
    }
}

fn decimal_to_f64(d: &Decimal) -> f64 {
    d.to_string().parse().unwrap_or(0.0)
}
