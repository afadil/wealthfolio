use crate::goal::goal_service;
use crate::models::{Goal, GoalsAllocation, NewGoal};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn get_goals(state: State<AppState>) -> Result<Vec<Goal>, String> {
    println!("Fetching active goals..."); // Log message
    let mut conn = state.conn.lock().unwrap();
    let service = goal_service::GoalService::new();
    service
        .get_goals(&mut conn)
        .map_err(|e| format!("Failed to load goals: {}", e))
}

#[tauri::command]
pub fn create_goal(goal: NewGoal, state: State<AppState>) -> Result<Goal, String> {
    println!("Adding new goal..."); // Log message
    let mut conn = state.conn.lock().unwrap();
    let service = goal_service::GoalService::new();
    service
        .create_goal(&mut conn, goal)
        .map_err(|e| format!("Failed to add new goal: {}", e))
}

#[tauri::command]
pub fn update_goal(goal: Goal, state: State<AppState>) -> Result<Goal, String> {
    println!("Updating goal..."); // Log message
    let mut conn = state.conn.lock().unwrap();
    let service = goal_service::GoalService::new();
    service
        .update_goal(&mut conn, goal)
        .map_err(|e| format!("Failed to update goal: {}", e))
}

#[tauri::command]
pub fn delete_goal(goal_id: String, state: State<AppState>) -> Result<usize, String> {
    println!("Deleting goal..."); // Log message
    let mut conn = state.conn.lock().unwrap();
    let service = goal_service::GoalService::new();
    service
        .delete_goal(&mut conn, goal_id)
        .map_err(|e| format!("Failed to delete goal: {}", e))
}

#[tauri::command]
pub fn update_goal_allocations(
    allocations: Vec<GoalsAllocation>,
    state: State<AppState>,
) -> Result<usize, String> {
    print!("Get goals allocations...");
    let mut conn = state.conn.lock().unwrap();
    let service = goal_service::GoalService::new();
    service
        .upsert_goal_allocations(&mut conn, allocations)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_goals_allocations(state: State<AppState>) -> Result<Vec<GoalsAllocation>, String> {
    print!("Upserting goal allocations...");
    let mut conn = state.conn.lock().unwrap();
    let service = goal_service::GoalService::new();
    service
        .load_goals_allocations(&mut conn)
        .map_err(|e| e.to_string())
}
