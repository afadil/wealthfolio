use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_resource_changed, ResourceEventPayload},
};
use log::debug;
use serde_json::json;
use tauri::{AppHandle, State};
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
    handle: AppHandle,
) -> Result<ContributionLimit, String> {
    debug!("Creating new contribution limit...");
    let new_limit = state
        .limits_service()
        .create_contribution_limit(new_limit)
        .await
        .map_err(|e| format!("Failed to create contribution limit: {}", e))?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "contribution_limit",
            "created",
            json!({ "limit_id": new_limit.id }),
        ),
    );

    Ok(new_limit)
}

#[tauri::command]
pub async fn update_contribution_limit(
    id: String,
    updated_limit: NewContributionLimit,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<ContributionLimit, String> {
    debug!("Updating contribution limit...");
    let updated_limit = state
        .limits_service()
        .update_contribution_limit(&id, updated_limit)
        .await
        .map_err(|e| format!("Failed to update contribution limit: {}", e))?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("contribution_limit", "updated", json!({ "limit_id": id })),
    );

    Ok(updated_limit)
}

#[tauri::command]
pub async fn delete_contribution_limit(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    debug!("Deleting contribution limit...");
    state
        .limits_service()
        .delete_contribution_limit(&id)
        .await
        .map_err(|e| format!("Failed to delete contribution limit: {}", e))?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("contribution_limit", "deleted", json!({ "limit_id": id })),
    );

    Ok(())
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
