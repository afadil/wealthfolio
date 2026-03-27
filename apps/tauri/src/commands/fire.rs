use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use tauri::State;
use wealthfolio_core::portfolio::fire::{
    FireProjection, FireSettings, MonteCarloResult, ScenarioResult, SensitivityResult,
    SorrScenario, StrategyComparisonResult,
};
use wealthfolio_core::portfolio::fire::{
    project_fire_date, run_monte_carlo, run_scenario_analysis, run_sensitivity_analysis,
    run_sequence_of_returns_risk, run_strategy_comparison,
};

const FIRE_SETTINGS_KEY: &str = "fire_planner_settings";

#[tauri::command]
pub async fn get_fire_settings(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<FireSettings>, String> {
    debug!("Fetching FIRE planner settings...");
    match state
        .settings_service()
        .get_setting_value(FIRE_SETTINGS_KEY)
        .map_err(|e| format!("Failed to load FIRE settings: {}", e))?
    {
        Some(json) => serde_json::from_str::<FireSettings>(&json)
            .map(Some)
            .map_err(|e| format!("Failed to deserialize FIRE settings: {}", e)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn save_fire_settings(
    settings: FireSettings,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Saving FIRE planner settings...");
    let json = serde_json::to_string(&settings)
        .map_err(|e| format!("Failed to serialize FIRE settings: {}", e))?;
    state
        .settings_service()
        .set_setting_value(FIRE_SETTINGS_KEY, &json)
        .await
        .map_err(|e| format!("Failed to save FIRE settings: {}", e))
}

#[tauri::command]
pub async fn calculate_fire_projection(
    settings: FireSettings,
    current_portfolio: f64,
) -> Result<FireProjection, String> {
    debug!("Calculating FIRE projection...");
    Ok(project_fire_date(&settings, current_portfolio))
}

#[tauri::command]
pub async fn run_fire_monte_carlo(
    settings: FireSettings,
    current_portfolio: f64,
    n_sims: Option<u32>,
) -> Result<MonteCarloResult, String> {
    let n = n_sims.unwrap_or(10_000);
    debug!("Running FIRE Monte Carlo ({} simulations)...", n);
    Ok(run_monte_carlo(&settings, current_portfolio, n))
}

#[tauri::command]
pub async fn run_fire_scenario_analysis(
    settings: FireSettings,
    current_portfolio: f64,
) -> Result<Vec<ScenarioResult>, String> {
    debug!("Running FIRE scenario analysis...");
    Ok(run_scenario_analysis(&settings, current_portfolio))
}

#[tauri::command]
pub async fn run_fire_sorr(
    settings: FireSettings,
    portfolio_at_fire: f64,
) -> Result<Vec<SorrScenario>, String> {
    debug!("Running FIRE sequence-of-returns risk analysis...");
    Ok(run_sequence_of_returns_risk(&settings, portfolio_at_fire))
}

#[tauri::command]
pub async fn run_fire_sensitivity(
    settings: FireSettings,
    current_portfolio: f64,
) -> Result<SensitivityResult, String> {
    debug!("Running FIRE sensitivity analysis...");
    Ok(run_sensitivity_analysis(&settings, current_portfolio))
}

#[tauri::command]
pub async fn run_fire_strategy_comparison(
    settings: FireSettings,
    current_portfolio: f64,
    n_sims: Option<u32>,
) -> Result<StrategyComparisonResult, String> {
    let n = n_sims.unwrap_or(10_000);
    debug!("Running FIRE strategy comparison ({} simulations)...", n);
    Ok(run_strategy_comparison(&settings, current_portfolio, n))
}
