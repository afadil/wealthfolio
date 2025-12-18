use crate::accounts::Account;
use diesel::prelude::*;
use diesel::Queryable;
use diesel::Selectable;
use serde::{Deserialize, Serialize};

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
pub struct Goal {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: f64,
    pub is_achieved: bool,
}

#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::goals)]
#[serde(rename_all = "camelCase")]
pub struct NewGoal {
    pub id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: f64,
    pub is_achieved: bool,
}

/// Represents a manual contribution to a goal from an account
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
#[diesel(belongs_to(Goal))]
#[diesel(belongs_to(Account))]
#[diesel(table_name = crate::schema::goal_contributions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct GoalContribution {
    pub id: String,
    pub goal_id: String,
    pub account_id: String,
    pub amount: f64,
    pub contributed_at: String,
}

/// Input for creating a new contribution
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewGoalContribution {
    pub goal_id: String,
    pub account_id: String,
    pub amount: f64,
}

/// Extended contribution with at-risk status for frontend display
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoalContributionWithStatus {
    pub id: String,
    pub goal_id: String,
    pub account_id: String,
    pub account_name: String,
    pub account_currency: String,
    pub amount: f64,
    pub contributed_at: String,
    pub is_at_risk: bool,
    pub at_risk_amount: Option<f64>,
}

/// Summary of free cash per account
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountFreeCash {
    pub account_id: String,
    pub account_name: String,
    pub account_currency: String,
    pub cash_balance: f64,
    pub total_contributions: f64,
    pub free_cash: f64,
}

/// Goal with contributions and progress
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoalWithContributions {
    pub goal: Goal,
    pub contributions: Vec<GoalContributionWithStatus>,
    pub total_contributed: f64,
    pub progress: f64,
    pub has_at_risk_contributions: bool,
}
