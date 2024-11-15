use crate::goal::goal_service;
use crate::models::{Goal, GoalsAllocation, NewGoal};
use crate::AppState;
use diesel::r2d2::ConnectionManager;
use diesel::SqliteConnection;
use log::debug;
use tauri::State;

fn get_connection(
    state: &State<AppState>,
) -> Result<diesel::r2d2::PooledConnection<ConnectionManager<SqliteConnection>>, String> {
    state
        .pool
        .clone()
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))
}

#[tauri::command]
pub async fn get_goals(state: State<'_, AppState>) -> Result<Vec<Goal>, String> {
    debug!("Fetching active goals...");
    let mut conn = get_connection(&state)?;
    let service = goal_service::GoalService::new();
    service
        .get_goals(&mut conn)
        .map_err(|e| format!("Failed to load goals: {}", e))
}

#[tauri::command]
pub async fn create_goal(goal: NewGoal, state: State<'_, AppState>) -> Result<Goal, String> {
    debug!("Adding new goal...");
    let mut conn = get_connection(&state)?;
    let service = goal_service::GoalService::new();
    service
        .create_goal(&mut conn, goal)
        .map_err(|e| format!("Failed to add new goal: {}", e))
}

#[tauri::command]
pub async fn update_goal(goal: Goal, state: State<'_, AppState>) -> Result<Goal, String> {
    debug!("Updating goal...");
    let mut conn = get_connection(&state)?;
    let service = goal_service::GoalService::new();
    service
        .update_goal(&mut conn, goal)
        .map_err(|e| format!("Failed to update goal: {}", e))
}

#[tauri::command]
pub async fn delete_goal(goal_id: String, state: State<'_, AppState>) -> Result<usize, String> {
    debug!("Deleting goal...");
    let mut conn = get_connection(&state)?;
    let service = goal_service::GoalService::new();
    service
        .delete_goal(&mut conn, goal_id)
        .map_err(|e| format!("Failed to delete goal: {}", e))
}

#[tauri::command]
pub async fn update_goal_allocations(
    allocations: Vec<GoalsAllocation>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    debug!("Updating goal allocations...");
    let mut conn = get_connection(&state)?;
    let service = goal_service::GoalService::new();
    service
        .upsert_goal_allocations(&mut conn, allocations)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_goals_allocations(
    state: State<'_, AppState>,
) -> Result<Vec<GoalsAllocation>, String> {
    debug!("Loading goal allocations...");
    let mut conn = get_connection(&state)?;
    let service = goal_service::GoalService::new();
    service
        .load_goals_allocations(&mut conn)
        .map_err(|e| e.to_string())
}
