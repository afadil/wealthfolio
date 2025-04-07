use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use tauri::State;
use wealthfolio_core::goals::goals_model::{Goal, GoalsAllocation, NewGoal};

#[tauri::command]
pub async fn get_goals(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Goal>, String> {
    debug!("Fetching active goals...");
    state.goal_service().get_goals().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_goal(goal: NewGoal, state: State<'_, Arc<ServiceContext>>) -> Result<Goal, String> {
    debug!("Adding new goal...");
    state
        .goal_service()
        .create_goal(goal)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_goal(goal: Goal, state: State<'_, Arc<ServiceContext>>) -> Result<Goal, String> {
    debug!("Updating goal...");
    state
        .goal_service()
        .update_goal(goal)
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
        .map_err(|e| e.to_string())
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
