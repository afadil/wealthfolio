use crate::AppState;
use log::debug;
use tauri::State;
use wealthfolio_core::limits::{ContributionLimit, ContributionLimitService, DepositsCalculation, NewContributionLimit};

#[tauri::command]
pub async fn get_contribution_limits(
    state: State<'_, AppState>,
) -> Result<Vec<ContributionLimit>, String> {
    debug!("Fetching contribution limits...");
    let service = ContributionLimitService::new(state.pool.clone());
    service
        .get_contribution_limits()
        .map_err(|e| format!("Failed to load contribution limits: {}", e))
}

#[tauri::command]
pub async fn create_contribution_limit(
    new_limit: NewContributionLimit,
    state: State<'_, AppState>,
) -> Result<ContributionLimit, String> {
    debug!("Creating new contribution limit...");
    let service = ContributionLimitService::new(state.pool.clone());
    service
        .create_contribution_limit(new_limit)
        .map_err(|e| format!("Failed to create contribution limit: {}", e))
}

#[tauri::command]
pub async fn update_contribution_limit(
    id: String,
    updated_limit: NewContributionLimit,
    state: State<'_, AppState>,
) -> Result<ContributionLimit, String> {
    debug!("Updating contribution limit...");
    let service = ContributionLimitService::new(state.pool.clone());
    service
        .update_contribution_limit(&id, updated_limit)
        .map_err(|e| format!("Failed to update contribution limit: {}", e))
}

#[tauri::command]
pub async fn delete_contribution_limit(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    debug!("Deleting contribution limit...");
    let service = ContributionLimitService::new(state.pool.clone());
    service
        .delete_contribution_limit(&id)
        .map_err(|e| format!("Failed to delete contribution limit: {}", e))
}


#[tauri::command]
pub async fn calculate_deposits_for_contribution_limit(
    limit_id: String,
    state: State<'_, AppState>,
) -> Result<DepositsCalculation, String> {
    debug!("Calculating deposits for contribution limit...");
    let service = ContributionLimitService::new(state.pool.clone());
    let base_currency = state.get_base_currency();
    service
        .calculate_deposits_for_contribution_limit(&limit_id, &base_currency)
        .map_err(|e| format!("Failed to calculate deposits for contribution limit: {}", e))
}

