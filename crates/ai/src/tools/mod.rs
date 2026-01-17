//! AI assistant tools for portfolio data access.
//!
//! This module provides tools that implement rig-core's Tool trait:
//! - GetAccountsTool: Fetch active investment accounts
//! - GetHoldingsTool: Fetch portfolio holdings
//! - GetAssetAllocationTool: Calculate portfolio allocation by category
//! - GetPerformanceTool: Fetch portfolio performance metrics
//! - GetValuationHistoryTool: Fetch portfolio valuation history
//! - SearchActivitiesTool: Search transactions
//! - GetDividendsTool: Fetch dividend and interest payments
//! - GetGoalsTool: Fetch investment goals with progress
//!
//! All tools are designed to work with the AiEnvironment trait for dependency injection.

pub mod accounts;
pub mod activities;
pub mod allocation;
pub mod constants;
pub mod dividends;
pub mod goals;
pub mod holdings;
pub mod performance;
pub mod valuation;

// Re-export constants
pub use constants::*;

// Re-export tools
pub use accounts::GetAccountsTool;
pub use activities::SearchActivitiesTool;
pub use allocation::GetAssetAllocationTool;
pub use dividends::GetDividendsTool;
pub use goals::GetGoalsTool;
pub use holdings::GetHoldingsTool;
pub use performance::GetPerformanceTool;
pub use valuation::GetValuationHistoryTool;

use std::sync::Arc;

use crate::env::AiEnvironment;

/// Container for all AI tools, simplifying tool registration across providers.
pub struct ToolSet<E: AiEnvironment> {
    pub holdings: GetHoldingsTool<E>,
    pub allocation: GetAssetAllocationTool<E>,
    pub accounts: GetAccountsTool<E>,
    pub activities: SearchActivitiesTool<E>,
    pub dividends: GetDividendsTool<E>,
    pub valuation: GetValuationHistoryTool<E>,
    pub goals: GetGoalsTool<E>,
    pub performance: GetPerformanceTool<E>,
}

impl<E: AiEnvironment> ToolSet<E> {
    /// Create a new tool set with all portfolio tools.
    pub fn new(env: Arc<E>, base_currency: String) -> Self {
        Self {
            holdings: GetHoldingsTool::new(env.clone(), base_currency.clone()),
            allocation: GetAssetAllocationTool::new(env.clone(), base_currency.clone()),
            accounts: GetAccountsTool::new(env.clone()),
            activities: SearchActivitiesTool::new(env.clone()),
            dividends: GetDividendsTool::new(env.clone()),
            valuation: GetValuationHistoryTool::new(env.clone(), base_currency.clone()),
            goals: GetGoalsTool::new(env.clone()),
            performance: GetPerformanceTool::new(env, base_currency),
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
