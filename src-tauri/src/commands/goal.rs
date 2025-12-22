use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_resource_changed, ResourceEventPayload},
};
use log::debug;
use serde_json::json;
use tauri::{AppHandle, State};
use wealthfolio_core::goals::{Goal, GoalsAllocation, NewGoal};

#[tauri::command]
pub async fn get_goals(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Goal>, String> {
    debug!("Fetching active goals...");
    state.goal_service().get_goals().map_err(|e| e.to_string())
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
pub async fn update_goal_allocations(
    allocations: Vec<GoalsAllocation>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Updating goal allocations...");
    state
        .goal_service()
        .upsert_goal_allocations(allocations)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_goals_allocations(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<GoalsAllocation>, String> {
    debug!("Loading goal allocations...");
    state
        .goal_service()
        .load_goals_allocations()
        .map_err(|e| e.to_string())
}
