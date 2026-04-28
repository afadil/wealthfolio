//! AI assistant tools for portfolio data access.
//!
//! This module provides tools that implement rig-core's Tool trait:
//! - GetAccountsTool: Fetch active investment accounts
//! - GetHoldingsTool: Fetch portfolio holdings
//! - GetAssetAllocationTool: Calculate portfolio allocation by category
//! - GetPerformanceTool: Fetch portfolio performance metrics
//! - GetValuationHistoryTool: Fetch portfolio valuation history
//! - SearchActivitiesTool: Search transactions
//! - GetIncomeTool: Fetch income summaries (dividends, interest, other income)
//! - GetGoalsTool: Fetch investment goals with progress
//! - RecordActivityTool: Create activity drafts from natural language
//! - RecordActivitiesTool: Create multiple activity drafts from natural language
//!
//! All tools are designed to work with the AiEnvironment trait for dependency injection.

pub mod accounts;
pub mod activities;
pub mod allocation;
pub mod cash_balances;
pub mod constants;
pub mod goals;
pub mod health;
pub mod holdings;
pub mod import_csv;
pub mod income;
pub mod performance;
pub mod record_activities;
pub mod record_activity;
pub mod valuation;

// Re-export constants
pub use constants::*;

// Re-export tools
pub use accounts::GetAccountsTool;
pub use activities::SearchActivitiesTool;
pub use allocation::GetAssetAllocationTool;
pub use cash_balances::GetCashBalancesTool;
pub use goals::GetGoalsTool;
pub use health::GetHealthStatusTool;
pub use holdings::GetHoldingsTool;
pub use import_csv::ImportCsvTool;
pub use income::GetIncomeTool;
pub use performance::GetPerformanceTool;
pub use record_activities::RecordActivitiesTool;
pub use record_activity::RecordActivityTool;
pub use valuation::GetValuationHistoryTool;

use std::sync::Arc;

use crate::env::AiEnvironment;

/// Container for all AI tools, simplifying tool registration across providers.
pub struct ToolSet<E: AiEnvironment> {
    pub holdings: GetHoldingsTool<E>,
    pub allocation: GetAssetAllocationTool<E>,
    pub accounts: GetAccountsTool<E>,
    pub cash_balances: GetCashBalancesTool<E>,
    pub activities: SearchActivitiesTool<E>,
    pub income: GetIncomeTool<E>,
    pub valuation: GetValuationHistoryTool<E>,
    pub goals: GetGoalsTool<E>,
    pub performance: GetPerformanceTool<E>,
    pub record_activity: RecordActivityTool<E>,
    pub record_activities: RecordActivitiesTool<E>,
    pub import_csv: ImportCsvTool<E>,
    pub health_status: GetHealthStatusTool<E>,
}

impl<E: AiEnvironment> ToolSet<E> {
    /// Create a new tool set with all portfolio tools.
    pub fn new(env: Arc<E>, base_currency: String) -> Self {
        Self {
            holdings: GetHoldingsTool::new(env.clone(), base_currency.clone()),
            allocation: GetAssetAllocationTool::new(env.clone(), base_currency.clone()),
            accounts: GetAccountsTool::new(env.clone()),
            cash_balances: GetCashBalancesTool::new(env.clone(), base_currency.clone()),
            activities: SearchActivitiesTool::new(env.clone()),
            income: GetIncomeTool::new(env.clone()),
            valuation: GetValuationHistoryTool::new(env.clone(), base_currency.clone()),
            goals: GetGoalsTool::new(env.clone()),
            performance: GetPerformanceTool::new(env.clone(), base_currency.clone()),
            record_activity: RecordActivityTool::new(env.clone()),
            record_activities: RecordActivitiesTool::new(env.clone()),
            import_csv: ImportCsvTool::new(env.clone(), base_currency),
            health_status: GetHealthStatusTool::new(env),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[test]
    fn test_tool_set_creation() {
        let env = Arc::new(MockEnvironment::new());
        let _tools = ToolSet::new(env, "USD".to_string());
    }
}
