use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use tauri::State;
use wealthfolio_core::limits::{ContributionLimit, DepositsCalculation, NewContributionLimit};

#[tauri::command]
pub async fn get_contribution_limits(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ContributionLimit>, String> {
    debug!("Fetching contribution limits...");
    state
        .limits_service()
        .get_contribution_limits()
        .map_err(|e| format!("Failed to load contribution limits: {}", e))
}

#[tauri::command]
pub async fn create_contribution_limit(
    new_limit: NewContributionLimit,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ContributionLimit, String> {
    debug!("Creating new contribution limit...");
    state
        .limits_service()
        .create_contribution_limit(new_limit)
        .map_err(|e| format!("Failed to create contribution limit: {}", e))
}

#[tauri::command]
pub async fn update_contribution_limit(
    id: String,
    updated_limit: NewContributionLimit,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ContributionLimit, String> {
    debug!("Updating contribution limit...");
    state
        .limits_service()
        .update_contribution_limit(&id, updated_limit)
        .map_err(|e| format!("Failed to update contribution limit: {}", e))
}

#[tauri::command]
pub async fn delete_contribution_limit(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Deleting contribution limit...");
    state
        .limits_service()
        .delete_contribution_limit(&id)
        .map_err(|e| format!("Failed to delete contribution limit: {}", e))
}


#[tauri::command]
pub async fn calculate_deposits_for_contribution_limit(
    limit_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<DepositsCalculation, String> {
    debug!("Calculating deposits for contribution limit...");
    let base_currency = state.base_currency.read().unwrap();
    state
        .limits_service()
        .calculate_deposits_for_contribution_limit(&limit_id, &base_currency)
        .map_err(|e| format!("Failed to calculate deposits for contribution limit: {}", e))
}

