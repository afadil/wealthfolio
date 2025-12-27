use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_resource_changed, ResourceEventPayload},
};
use log::debug;
use serde_json::json;
use tauri::{AppHandle, State};
use wealthfolio_core::goals::{
    AccountFreeCash, Goal, GoalContributionWithStatus, GoalWithContributions, NewGoal,
    NewGoalContribution,
};

#[tauri::command]
pub async fn get_goals(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Goal>, String> {
    debug!("Fetching active goals...");
    state.goal_service().get_goals().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_goals_with_contributions(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<GoalWithContributions>, String> {
    debug!("Fetching goals with contributions...");
    state
        .goal_service()
        .get_goals_with_contributions()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_goal(
    goal: NewGoal,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Goal, String> {
    debug!("Adding new goal...");
    let new_goal = state
        .goal_service()
        .create_goal(goal)
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("goal", "created", json!({ "goal_id": new_goal.id })),
    );

    Ok(new_goal)
}

#[tauri::command]
pub async fn update_goal(
    goal: Goal,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Goal, String> {
    debug!("Updating goal...");
    let goal_id = goal.id.clone();
    let updated_goal = state
        .goal_service()
        .update_goal(goal)
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("goal", "updated", json!({ "goal_id": goal_id })),
    );

    Ok(updated_goal)
}

#[tauri::command]
pub async fn delete_goal(
    goal_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<usize, String> {
    debug!("Deleting goal...");
    let result = state
        .goal_service()
        .delete_goal(goal_id.clone())
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("goal", "deleted", json!({ "goal_id": goal_id })),
    );

    Ok(result)
}

#[tauri::command]
pub async fn get_account_free_cash(
    account_ids: Vec<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AccountFreeCash>, String> {
    debug!("Fetching account free cash...");
    state
        .goal_service()
        .get_account_free_cash(&account_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_goal_contribution(
    contribution: NewGoalContribution,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<GoalContributionWithStatus, String> {
    debug!("Adding goal contribution...");
    let result = state
        .goal_service()
        .add_contribution(contribution)
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "goal_contribution",
            "created",
            json!({ "goal_id": result.goal_id, "contribution_id": result.id }),
        ),
    );

    Ok(result)
}

#[tauri::command]
pub async fn remove_goal_contribution(
    contribution_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<usize, String> {
    debug!("Removing goal contribution...");
    let result = state
        .goal_service()
        .remove_contribution(&contribution_id)
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "goal_contribution",
            "deleted",
            json!({ "contribution_id": contribution_id }),
        ),
    );

    Ok(result)
}
