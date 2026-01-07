use crate::errors::Result;
use crate::goals::goals_model::{
    AccountFreeCash, Goal, GoalContribution, GoalContributionWithStatus, GoalWithContributions,
    NewGoal, NewGoalContribution,
};
use async_trait::async_trait;

/// Trait for goal repository operations
#[async_trait]
pub trait GoalRepositoryTrait: Send + Sync {
    fn load_goals(&self) -> Result<Vec<Goal>>;
    async fn insert_new_goal(&self, new_goal: NewGoal) -> Result<Goal>;
    async fn update_goal(&self, goal_update: Goal) -> Result<Goal>;
    async fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize>;

    // Contribution methods
    fn load_contributions_for_goal(&self, goal_id: &str) -> Result<Vec<GoalContribution>>;
    fn load_contributions_for_non_achieved_goals(&self) -> Result<Vec<GoalContribution>>;
    fn get_total_contributions_for_account(&self, account_id: &str) -> Result<f64>;
    async fn insert_contribution(&self, contribution: NewGoalContribution) -> Result<GoalContribution>;
    async fn delete_contribution(&self, contribution_id: &str) -> Result<usize>;
}

/// Trait for goal service operations
#[async_trait]
pub trait GoalServiceTrait: Send + Sync {
    fn get_goals(&self) -> Result<Vec<Goal>>;
    async fn create_goal(&self, new_goal: NewGoal) -> Result<Goal>;
    async fn update_goal(&self, updated_goal_data: Goal) -> Result<Goal>;
    async fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize>;

    // Contribution methods
    fn get_goals_with_contributions(&self) -> Result<Vec<GoalWithContributions>>;
    fn get_account_free_cash(&self, account_ids: &[String]) -> Result<Vec<AccountFreeCash>>;
    async fn add_contribution(
        &self,
        contribution: NewGoalContribution,
    ) -> Result<GoalContributionWithStatus>;
    async fn remove_contribution(&self, contribution_id: &str) -> Result<usize>;
}
