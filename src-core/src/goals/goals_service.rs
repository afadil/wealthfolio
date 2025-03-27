use crate::goals::goals_repository::GoalRepository;
use crate::goals::goals_model::{Goal, GoalsAllocation, NewGoal};
use crate::goals::goals_errors::Result;
use diesel::r2d2::{Pool, ConnectionManager};
use diesel::SqliteConnection;
use std::sync::Arc;

pub struct GoalService {
    goal_repo: GoalRepository,
}

impl GoalService {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        GoalService {
            goal_repo: GoalRepository::new(pool),
        }
    }

    pub fn get_goals(&self) -> Result<Vec<Goal>> {
        self.goal_repo.load_goals()
    }

    pub fn create_goal(
        &self,
        new_goal: NewGoal,
    ) -> Result<Goal> {
        self.goal_repo.insert_new_goal(new_goal)
    }

    pub fn update_goal(
        &self,
        updated_goal_data: Goal,
    ) -> Result<Goal> {
        self.goal_repo.update_goal(updated_goal_data)
    }

    pub fn delete_goal(
        &self,
        goal_id_to_delete: String,
    ) -> Result<usize> {
        self.goal_repo.delete_goal(goal_id_to_delete)
    }

    pub fn upsert_goal_allocations(
        &self,
        allocations: Vec<GoalsAllocation>,
    ) -> Result<usize> {
        self.goal_repo.upsert_goal_allocations(allocations)
    }

    pub fn load_goals_allocations(&self) -> Result<Vec<GoalsAllocation>> {
        self.goal_repo.load_allocations_for_non_achieved_goals()
    }
}
