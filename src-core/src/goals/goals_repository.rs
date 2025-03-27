use crate::goals::goals_model::{Goal, GoalsAllocation, NewGoal};
use crate::schema::goals;
use crate::schema::goals::dsl::*;
use crate::schema::goals_allocation;
use diesel::prelude::*;
use diesel::r2d2::{Pool, ConnectionManager};
use diesel::SqliteConnection;
use crate::goals::goals_errors::{Result, GoalError};

use uuid::Uuid;
use std::sync::Arc;

pub struct GoalRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl GoalRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        GoalRepository { pool }
    }

    pub fn load_goals(&self) -> Result<Vec<Goal>> {
        let mut conn = self.pool.get().map_err(GoalError::Pool)?;
        Ok(goals.load::<Goal>(&mut conn).map_err(GoalError::Database)?)
    }

    pub fn insert_new_goal(
        &self,
        mut new_goal: NewGoal,
    ) -> Result<Goal> {
        let mut conn = self.pool.get().map_err(GoalError::Pool)?;
        new_goal.id = Some(Uuid::new_v4().to_string());

        Ok(diesel::insert_into(goals::table)
            .values(&new_goal)
            .returning(goals::all_columns)
            .get_result(&mut conn)
            .map_err(GoalError::Database)?)
    }

    pub fn update_goal(
        &self,
        goal_update: Goal,
    ) -> Result<Goal> {
        let mut conn = self.pool.get().map_err(GoalError::Pool)?;
        let goal_id = goal_update.id.clone();

        diesel::update(goals.find(goal_id))
            .set(&goal_update)
            .execute(&mut conn)
            .map_err(GoalError::Database)?;

        Ok(goals.filter(id.eq(goal_update.id))
            .first(&mut conn)
            .map_err(GoalError::Database)?)
    }

    pub fn delete_goal(
        &self,
        goal_id_to_delete: String,
    ) -> Result<usize> {
        let mut conn = self.pool.get().map_err(GoalError::Pool)?;
        Ok(diesel::delete(goals.find(goal_id_to_delete))
            .execute(&mut conn)
            .map_err(GoalError::Database)?)
    }

    pub fn load_allocations_for_non_achieved_goals(&self) -> Result<Vec<GoalsAllocation>> {
        let mut conn = self.pool.get().map_err(GoalError::Pool)?;
        Ok(goals_allocation::table
            .inner_join(goals::table.on(goals::id.eq(goals_allocation::goal_id)))
            .filter(goals::is_achieved.eq(false))
            .select((
                goals_allocation::id,
                goals_allocation::goal_id,
                goals_allocation::account_id,
                goals_allocation::percent_allocation,
            ))
            .load::<GoalsAllocation>(&mut conn)
            .map_err(GoalError::Database)?)
    }

    pub fn upsert_goal_allocations(
        &self,
        allocations: Vec<GoalsAllocation>,
    ) -> Result<usize> {
        let mut conn = self.pool.get().map_err(GoalError::Pool)?;
        let mut affected_rows = 0;

        for allocation in allocations {
            affected_rows += diesel::insert_into(goals_allocation::table)
                .values(&allocation)
                .on_conflict(goals_allocation::id)
                .do_update()
                .set(&allocation)
                .execute(&mut conn)
                .map_err(GoalError::Database)?;
        }

        Ok(affected_rows)
    }
}
