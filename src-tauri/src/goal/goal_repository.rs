use crate::models::{Goal, GoalsAllocation, NewGoal};
use crate::schema::goals;
use crate::schema::goals::dsl::*;
use crate::schema::goals_allocation;
use diesel::prelude::*;

use uuid::Uuid;

pub struct GoalRepository;

impl GoalRepository {
    pub fn new() -> Self {
        GoalRepository
    }

    pub fn load_goals(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Goal>, diesel::result::Error> {
        goals.load::<Goal>(conn)
    }

    pub fn insert_new_goal(
        &self,
        conn: &mut SqliteConnection,
        mut new_goal: NewGoal, // Assuming NewGoal is the struct for new goal data
    ) -> Result<Goal, diesel::result::Error> {
        new_goal.id = Some(Uuid::new_v4().to_string());

        diesel::insert_into(goals::table)
            .values(&new_goal)
            .returning(goals::all_columns) // Adjust this based on your table columns
            .get_result(conn)
    }

    pub fn update_goal(
        &self,
        conn: &mut SqliteConnection,
        goal_update: Goal, // Assuming GoalUpdate is the struct for updating goal data
    ) -> Result<Goal, diesel::result::Error> {
        // Clone the id before unwrapping it
        let goal_id = goal_update.id.clone();

        diesel::update(goals.find(goal_id))
            .set(&goal_update)
            .execute(conn)?;

        goals.filter(id.eq(goal_update.id)).first(conn)
    }

    pub fn delete_goal(
        &self,
        conn: &mut SqliteConnection,
        goal_id: String, // ID of the goal to delete
    ) -> Result<usize, diesel::result::Error> {
        diesel::delete(goals.filter(id.eq(goal_id))).execute(conn)
    }

    // pub fn load_allocations_for_non_achieved_goals3(
    //     &self,
    //     conn: &mut SqliteConnection,
    // ) -> Result<Vec<GoalsAllocation>, diesel::result::Error> {
    //     use crate::schema::goals_allocation::dsl::*;

    //     goals_allocation
    //         .select((id, goal_id, account_id, percent_allocation))
    //         .load::<GoalsAllocation>(conn)
    // }

    pub fn load_allocations_for_non_achieved_goals(
        &self,
        conn: &mut SqliteConnection,
    ) -> QueryResult<Vec<GoalsAllocation>> {
        goals_allocation::table
            .inner_join(goals::table.on(goals::id.eq(goals_allocation::goal_id)))
            .filter(goals::is_achieved.eq(false))
            .select((
                goals_allocation::id,
                goals_allocation::goal_id,
                goals_allocation::account_id,
                goals_allocation::percent_allocation,
            ))
            .load::<GoalsAllocation>(conn)
    }

    pub fn upsert_goal_allocations(
        &self,
        conn: &mut SqliteConnection,
        allocations: Vec<GoalsAllocation>,
    ) -> QueryResult<usize> {
        use crate::schema::goals_allocation::dsl::{account_id, goal_id, id, percent_allocation};
        use crate::schema::goals_allocation::table as goals_allocation;
        use diesel::insert_or_ignore_into;

        let mut count = 0;
        for alloc in allocations {
            let rows_affected = insert_or_ignore_into(goals_allocation)
                .values(&alloc)
                .execute(conn)?;

            if rows_affected == 0 {
                diesel::update(goals_allocation.filter(id.eq(alloc.id)))
                    .set((
                        percent_allocation.eq(alloc.percent_allocation),
                        goal_id.eq(alloc.goal_id),
                        account_id.eq(alloc.account_id),
                    ))
                    .execute(conn)?;
            }

            count += 1;
        }

        Ok(count)
    }
}
