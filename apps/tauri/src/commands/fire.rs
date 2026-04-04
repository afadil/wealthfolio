use std::sync::Arc;

use tauri::State;

use crate::context::ServiceContext;
use wealthfolio_core::goals::validate_retirement_plan;
use wealthfolio_core::planning::retirement::{RetirementPlan, RetirementTimingMode};
use wealthfolio_core::portfolio::fire::{
    project_retirement_with_mode, run_monte_carlo_with_mode, run_scenario_analysis_with_mode,
    run_sensitivity_analysis_with_mode, run_sorr, run_strategy_comparison_with_mode,
};
use wealthfolio_core::portfolio::fire::{
    FireProjection, MonteCarloResult, ScenarioResult, SensitivityResult, SorrScenario,
    StrategyComparisonResult,
};

const MAX_SIMS: u32 = 500_000;

fn validate_plan(plan: &RetirementPlan) -> Result<(), String> {
    validate_retirement_plan(plan).map_err(|e| e.to_string())
}

async fn build_valuation_map(
    state: &State<'_, Arc<ServiceContext>>,
) -> Result<std::collections::HashMap<String, f64>, String> {
    let accounts = state
        .account_service()
        .get_active_accounts()
        .map_err(|e| e.to_string())?;
    let account_ids: Vec<String> = accounts.into_iter().map(|a| a.id).collect();
    let valuations = state
        .valuation_service()
        .get_latest_valuations(&account_ids)
        .map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for v in &valuations {
        let value_in_base = v.total_value.to_string().parse::<f64>().unwrap_or(0.0)
            * v.fx_rate_to_base.to_string().parse::<f64>().unwrap_or(1.0);
        map.insert(v.account_id.clone(), value_in_base);
    }
    Ok(map)
}

async fn resolve_retirement_inputs(
    state: &State<'_, Arc<ServiceContext>>,
    goal_id: &Option<String>,
    planner_mode: Option<RetirementTimingMode>,
    plan: RetirementPlan,
    current_portfolio: f64,
) -> Result<(RetirementPlan, f64, RetirementTimingMode), String> {
    if let Some(goal_id) = goal_id {
        let valuation_map = build_valuation_map(state).await?;
        let prepared = state
            .goal_service()
            .prepare_retirement_simulation_input(goal_id, &valuation_map)
            .await
            .map_err(|e| e.to_string())?;
        Ok((
            prepared.plan,
            prepared.current_portfolio,
            prepared.planner_mode,
        ))
    } else {
        validate_plan(&plan)?;
        Ok((
            plan,
            current_portfolio,
            planner_mode.unwrap_or(RetirementTimingMode::Fire),
        ))
    }
}

// ─── RetirementPlan-based commands ───────────────────────────────────────────

#[tauri::command]
pub async fn calculate_retirement_projection(
    plan: RetirementPlan,
    current_portfolio: f64,
    goal_id: Option<String>,
    planner_mode: Option<RetirementTimingMode>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<FireProjection, String> {
    let (plan, current_portfolio, planner_mode) =
        resolve_retirement_inputs(&state, &goal_id, planner_mode, plan, current_portfolio).await?;
    Ok(project_retirement_with_mode(
        &plan,
        current_portfolio,
        planner_mode,
    ))
}

#[tauri::command]
pub async fn run_retirement_monte_carlo(
    plan: RetirementPlan,
    current_portfolio: f64,
    n_sims: Option<u32>,
    goal_id: Option<String>,
    planner_mode: Option<RetirementTimingMode>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<MonteCarloResult, String> {
    let n = n_sims.unwrap_or(10_000).min(MAX_SIMS);
    let (plan, current_portfolio, planner_mode) =
        resolve_retirement_inputs(&state, &goal_id, planner_mode, plan, current_portfolio).await?;
    Ok(run_monte_carlo_with_mode(
        &plan,
        current_portfolio,
        n,
        planner_mode,
    ))
}

#[tauri::command]
pub async fn run_retirement_scenario_analysis(
    plan: RetirementPlan,
    current_portfolio: f64,
    goal_id: Option<String>,
    planner_mode: Option<RetirementTimingMode>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ScenarioResult>, String> {
    let (plan, current_portfolio, planner_mode) =
        resolve_retirement_inputs(&state, &goal_id, planner_mode, plan, current_portfolio).await?;
    Ok(run_scenario_analysis_with_mode(
        &plan,
        current_portfolio,
        planner_mode,
    ))
}

#[tauri::command]
pub async fn run_retirement_sorr(
    plan: RetirementPlan,
    portfolio_at_fire: f64,
    retirement_start_age: u32,
    goal_id: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<SorrScenario>, String> {
    let plan = if let Some(goal_id) = &goal_id {
        let valuation_map = build_valuation_map(&state).await?;
        state
            .goal_service()
            .prepare_retirement_simulation_input(goal_id, &valuation_map)
            .await
            .map_err(|e| e.to_string())?
            .plan
    } else {
        validate_plan(&plan)?;
        plan
    };
    Ok(run_sorr(&plan, portfolio_at_fire, retirement_start_age))
}

#[tauri::command]
pub async fn run_retirement_sensitivity(
    plan: RetirementPlan,
    current_portfolio: f64,
    goal_id: Option<String>,
    planner_mode: Option<RetirementTimingMode>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<SensitivityResult, String> {
    let (plan, current_portfolio, planner_mode) =
        resolve_retirement_inputs(&state, &goal_id, planner_mode, plan, current_portfolio).await?;
    Ok(run_sensitivity_analysis_with_mode(
        &plan,
        current_portfolio,
        planner_mode,
    ))
}

#[tauri::command]
pub async fn run_retirement_strategy_comparison(
    plan: RetirementPlan,
    current_portfolio: f64,
    n_sims: Option<u32>,
    goal_id: Option<String>,
    planner_mode: Option<RetirementTimingMode>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<StrategyComparisonResult, String> {
    let n = n_sims.unwrap_or(10_000).min(MAX_SIMS);
    let (plan, current_portfolio, planner_mode) =
        resolve_retirement_inputs(&state, &goal_id, planner_mode, plan, current_portfolio).await?;
    Ok(run_strategy_comparison_with_mode(
        &plan,
        current_portfolio,
        n,
        planner_mode,
    ))
}
