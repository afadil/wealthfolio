use crate::goals::goals_model::{Goal, GoalsAllocation, NewGoal};
use crate::errors::Result;

/// Trait for goal repository operations
pub trait GoalRepositoryTrait: Send + Sync {
    fn load_goals(&self) -> Result<Vec<Goal>>;
    fn insert_new_goal(&self, new_goal: NewGoal) -> Result<Goal>;
    fn update_goal(&self, goal_update: Goal) -> Result<Goal>;
    fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize>;
    fn load_allocations_for_non_achieved_goals(&self) -> Result<Vec<GoalsAllocation>>;
    fn upsert_goal_allocations(&self, allocations: Vec<GoalsAllocation>) -> Result<usize>;
}

/// Trait for goal service operations
pub trait GoalServiceTrait: Send + Sync {
    fn get_goals(&self) -> Result<Vec<Goal>>;
    fn create_goal(&self, new_goal: NewGoal) -> Result<Goal>;
    fn update_goal(&self, updated_goal_data: Goal) -> Result<Goal>;
    fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize>;
    fn upsert_goal_allocations(&self, allocations: Vec<GoalsAllocation>) -> Result<usize>;
    fn load_goals_allocations(&self) -> Result<Vec<GoalsAllocation>>;
} 