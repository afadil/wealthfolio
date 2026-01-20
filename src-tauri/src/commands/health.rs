use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use tauri::State;
use wealthfolio_core::health::{
    FixAction, HealthConfig, HealthServiceTrait, HealthStatus,
};

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

/// Internal function to run health checks by gathering data from services.
async fn run_health_checks_internal(
    state: &State<'_, Arc<ServiceContext>>,
    base_currency: &str,
) -> Result<HealthStatus, String> {
    use std::collections::HashMap;
    use wealthfolio_core::health::checks::{
        AssetHoldingInfo, ConsistencyIssueInfo, FxPairInfo, UnclassifiedAssetInfo,
    };

    let health_service = state.health_service();

    // Gather data from various services
    // For MVP, we'll start with basic checks

    // Get accounts to iterate through holdings
    let accounts = state
        .account_service()
        .get_active_accounts()
        .map_err(|e| e.to_string())?;

    let mut all_holdings: Vec<AssetHoldingInfo> = Vec::new();
    let mut latest_quote_times: HashMap<String, chrono::DateTime<chrono::Utc>> = HashMap::new();
    let mut total_portfolio_value = 0.0;

    // Gather holdings data from each account
    for account in &accounts {
        let holdings = state
            .holdings_service()
            .get_holdings(&account.id, base_currency)
            .await
            .map_err(|e| e.to_string())?;

        for holding in holdings {
            if let Some(ref instrument) = holding.instrument {
                let market_value_f64 = holding.market_value.base.to_string().parse::<f64>().unwrap_or(0.0);
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
        if let Ok(quotes) = state.quote_service().get_latest_quotes(&asset_ids) {
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
    let status = health_service
        .run_checks_with_data(
            base_currency,
            total_portfolio_value,
            &all_holdings,
            &latest_quote_times,
            &fx_pairs,
            &unclassified_assets,
            &consistency_issues,
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(status)
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
