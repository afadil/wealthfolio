use crate::db::{get_connection, WriteHandle};
use crate::errors::Result;
use crate::goals::goals_model::{Goal, GoalContribution, NewGoal, NewGoalContribution};
use crate::goals::goals_traits::GoalRepositoryTrait;
use crate::schema::goal_contributions;
use crate::schema::goals;
use crate::schema::goals::dsl::*;
use async_trait::async_trait;
use chrono::Utc;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;

use std::sync::Arc;
use uuid::Uuid;

pub struct GoalRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl GoalRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        GoalRepository { pool, writer }
    }

    pub fn load_goals_impl(&self) -> Result<Vec<Goal>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(goals.load::<Goal>(&mut conn)?)
    }

    pub fn load_contributions_for_goal_impl(&self, goal_id_param: &str) -> Result<Vec<GoalContribution>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(goal_contributions::table
            .filter(goal_contributions::goal_id.eq(goal_id_param))
            .load::<GoalContribution>(&mut conn)?)
    }

    pub fn load_contributions_for_non_achieved_goals_impl(&self) -> Result<Vec<GoalContribution>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(goal_contributions::table
            .inner_join(goals::table.on(goals::id.eq(goal_contributions::goal_id)))
            .filter(goals::is_achieved.eq(false))
            .select(goal_contributions::all_columns)
            .load::<GoalContribution>(&mut conn)?)
    }

    pub fn get_total_contributions_for_account_impl(&self, account_id_param: &str) -> Result<f64> {
        let mut conn = get_connection(&self.pool)?;
        let total: Option<f64> = goal_contributions::table
            .inner_join(goals::table.on(goals::id.eq(goal_contributions::goal_id)))
            .filter(goal_contributions::account_id.eq(account_id_param))
            .filter(goals::is_achieved.eq(false))
            .select(diesel::dsl::sum(goal_contributions::amount))
            .first(&mut conn)?;
        Ok(total.unwrap_or(0.0))
    }
}

#[async_trait]
impl GoalRepositoryTrait for GoalRepository {
    fn load_goals(&self) -> Result<Vec<Goal>> {
        self.load_goals_impl()
    }

    async fn insert_new_goal(&self, new_goal: NewGoal) -> Result<Goal> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Goal> {
                let mut new_goal_mut = new_goal;
                new_goal_mut.id = Some(Uuid::new_v4().to_string());

                Ok(diesel::insert_into(goals::table)
                    .values(&new_goal_mut)
                    .returning(goals::all_columns)
                    .get_result(conn)?)
            })
            .await
    }

    async fn update_goal(&self, goal_update: Goal) -> Result<Goal> {
        let goal_id_owned = goal_update.id.clone();
        let goal_update_owned = goal_update.clone();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Goal> {
                diesel::update(goals.find(goal_id_owned.clone()))
                    .set(&goal_update_owned)
                    .execute(conn)?;
                Ok(goals.filter(id.eq(goal_id_owned)).first(conn)?)
            })
            .await
    }

    async fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(goals.find(goal_id_to_delete)).execute(conn)?)
            })
            .await
    }

    fn load_contributions_for_goal(&self, goal_id: &str) -> Result<Vec<GoalContribution>> {
        self.load_contributions_for_goal_impl(goal_id)
    }

    fn load_contributions_for_non_achieved_goals(&self) -> Result<Vec<GoalContribution>> {
        self.load_contributions_for_non_achieved_goals_impl()
    }

    fn get_total_contributions_for_account(&self, account_id: &str) -> Result<f64> {
        self.get_total_contributions_for_account_impl(account_id)
    }

    async fn insert_contribution(&self, contribution: NewGoalContribution) -> Result<GoalContribution> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<GoalContribution> {
                let now = Utc::now().to_rfc3339();
                let new_contribution = GoalContribution {
                    id: Uuid::new_v4().to_string(),
                    goal_id: contribution.goal_id,
                    account_id: contribution.account_id,
                    amount: contribution.amount,
                    contributed_at: now,
                };

                diesel::insert_into(goal_contributions::table)
                    .values(&new_contribution)
                    .execute(conn)?;

                Ok(new_contribution)
            })
            .await
    }

    async fn delete_contribution(&self, contribution_id_param: &str) -> Result<usize> {
        let id_owned = contribution_id_param.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(goal_contributions::table.find(id_owned)).execute(conn)?)
            })
            .await
    }
}
