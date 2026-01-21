use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use tauri::State;
use wealthfolio_core::health::{FixAction, HealthConfig, HealthServiceTrait, HealthStatus};

/// Get current health status (cached or fresh check).
#[tauri::command]
pub async fn get_health_status(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HealthStatus, String> {
    debug!("Getting health status...");

    let health_service = state.health_service();

    // Try to get cached status first
    if let Some(status) = health_service.get_cached_status().await {
        if !status.is_stale {
            return Ok(status);
        }
    }

    // Run fresh checks
    let base_currency = state.get_base_currency();
    run_health_checks_internal(&state, &base_currency).await
}

/// Run health checks and return fresh status.
#[tauri::command]
pub async fn run_health_checks(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HealthStatus, String> {
    debug!("Running health checks...");
    let base_currency = state.get_base_currency();
    run_health_checks_internal(&state, &base_currency).await
}

/// Internal function to run health checks.
async fn run_health_checks_internal(
    state: &State<'_, Arc<ServiceContext>>,
    base_currency: &str,
) -> Result<HealthStatus, String> {
    state
        .health_service()
        .run_full_checks(
            base_currency,
            state.account_service(),
            state.holdings_service(),
            state.quote_service(),
            state.asset_service(),
            state.taxonomy_service(),
        )
        .await
        .map_err(|e| e.to_string())
}

/// Dismiss a health issue.
#[tauri::command]
pub async fn dismiss_health_issue(
    issue_id: String,
    data_hash: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Dismissing health issue: {}", issue_id);
    state
        .health_service()
        .dismiss_issue(&issue_id, &data_hash)
        .await
        .map_err(|e| e.to_string())
}

/// Restore a dismissed health issue.
#[tauri::command]
pub async fn restore_health_issue(
    issue_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Restoring health issue: {}", issue_id);
    state
        .health_service()
        .restore_issue(&issue_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get list of dismissed issue IDs.
#[tauri::command]
pub async fn get_dismissed_health_issues(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<String>, String> {
    debug!("Getting dismissed health issues...");
    state
        .health_service()
        .get_dismissed_ids()
        .await
        .map_err(|e| e.to_string())
}

/// Execute a fix action.
#[tauri::command]
pub async fn execute_health_fix(
    action: FixAction,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Executing health fix: {} ({})", action.label, action.id);

    // Handle migrate_legacy_classifications action specially since it needs taxonomy service
    if action.id == "migrate_legacy_classifications" {
        // Use the shared migration function from taxonomy module
        crate::commands::taxonomy::run_legacy_migration(&state).await?;
        return Ok(());
    }

    state
        .health_service()
        .execute_fix(&action)
        .await
        .map_err(|e| e.to_string())
}

/// Get health configuration.
#[tauri::command]
pub async fn get_health_config(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HealthConfig, String> {
    debug!("Getting health config...");
    Ok(state.health_service().get_config().await)
}

/// Update health configuration.
#[tauri::command]
pub async fn update_health_config(
    config: HealthConfig,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Updating health config...");
    state
        .health_service()
        .update_config(config)
        .await
        .map_err(|e| e.to_string())
}
