use crate::goals::goals_model::{Goal, GoalsAllocation, NewGoal};
use crate::AppState;
use log::debug;
use tauri::State;
use crate::goals::GoalService;
use crate::goals::GoalError;


#[tauri::command]
pub async fn get_goals(state: State<'_, AppState>) -> Result<Vec<Goal>, String> {
    debug!("Fetching active goals...");
    let service = GoalService::new(state.pool.clone());
    service
        .get_goals()
        .map_err(|e| match e {
            GoalError::Database(e) => format!("Database error: {}", e),
            GoalError::Pool(e) => format!("Connection pool error: {}", e),
        })
}

#[tauri::command]
pub async fn create_goal(goal: NewGoal, state: State<'_, AppState>) -> Result<Goal, String> {
    debug!("Adding new goal...");
    let service = GoalService::new(state.pool.clone());
    service
        .create_goal(goal)
        .map_err(|e| match e {
            GoalError::Database(e) => format!("Database error: {}", e),
            GoalError::Pool(e) => format!("Connection pool error: {}", e),
        })
}

#[tauri::command]
pub async fn update_goal(goal: Goal, state: State<'_, AppState>) -> Result<Goal, String> {
    debug!("Updating goal...");
    let service = GoalService::new(state.pool.clone());
    service
        .update_goal(goal)
        .map_err(|e| match e {
            GoalError::Database(e) => format!("Database error: {}", e),
            GoalError::Pool(e) => format!("Connection pool error: {}", e),
        })
}

#[tauri::command]
pub async fn delete_goal(goal_id: String, state: State<'_, AppState>) -> Result<usize, String> {
    debug!("Deleting goal...");
    let service = GoalService::new(state.pool.clone());
    service
        .delete_goal(goal_id)
        .map_err(|e| match e {
            GoalError::Database(e) => format!("Database error: {}", e),
            GoalError::Pool(e) => format!("Connection pool error: {}", e),
        })
}

#[tauri::command]
pub async fn update_goal_allocations(
    allocations: Vec<GoalsAllocation>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    debug!("Updating goal allocations...");
    let service = GoalService::new(state.pool.clone());
    service
        .upsert_goal_allocations(allocations)
        .map_err(|e| match e {
            GoalError::Database(e) => format!("Database error: {}", e),
            GoalError::Pool(e) => format!("Connection pool error: {}", e),
        })
}

#[tauri::command]
pub async fn load_goals_allocations(state: State<'_, AppState>) -> Result<Vec<GoalsAllocation>, String> {
    debug!("Loading goal allocations...");
    let service = GoalService::new(state.pool.clone());
    service
        .load_goals_allocations()
        .map_err(|e| match e {
            GoalError::Database(e) => format!("Database error: {}", e),
            GoalError::Pool(e) => format!("Connection pool error: {}", e),
        })
}
