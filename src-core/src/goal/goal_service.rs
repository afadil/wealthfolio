use crate::goal::GoalRepository;
use crate::models::{Goal, GoalsAllocation, NewGoal};
use diesel::SqliteConnection;

pub struct GoalService {
    goal_repo: GoalRepository,
}

impl GoalService {
    pub fn new() -> Self {
        GoalService {
            goal_repo: GoalRepository::new(),
        }
    }

    pub fn get_goals(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Goal>, diesel::result::Error> {
        self.goal_repo.load_goals(conn)
    }

    pub fn create_goal(
        &self,
        conn: &mut SqliteConnection,
        new_goal: NewGoal,
    ) -> Result<Goal, diesel::result::Error> {
        let goal = self.goal_repo.insert_new_goal(conn, new_goal)?;
        Ok(goal)
    }

    pub fn update_goal(
        &self,
        conn: &mut SqliteConnection,
        updated_goal_data: Goal,
    ) -> Result<Goal, diesel::result::Error> {
        self.goal_repo.update_goal(conn, updated_goal_data)
    }

    pub fn delete_goal(
        &self,
        conn: &mut SqliteConnection,
        goal_id_to_delete: String, // ID of the goal to delete
    ) -> Result<usize, diesel::result::Error> {
        self.goal_repo.delete_goal(conn, goal_id_to_delete)
    }

    pub fn upsert_goal_allocations(
        &self,
        conn: &mut SqliteConnection,
        allocations: Vec<GoalsAllocation>,
    ) -> Result<usize, diesel::result::Error> {
        self.goal_repo.upsert_goal_allocations(conn, allocations)
    }

    pub fn load_goals_allocations(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<GoalsAllocation>, diesel::result::Error> {
        self.goal_repo.load_allocations_for_non_achieved_goals(conn)
    }
}
