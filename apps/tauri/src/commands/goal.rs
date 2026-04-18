use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use tauri::State;
use wealthfolio_core::goals::{
    Goal, GoalFundingRule, GoalFundingRuleInput, GoalPlan, NewGoal, SaveGoalPlan,
};
use wealthfolio_core::planning::SaveUpOverview;
use wealthfolio_core::portfolio::fire::RetirementOverview;

#[tauri::command]
pub async fn get_goals(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Goal>, String> {
    debug!("Fetching goals...");
    state.goal_service().get_goals().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_goal(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Goal, String> {
    debug!("Fetching goal {}...", goal_id);
    state
        .goal_service()
        .get_goal(&goal_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_goal(
    goal: NewGoal,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Goal, String> {
    debug!("Creating new goal...");
    state
        .goal_service()
        .create_goal(goal)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_goal(
    goal: Goal,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Goal, String> {
    debug!("Updating goal...");
    state
        .goal_service()
        .update_goal(goal)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_goal(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Deleting goal...");
    state
        .goal_service()
        .delete_goal(goal_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_goal_funding(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<GoalFundingRule>, String> {
    debug!("Fetching funding rules for goal {}...", goal_id);
    state
        .goal_service()
        .get_goal_funding(&goal_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_goal_funding(
    goal_id: String,
    rules: Vec<GoalFundingRuleInput>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<GoalFundingRule>, String> {
    debug!("Saving funding rules for goal {}...", goal_id);
    let result = state
        .goal_service()
        .save_goal_funding(&goal_id, rules)
        .await
        .map_err(|e| e.to_string())?;

    // Auto-refresh summary after funding change
    let _ = refresh_summary_internal(&state, &goal_id).await;

    Ok(result)
}

#[tauri::command]
pub async fn get_goal_plan(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<GoalPlan>, String> {
    debug!("Fetching goal plan for {}...", goal_id);
    state
        .goal_service()
        .get_goal_plan(&goal_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_goal_plan(
    plan: SaveGoalPlan,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<GoalPlan, String> {
    debug!("Saving goal plan for {}...", plan.goal_id);
    let goal_id = plan.goal_id.clone();
    let result = state
        .goal_service()
        .save_goal_plan(plan)
        .await
        .map_err(|e| e.to_string())?;

    // Auto-refresh summary after plan change
    let _ = refresh_summary_internal(&state, &goal_id).await;

    Ok(result)
}

#[tauri::command]
pub async fn delete_goal_plan(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Deleting goal plan for {}...", goal_id);
    state
        .goal_service()
        .delete_goal_plan(&goal_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn refresh_goal_summary(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Goal, String> {
    debug!("Refreshing goal summary for {}...", goal_id);
    refresh_summary_internal(&state, &goal_id).await
}

#[tauri::command]
pub async fn refresh_all_goal_summaries(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Goal>, String> {
    debug!("Refreshing all goal summaries...");
    let goals = state
        .goal_service()
        .get_goals()
        .map_err(|e| e.to_string())?;

    let valuation_map = build_valuation_map(&state).await?;

    let mut results = Vec::new();
    for goal in &goals {
        if goal.status_lifecycle != "active" {
            continue;
        }
        match state
            .goal_service()
            .refresh_goal_summary(&goal.id, &valuation_map)
            .await
        {
            Ok(g) => results.push(g),
            Err(e) => debug!("Failed to refresh goal {}: {}", goal.id, e),
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_retirement_overview(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<RetirementOverview, String> {
    debug!("Computing retirement overview for goal {}...", goal_id);
    let valuation_map = build_valuation_map(&state).await?;
    state
        .goal_service()
        .compute_retirement_overview(&goal_id, &valuation_map)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_save_up_overview(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<SaveUpOverview, String> {
    debug!("Computing save-up overview for goal {}...", goal_id);
    let valuation_map = build_valuation_map(&state).await?;
    state
        .goal_service()
        .compute_save_up_overview(&goal_id, &valuation_map)
        .await
        .map_err(|e| e.to_string())
}

/// Internal helper: fetch valuations and refresh goal summary.
async fn refresh_summary_internal(
    state: &State<'_, Arc<ServiceContext>>,
    goal_id: &str,
) -> Result<Goal, String> {
    let valuation_map = build_valuation_map(state).await?;
    state
        .goal_service()
        .refresh_goal_summary(goal_id, &valuation_map)
        .await
        .map_err(|e| e.to_string())
}

/// Build account_id → base-currency value map from latest valuations.
async fn build_valuation_map(
    state: &State<'_, Arc<ServiceContext>>,
) -> Result<std::collections::HashMap<String, f64>, String> {
    let accounts = state
        .account_service()
        .get_active_non_archived_accounts()
        .map_err(|e| e.to_string())?;
    let account_ids: Vec<String> = accounts.into_iter().map(|a| a.id).collect();
    let valuations = state
        .valuation_service()
        .get_latest_valuations(&account_ids)
        .map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for v in &valuations {
        let value_in_base = v.total_value.to_string().parse::<f64>().unwrap_or(0.0)
            * v.fx_rate_to_base.to_string().parse::<f64>().unwrap_or(1.0);
        map.insert(v.account_id.clone(), value_in_base);
    }
    Ok(map)
}
