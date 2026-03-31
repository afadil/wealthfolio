//! Goals domain models.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Domain model representing a goal
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub goal_type: String,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: Option<f64>,
    pub is_achieved: bool,
    pub status_lifecycle: String,
    pub status_health: String,
    pub is_archived: bool,
    pub priority: i32,
    pub cover_image_key: Option<String>,
    pub currency: Option<String>,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub current_value_cached: Option<f64>,
    pub progress_cached: Option<f64>,
    pub projected_completion_date: Option<String>,
    pub projected_value_at_target_date: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
    pub target_amount_cached: Option<f64>,
}

/// Input model for creating a new goal
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewGoal {
    pub id: Option<String>,
    pub goal_type: String,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: Option<f64>,
    pub is_achieved: bool,
    pub status_lifecycle: Option<String>,
    pub status_health: Option<String>,
    pub is_archived: Option<bool>,
    pub priority: Option<i32>,
    pub cover_image_key: Option<String>,
    pub currency: Option<String>,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Domain model for goal funding rules (stored in goals_allocation table)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoalFundingRule {
    pub id: String,
    pub goal_id: String,
    pub account_id: String,
    pub funding_role: String,
    pub reservation_percent: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

/// Input for saving funding rules for a goal
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoalFundingRuleInput {
    pub account_id: String,
    pub funding_role: String,
    pub reservation_percent: Option<f64>,
}

/// Cached field updates written back to goal root after summary computation
#[derive(Debug, Clone)]
pub struct GoalCachedUpdate {
    pub target_amount_cached: Option<f64>,
    pub current_value_cached: Option<f64>,
    pub progress_cached: Option<f64>,
    pub projected_completion_date: Option<String>,
    pub projected_value_at_target_date: Option<f64>,
    pub status_health: String,
}

/// Domain model for a goal plan (1:1 with goal for complex goal types)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoalPlan {
    pub goal_id: String,
    pub plan_kind: String,
    pub planner_mode: Option<String>,
    pub settings_json: String,
    pub summary_json: String,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Input model for creating/updating a goal plan
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveGoalPlan {
    pub goal_id: String,
    pub plan_kind: String,
    pub planner_mode: Option<String>,
    pub settings_json: String,
    pub summary_json: Option<String>,
}

/// Account valuations map: account_id → total value in base currency
pub type AccountValuationMap = HashMap<String, f64>;
