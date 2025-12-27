use crate::budget::budget_model::{
    BudgetAllocation, BudgetAllocationWithCategory, BudgetConfig, BudgetSummary, BudgetVsActual,
    NewBudgetAllocation, NewBudgetConfig,
};
use crate::errors::Result;
use async_trait::async_trait;

/// Trait for budget repository operations
#[async_trait]
pub trait BudgetRepositoryTrait: Send + Sync {
    fn get_budget_config(&self) -> Result<Option<BudgetConfig>>;
    async fn upsert_budget_config(&self, config: NewBudgetConfig) -> Result<BudgetConfig>;
    async fn delete_budget_config(&self, config_id: &str) -> Result<usize>;

    fn get_allocations(&self) -> Result<Vec<BudgetAllocation>>;
    fn get_allocations_with_categories(&self) -> Result<Vec<BudgetAllocationWithCategory>>;
    async fn upsert_allocation(&self, allocation: NewBudgetAllocation) -> Result<BudgetAllocation>;
    async fn delete_allocation(&self, category_id: &str) -> Result<usize>;
}

/// Trait for budget service operations
#[async_trait]
pub trait BudgetServiceTrait: Send + Sync {
    fn get_budget_config(&self) -> Result<Option<BudgetConfig>>;
    async fn upsert_budget_config(&self, config: NewBudgetConfig) -> Result<BudgetConfig>;

    fn get_budget_summary(&self) -> Result<BudgetSummary>;
    fn get_allocations(&self) -> Result<Vec<BudgetAllocationWithCategory>>;
    async fn set_allocation(&self, category_id: String, amount: f64) -> Result<BudgetAllocation>;
    async fn delete_allocation(&self, category_id: &str) -> Result<usize>;

    fn get_budget_vs_actual(&self, month: &str) -> Result<BudgetVsActual>;
}
