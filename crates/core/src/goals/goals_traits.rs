//! Goal service and repository trait definitions.

use crate::errors::Result;
use crate::goals::goals_model::{
    AccountValuationMap, Goal, GoalCachedUpdate, GoalFundingRule, GoalFundingRuleInput, GoalPlan,
    NewGoal, SaveGoalPlan,
};
use async_trait::async_trait;

/// Trait for goal repository operations
#[async_trait]
pub trait GoalRepositoryTrait: Send + Sync {
    fn load_goals(&self) -> Result<Vec<Goal>>;
    fn load_goal(&self, goal_id: &str) -> Result<Goal>;
    async fn insert_new_goal(&self, new_goal: NewGoal) -> Result<Goal>;
    async fn update_goal(&self, goal_update: Goal) -> Result<Goal>;
    async fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize>;

    // Funding rules
    fn load_funding_rules(&self, goal_id: &str) -> Result<Vec<GoalFundingRule>>;
    fn load_all_active_funding_rules(&self) -> Result<Vec<GoalFundingRule>>;
    async fn save_goal_funding(
        &self,
        goal_id: &str,
        rules: Vec<GoalFundingRuleInput>,
    ) -> Result<Vec<GoalFundingRule>>;

    // Plans
    fn load_goal_plan(&self, goal_id: &str) -> Result<Option<GoalPlan>>;
    async fn save_goal_plan(&self, plan: SaveGoalPlan) -> Result<GoalPlan>;
    async fn delete_goal_plan(&self, goal_id: &str) -> Result<usize>;

    // Cached summary
    async fn update_goal_cached_fields(
        &self,
        goal_id: &str,
        update: GoalCachedUpdate,
    ) -> Result<()>;
}

/// Trait for goal service operations
#[async_trait]
pub trait GoalServiceTrait: Send + Sync {
    fn get_goals(&self) -> Result<Vec<Goal>>;
    fn get_goal(&self, goal_id: &str) -> Result<Goal>;
    async fn create_goal(&self, new_goal: NewGoal) -> Result<Goal>;
    async fn update_goal(&self, updated_goal_data: Goal) -> Result<Goal>;
    async fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize>;

    // Funding
    fn get_goal_funding(&self, goal_id: &str) -> Result<Vec<GoalFundingRule>>;
    async fn save_goal_funding(
        &self,
        goal_id: &str,
        rules: Vec<GoalFundingRuleInput>,
    ) -> Result<Vec<GoalFundingRule>>;

    // Plans
    fn get_goal_plan(&self, goal_id: &str) -> Result<Option<GoalPlan>>;
    async fn save_goal_plan(&self, plan: SaveGoalPlan) -> Result<GoalPlan>;
    async fn delete_goal_plan(&self, goal_id: &str) -> Result<usize>;

    // Summary
    async fn refresh_goal_summary(
        &self,
        goal_id: &str,
        valuations: &AccountValuationMap,
    ) -> Result<Goal>;
}
