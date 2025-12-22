//! Database models for goals.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::accounts::AccountDB;

/// Database model for goals
#[derive(
    Queryable,
    Identifiable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::goals)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct GoalDB {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: f64,
    pub is_achieved: bool,
}

/// Database model for creating a new goal
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::goals)]
#[serde(rename_all = "camelCase")]
pub struct NewGoalDB {
    pub id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: f64,
    pub is_achieved: bool,
}

/// Database model for goal allocations
#[derive(
    Insertable,
    Queryable,
    Identifiable,
    Associations,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(belongs_to(GoalDB, foreign_key = goal_id))]
#[diesel(belongs_to(AccountDB, foreign_key = account_id))]
#[diesel(table_name = crate::schema::goals_allocation)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct GoalsAllocationDB {
    pub id: String,
    pub goal_id: String,
    pub account_id: String,
    pub percent_allocation: i32,
}

// Conversion to domain models
impl From<GoalDB> for wealthfolio_core::goals::Goal {
    fn from(db: GoalDB) -> Self {
        Self {
            id: db.id,
            title: db.title,
            description: db.description,
            target_amount: db.target_amount,
            is_achieved: db.is_achieved,
        }
    }
}

impl From<GoalsAllocationDB> for wealthfolio_core::goals::GoalsAllocation {
    fn from(db: GoalsAllocationDB) -> Self {
        Self {
            id: db.id,
            goal_id: db.goal_id,
            account_id: db.account_id,
            percent_allocation: db.percent_allocation,
        }
    }
}

impl From<wealthfolio_core::goals::NewGoal> for NewGoalDB {
    fn from(domain: wealthfolio_core::goals::NewGoal) -> Self {
        Self {
            id: domain.id,
            title: domain.title,
            description: domain.description,
            target_amount: domain.target_amount,
            is_achieved: domain.is_achieved,
        }
    }
}

impl From<wealthfolio_core::goals::GoalsAllocation> for GoalsAllocationDB {
    fn from(domain: wealthfolio_core::goals::GoalsAllocation) -> Self {
        Self {
            id: domain.id,
            goal_id: domain.goal_id,
            account_id: domain.account_id,
            percent_allocation: domain.percent_allocation,
        }
    }
}
