use crate::db::get_connection;
use crate::errors::Result;
use crate::goals::goals_model::{Goal, GoalsAllocation, NewGoal};
use crate::goals::goals_traits::GoalRepositoryTrait;
use crate::schema::goals;
use crate::schema::goals::dsl::*;
use crate::schema::goals_allocation;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;

use std::sync::Arc;
use uuid::Uuid;

pub struct GoalRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl GoalRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        GoalRepository { pool }
    }

    pub fn load_goals(&self) -> Result<Vec<Goal>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(goals.load::<Goal>(&mut conn)?)
    }

    pub fn insert_new_goal(&self, mut new_goal: NewGoal) -> Result<Goal> {
        let mut conn = get_connection(&self.pool)?;

        new_goal.id = Some(Uuid::new_v4().to_string());

        Ok(diesel::insert_into(goals::table)
            .values(&new_goal)
            .returning(goals::all_columns)
            .get_result(&mut conn)?)
    }

    pub fn update_goal(&self, goal_update: Goal) -> Result<Goal> {
        let mut conn = get_connection(&self.pool)?;
        let goal_id = goal_update.id.clone();

        diesel::update(goals.find(goal_id))
            .set(&goal_update)
            .execute(&mut conn)?;

        Ok(goals.filter(id.eq(goal_update.id)).first(&mut conn)?)
    }

    pub fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize> {
        let mut conn = get_connection(&self.pool)?;
        Ok(diesel::delete(goals.find(goal_id_to_delete)).execute(&mut conn)?)
    }

    pub fn load_allocations_for_non_achieved_goals(&self) -> Result<Vec<GoalsAllocation>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(goals_allocation::table
            .inner_join(goals::table.on(goals::id.eq(goals_allocation::goal_id)))
            .filter(goals::is_achieved.eq(false))
            .select((
                goals_allocation::id,
                goals_allocation::goal_id,
                goals_allocation::account_id,
                goals_allocation::percent_allocation,
            ))
            .load::<GoalsAllocation>(&mut conn)?)
    }

    pub fn upsert_goal_allocations(&self, allocations: Vec<GoalsAllocation>) -> Result<usize> {
        let mut conn = get_connection(&self.pool)?;
        let mut affected_rows = 0;

        for allocation in allocations {
            affected_rows += diesel::insert_into(goals_allocation::table)
                .values(&allocation)
                .on_conflict(goals_allocation::id)
                .do_update()
                .set(&allocation)
                .execute(&mut conn)?;
        }

        Ok(affected_rows)
    }
}

impl GoalRepositoryTrait for GoalRepository {
    fn load_goals(&self) -> Result<Vec<Goal>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(goals.load::<Goal>(&mut conn)?)
    }

    fn insert_new_goal(&self, mut new_goal: NewGoal) -> Result<Goal> {
        let mut conn = get_connection(&self.pool)?;
        new_goal.id = Some(Uuid::new_v4().to_string());

        Ok(diesel::insert_into(goals::table)
            .values(&new_goal)
            .returning(goals::all_columns)
            .get_result(&mut conn)?)
    }

    fn update_goal(&self, goal_update: Goal) -> Result<Goal> {
        let mut conn = get_connection(&self.pool)?;
        let goal_id = goal_update.id.clone();

        diesel::update(goals.find(goal_id))
            .set(&goal_update)
            .execute(&mut conn)?;

        Ok(goals.filter(id.eq(goal_update.id)).first(&mut conn)?)
    }

    fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize> {
        let mut conn = get_connection(&self.pool)?;
        Ok(diesel::delete(goals.find(goal_id_to_delete)).execute(&mut conn)?)
    }

    fn load_allocations_for_non_achieved_goals(&self) -> Result<Vec<GoalsAllocation>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(goals_allocation::table
            .inner_join(goals::table.on(goals::id.eq(goals_allocation::goal_id)))
            .filter(goals::is_achieved.eq(false))
            .select((
                goals_allocation::id,
                goals_allocation::goal_id,
                goals_allocation::account_id,
                goals_allocation::percent_allocation,
            ))
            .load::<GoalsAllocation>(&mut conn)?)
    }

    fn upsert_goal_allocations(&self, allocations: Vec<GoalsAllocation>) -> Result<usize> {
        let mut conn = get_connection(&self.pool)?;
        let mut affected_rows = 0;

        for allocation in allocations {
            affected_rows += diesel::insert_into(goals_allocation::table)
                .values(&allocation)
                .on_conflict(goals_allocation::id)
                .do_update()
                .set(&allocation)
                .execute(&mut conn)?;
        }

        Ok(affected_rows)
    }
}
