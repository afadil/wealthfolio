use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use wealthfolio_core::health::{FixAction, HealthConfig, HealthStatus};

/// Get current health status (cached or fresh check).
async fn get_health_status(State(state): State<Arc<AppState>>) -> ApiResult<Json<HealthStatus>> {
    // Try to get cached status first
    if let Some(status) = state.health_service.get_cached_status().await {
        if !status.is_stale {
            return Ok(Json(status));
        }
    }

    // Run fresh checks
    let base_currency = state.base_currency.read().unwrap().clone();
    let status = run_health_checks_internal(&state, &base_currency).await?;
    Ok(Json(status))
}

/// Run health checks and return fresh status.
async fn run_health_checks(State(state): State<Arc<AppState>>) -> ApiResult<Json<HealthStatus>> {
    let base_currency = state.base_currency.read().unwrap().clone();
    let status = run_health_checks_internal(&state, &base_currency).await?;
    Ok(Json(status))
}

/// Internal function to run health checks.
async fn run_health_checks_internal(
    state: &Arc<AppState>,
    base_currency: &str,
) -> Result<HealthStatus, anyhow::Error> {
    state
        .health_service
        .run_full_checks(
            base_currency,
            state.account_service.clone(),
            state.holdings_service.clone(),
            state.quote_service.clone(),
            state.asset_service.clone(),
            state.taxonomy_service.clone(),
        )
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DismissRequest {
    issue_id: String,
    data_hash: String,
}

/// Dismiss a health issue.
async fn dismiss_health_issue(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DismissRequest>,
) -> ApiResult<()> {
    state
        .health_service
        .dismiss_issue(&body.issue_id, &body.data_hash)
        .await?;
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreRequest {
    issue_id: String,
}

/// Restore a dismissed health issue.
async fn restore_health_issue(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RestoreRequest>,
) -> ApiResult<()> {
    state.health_service.restore_issue(&body.issue_id).await?;
    Ok(())
}

/// Get list of dismissed issue IDs.
async fn get_dismissed_health_issues(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<String>>> {
    let ids = state.health_service.get_dismissed_ids().await?;
    Ok(Json(ids))
}

/// Execute a fix action.
async fn execute_health_fix(
    State(state): State<Arc<AppState>>,
    Json(action): Json<FixAction>,
) -> ApiResult<()> {
    // Handle migrate_legacy_classifications action specially
    if action.id == "migrate_legacy_classifications" {
        wealthfolio_core::health::migrate_legacy_classifications(
            state.asset_service.as_ref(),
            state.taxonomy_service.as_ref(),
        )
        .await?;
        return Ok(());
    }

    state.health_service.execute_fix(&action).await?;
    Ok(())
}

/// Get health configuration.
async fn get_health_config(State(state): State<Arc<AppState>>) -> ApiResult<Json<HealthConfig>> {
    let config = state.health_service.get_config().await;
    Ok(Json(config))
}

/// Update health configuration.
async fn update_health_config(
    State(state): State<Arc<AppState>>,
    Json(config): Json<HealthConfig>,
) -> ApiResult<()> {
    state.health_service.update_config(config).await?;
    Ok(())
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health/status", get(get_health_status))
        .route("/health/check", post(run_health_checks))
        .route("/health/dismiss", post(dismiss_health_issue))
        .route("/health/restore", post(restore_health_issue))
        .route("/health/dismissed", get(get_dismissed_health_issues))
        .route("/health/fix", post(execute_health_fix))
        .route(
            "/health/config",
            get(get_health_config).put(update_health_config),
        )
}
