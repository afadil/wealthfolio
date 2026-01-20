use std::collections::HashMap;
use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use wealthfolio_core::accounts::AccountServiceTrait;
use wealthfolio_core::health::{
    checks::{AssetHoldingInfo, ConsistencyIssueInfo, FxPairInfo, UnclassifiedAssetInfo},
    FixAction, HealthConfig, HealthStatus,
};

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

/// Internal function to run health checks by gathering data from services.
async fn run_health_checks_internal(
    state: &Arc<AppState>,
    base_currency: &str,
) -> Result<HealthStatus, anyhow::Error> {
    // Get accounts to iterate through holdings
    let accounts = state.account_service.get_active_accounts()?;

    let mut all_holdings: Vec<AssetHoldingInfo> = Vec::new();
    let mut latest_quote_times: HashMap<String, chrono::DateTime<chrono::Utc>> = HashMap::new();
    let mut total_portfolio_value = 0.0;

    // Gather holdings data from each account
    for account in &accounts {
        let holdings = state
            .holdings_service
            .get_holdings(&account.id, base_currency)
            .await?;

        for holding in holdings {
            if let Some(ref instrument) = holding.instrument {
                let market_value_f64 = holding
                    .market_value
                    .base
                    .to_string()
                    .parse::<f64>()
                    .unwrap_or(0.0);
                total_portfolio_value += market_value_f64;

                // Determine if uses market pricing
                let uses_market_pricing = instrument.pricing_mode.to_uppercase() == "MARKET";

                all_holdings.push(AssetHoldingInfo {
                    asset_id: instrument.id.clone(),
                    market_value: market_value_f64,
                    uses_market_pricing,
                });
            }
        }
    }

    // Get latest quote timestamps for held assets
    let asset_ids: Vec<String> = all_holdings.iter().map(|h| h.asset_id.clone()).collect();
    if !asset_ids.is_empty() {
        if let Ok(quotes) = state.quote_service.get_latest_quotes(&asset_ids) {
            for (asset_id, quote) in quotes {
                latest_quote_times.insert(asset_id, quote.timestamp);
            }
        }
    }

    // For now, we'll use empty data for FX, unclassified, and consistency checks
    // These can be enhanced later with proper data gathering
    let fx_pairs: Vec<FxPairInfo> = Vec::new();
    let unclassified_assets: Vec<UnclassifiedAssetInfo> = Vec::new();
    let consistency_issues: Vec<ConsistencyIssueInfo> = Vec::new();

    // Run checks with gathered data
    let status = state
        .health_service
        .run_checks_with_data(
            base_currency,
            total_portfolio_value,
            &all_holdings,
            &latest_quote_times,
            &fx_pairs,
            &unclassified_assets,
            &consistency_issues,
        )
        .await?;

    Ok(status)
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
        .route("/health/config", get(get_health_config).put(update_health_config))
}
