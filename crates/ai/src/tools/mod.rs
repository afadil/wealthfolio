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
pub mod constants;
pub mod goals;
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
pub use goals::GetGoalsTool;
pub use holdings::GetHoldingsTool;
pub use import_csv::ImportCsvTool;
pub use income::GetIncomeTool;
pub use performance::GetPerformanceTool;
pub use record_activities::RecordActivitiesTool;
pub use record_activity::RecordActivityTool;
pub use valuation::GetValuationHistoryTool;

use std::sync::Arc;

use rig::tool::ToolDyn;

use crate::env::AiEnvironment;

/// Container for all AI tools, simplifying tool registration across providers.
pub struct ToolSet<E: AiEnvironment> {
    pub holdings: GetHoldingsTool<E>,
    pub allocation: GetAssetAllocationTool<E>,
    pub accounts: GetAccountsTool<E>,
    pub activities: SearchActivitiesTool<E>,
    pub income: GetIncomeTool<E>,
    pub valuation: GetValuationHistoryTool<E>,
    pub goals: GetGoalsTool<E>,
    pub performance: GetPerformanceTool<E>,
    pub record_activity: RecordActivityTool<E>,
    pub record_activities: RecordActivitiesTool<E>,
    pub import_csv: ImportCsvTool<E>,
}

impl<E: AiEnvironment> ToolSet<E> {
    /// Create a new tool set with all portfolio tools.
    pub fn new(env: Arc<E>, base_currency: String) -> Self {
        Self {
            holdings: GetHoldingsTool::new(env.clone(), base_currency.clone()),
            allocation: GetAssetAllocationTool::new(env.clone(), base_currency.clone()),
            accounts: GetAccountsTool::new(env.clone()),
            activities: SearchActivitiesTool::new(env.clone()),
            income: GetIncomeTool::new(env.clone()),
            valuation: GetValuationHistoryTool::new(env.clone(), base_currency.clone()),
            goals: GetGoalsTool::new(env.clone()),
            performance: GetPerformanceTool::new(env.clone(), base_currency.clone()),
            record_activity: RecordActivityTool::new(env.clone()),
            record_activities: RecordActivitiesTool::new(env.clone()),
            import_csv: ImportCsvTool::new(env, base_currency),
        }
    }

    /// Consume the tool set and return `(name, dyn handle)` pairs filtered
    /// against an optional allowlist (`None` keeps all). The order is the
    /// canonical registration order shared by every chat code path.
    ///
    /// Used by both the rig-core dispatch and the Claude Subscription bridge —
    /// they iterate the same registry so any new tool only needs to be added
    /// here.
    pub fn into_allowed_tools(
        self,
        allowlist: Option<&[String]>,
    ) -> Vec<(&'static str, Box<dyn ToolDyn>)>
    where
        E: 'static,
    {
        let is_allowed = |name: &str| -> bool {
            match allowlist {
                None => true,
                Some(list) => list.iter().any(|t| t == name),
            }
        };

        let mut out: Vec<(&'static str, Box<dyn ToolDyn>)> = Vec::new();
        if is_allowed("get_holdings") {
            out.push(("get_holdings", Box::new(self.holdings)));
        }
        if is_allowed("get_accounts") {
            out.push(("get_accounts", Box::new(self.accounts)));
        }
        if is_allowed("search_activities") {
            out.push(("search_activities", Box::new(self.activities)));
        }
        if is_allowed("get_goals") {
            out.push(("get_goals", Box::new(self.goals)));
        }
        if is_allowed("get_valuation_history") {
            out.push(("get_valuation_history", Box::new(self.valuation)));
        }
        if is_allowed("get_income") {
            out.push(("get_income", Box::new(self.income)));
        }
        if is_allowed("get_asset_allocation") {
            out.push(("get_asset_allocation", Box::new(self.allocation)));
        }
        if is_allowed("get_performance") {
            out.push(("get_performance", Box::new(self.performance)));
        }
        if is_allowed("record_activity") {
            out.push(("record_activity", Box::new(self.record_activity)));
        }
        if is_allowed("record_activities") {
            out.push(("record_activities", Box::new(self.record_activities)));
        }
        if is_allowed("import_csv") {
            out.push(("import_csv", Box::new(self.import_csv)));
        }
        out
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
