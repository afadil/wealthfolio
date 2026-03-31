use log::debug;
use wealthfolio_core::portfolio::fire::{
    project_fire_date, run_monte_carlo, run_scenario_analysis, run_sensitivity_analysis,
    run_sequence_of_returns_risk, run_strategy_comparison,
};
use wealthfolio_core::portfolio::fire::{
    FireProjection, FireSettings, MonteCarloResult, ScenarioResult, SensitivityResult,
    SorrScenario, StrategyComparisonResult,
};

fn validate_fire_settings(s: &FireSettings) -> Result<(), String> {
    if s.safe_withdrawal_rate <= 0.0 {
        return Err("Safe withdrawal rate must be positive".into());
    }
    if s.planning_horizon_age <= s.current_age {
        return Err("Planning horizon age must exceed current age".into());
    }
    if s.target_fire_age < s.current_age {
        return Err("Target FIRE age must be >= current age".into());
    }
    if s.monthly_expenses_at_fire < 0.0 || s.monthly_contribution < 0.0 {
        return Err("Monetary amounts must be non-negative".into());
    }
    // Prevent double-counting: a DC stream's linked account must not also be in the FIRE portfolio.
    // When included_account_ids is None, all investment accounts are implicitly included,
    // so any linked DC account would overlap. The frontend performs the authoritative check
    // with full account data; this is a safety net.
    for stream in &s.additional_income_streams {
        if let Some(ref linked) = stream.linked_account_id {
            match &s.included_account_ids {
                Some(included) if included.contains(linked) => {
                    return Err(format!(
                        "Account '{}' is used as both a FIRE portfolio account and a linked pension fund. Remove it from one to avoid double-counting.",
                        linked
                    ));
                }
                None => {
                    return Err(format!(
                        "Account '{}' is linked to a pension fund, but no explicit FIRE account selection is set. Select specific accounts to avoid double-counting the linked pension fund.",
                        linked
                    ));
                }
                _ => {}
            }
        }
    }
    Ok(())
}

const MAX_SIMS: u32 = 500_000;

#[tauri::command]
pub async fn calculate_fire_projection(
    settings: FireSettings,
    current_portfolio: f64,
) -> Result<FireProjection, String> {
    debug!("Calculating FIRE projection...");
    validate_fire_settings(&settings)?;
    Ok(project_fire_date(&settings, current_portfolio))
}

#[tauri::command]
pub async fn run_fire_monte_carlo(
    settings: FireSettings,
    current_portfolio: f64,
    n_sims: Option<u32>,
) -> Result<MonteCarloResult, String> {
    validate_fire_settings(&settings)?;
    let n = n_sims.unwrap_or(100_000).min(MAX_SIMS);
    debug!("Running FIRE Monte Carlo ({} simulations)...", n);
    Ok(run_monte_carlo(&settings, current_portfolio, n))
}

#[tauri::command]
pub async fn run_fire_scenario_analysis(
    settings: FireSettings,
    current_portfolio: f64,
) -> Result<Vec<ScenarioResult>, String> {
    debug!("Running FIRE scenario analysis...");
    validate_fire_settings(&settings)?;
    Ok(run_scenario_analysis(&settings, current_portfolio))
}

#[tauri::command]
pub async fn run_fire_sorr(
    settings: FireSettings,
    portfolio_at_fire: f64,
    retirement_start_age: u32,
) -> Result<Vec<SorrScenario>, String> {
    debug!("Running FIRE sequence-of-returns risk analysis...");
    validate_fire_settings(&settings)?;
    Ok(run_sequence_of_returns_risk(
        &settings,
        portfolio_at_fire,
        retirement_start_age,
    ))
}

#[tauri::command]
pub async fn run_fire_sensitivity(
    settings: FireSettings,
    current_portfolio: f64,
) -> Result<SensitivityResult, String> {
    debug!("Running FIRE sensitivity analysis...");
    validate_fire_settings(&settings)?;
    Ok(run_sensitivity_analysis(&settings, current_portfolio))
}

#[tauri::command]
pub async fn run_fire_strategy_comparison(
    settings: FireSettings,
    current_portfolio: f64,
    n_sims: Option<u32>,
) -> Result<StrategyComparisonResult, String> {
    validate_fire_settings(&settings)?;
    let n = n_sims.unwrap_or(5_000).min(MAX_SIMS);
    debug!("Running FIRE strategy comparison ({} simulations)...", n);
    Ok(run_strategy_comparison(&settings, current_portfolio, n))
}
