use std::collections::HashMap;
use std::sync::Arc;

use crate::{
    api::shared::trigger_lightweight_portfolio_update, error::ApiResult, main_lib::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use wealthfolio_core::{
    accounts::AccountServiceTrait,
    goals::{
        validate_retirement_plan, Goal, GoalFundingRule, GoalFundingRuleInput, GoalPlan, NewGoal,
        SaveGoalPlan,
    },
    planning::retirement::{RetirementPlan, RetirementTimingMode},
    planning::SaveUpOverview,
    portfolio::fire::{
        self, DecisionSensitivityResult, MonteCarloResult, RetirementOverview, ScenarioResult,
        SensitivityResult, SorrScenario, StrategyComparisonResult, StressTestResult,
    },
};

async fn get_goals(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Goal>>> {
    let goals = state.goal_service.get_goals()?;
    Ok(Json(goals))
}

async fn get_goal(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Goal>> {
    let goal = state.goal_service.get_goal(&id)?;
    Ok(Json(goal))
}

async fn create_goal(
    State(state): State<Arc<AppState>>,
    Json(goal): Json<NewGoal>,
) -> ApiResult<Json<Goal>> {
    let g = state.goal_service.create_goal(goal).await?;
    trigger_lightweight_portfolio_update(state.clone());
    Ok(Json(g))
}

async fn update_goal(
    State(state): State<Arc<AppState>>,
    Json(goal): Json<Goal>,
) -> ApiResult<Json<Goal>> {
    let g = state.goal_service.update_goal(goal).await?;
    trigger_lightweight_portfolio_update(state.clone());
    Ok(Json(g))
}

async fn delete_goal(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    let _ = state.goal_service.delete_goal(id).await?;
    trigger_lightweight_portfolio_update(state);
    Ok(StatusCode::NO_CONTENT)
}

async fn get_goal_funding(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<GoalFundingRule>>> {
    let rules = state.goal_service.get_goal_funding(&id)?;
    Ok(Json(rules))
}

async fn save_goal_funding(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(rules): Json<Vec<GoalFundingRuleInput>>,
) -> ApiResult<Json<Vec<GoalFundingRule>>> {
    let result = state.goal_service.save_goal_funding(&id, rules).await?;
    Ok(Json(result))
}

async fn get_goal_plan(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Option<GoalPlan>>> {
    let plan = state.goal_service.get_goal_plan(&id)?;
    Ok(Json(plan))
}

async fn save_goal_plan(
    State(state): State<Arc<AppState>>,
    Json(plan): Json<SaveGoalPlan>,
) -> ApiResult<Json<GoalPlan>> {
    let result = state.goal_service.save_goal_plan(plan).await?;
    Ok(Json(result))
}

async fn delete_goal_plan(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    let _ = state.goal_service.delete_goal_plan(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Build account_id → base-currency value map from latest valuations.
async fn build_valuation_map(state: &AppState) -> ApiResult<HashMap<String, f64>> {
    let accounts = state.account_service.get_active_non_archived_accounts()?;
    let account_ids: Vec<String> = accounts.into_iter().map(|a| a.id).collect();
    let valuations = state
        .valuation_service
        .get_latest_valuations(&account_ids)?;

    let mut map = HashMap::new();
    for v in &valuations {
        let value_in_base = v.total_value.to_string().parse::<f64>().unwrap_or(0.0)
            * v.fx_rate_to_base.to_string().parse::<f64>().unwrap_or(1.0);
        map.insert(v.account_id.clone(), value_in_base);
    }
    Ok(map)
}

async fn get_retirement_overview(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<RetirementOverview>> {
    let valuation_map = build_valuation_map(&state).await?;
    let overview = state
        .goal_service
        .compute_retirement_overview(&id, &valuation_map)
        .await?;
    Ok(Json(overview))
}

async fn get_save_up_overview(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<SaveUpOverview>> {
    let valuation_map = build_valuation_map(&state).await?;
    let overview = state
        .goal_service
        .compute_save_up_overview(&id, &valuation_map)
        .await?;
    Ok(Json(overview))
}

// ─── RetirementPlan-based Simulation Endpoints ───────────────────────────────

const MAX_SIMS: u32 = 500_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RetirementSimulationRequest {
    plan: RetirementPlan,
    current_portfolio: f64,
    goal_id: Option<String>,
    planner_mode: Option<RetirementTimingMode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RetirementMonteCarloRequest {
    plan: RetirementPlan,
    current_portfolio: f64,
    n_sims: Option<u32>,
    seed: Option<u64>,
    goal_id: Option<String>,
    planner_mode: Option<RetirementTimingMode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RetirementSorrRequest {
    plan: RetirementPlan,
    portfolio_at_fire: f64,
    retirement_start_age: u32,
    goal_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RetirementStrategyComparisonRequest {
    plan: RetirementPlan,
    current_portfolio: f64,
    n_sims: Option<u32>,
    goal_id: Option<String>,
    planner_mode: Option<RetirementTimingMode>,
}

async fn resolve_retirement_inputs(
    state: &Arc<AppState>,
    goal_id: &Option<String>,
    planner_mode: Option<RetirementTimingMode>,
    plan: RetirementPlan,
    current_portfolio: f64,
) -> ApiResult<(RetirementPlan, f64, RetirementTimingMode)> {
    if let Some(goal_id) = goal_id {
        let valuation_map = build_valuation_map(state).await?;
        let prepared = state
            .goal_service
            .prepare_retirement_simulation_input(goal_id, &valuation_map)
            .await?;
        Ok((
            prepared.plan,
            prepared.current_portfolio,
            prepared.planner_mode,
        ))
    } else {
        validate_retirement_plan(&plan)?;
        Ok((
            plan,
            current_portfolio,
            planner_mode.unwrap_or(RetirementTimingMode::Fire),
        ))
    }
}

async fn retirement_projection(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RetirementSimulationRequest>,
) -> ApiResult<Json<fire::FireProjection>> {
    let (plan, current_portfolio, planner_mode) = resolve_retirement_inputs(
        &state,
        &req.goal_id,
        req.planner_mode,
        req.plan,
        req.current_portfolio,
    )
    .await?;
    let result = fire::project_retirement_with_mode(&plan, current_portfolio, planner_mode);
    Ok(Json(result))
}

async fn retirement_monte_carlo(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RetirementMonteCarloRequest>,
) -> ApiResult<Json<MonteCarloResult>> {
    let n = req.n_sims.unwrap_or(10_000).min(MAX_SIMS);
    let (plan, current_portfolio, planner_mode) = resolve_retirement_inputs(
        &state,
        &req.goal_id,
        req.planner_mode,
        req.plan,
        req.current_portfolio,
    )
    .await?;
    let result = fire::run_monte_carlo_with_mode_and_seed(
        &plan,
        current_portfolio,
        n,
        planner_mode,
        req.seed,
    );
    Ok(Json(result))
}

async fn retirement_stress_tests(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RetirementSimulationRequest>,
) -> ApiResult<Json<Vec<StressTestResult>>> {
    let (plan, current_portfolio, planner_mode) = resolve_retirement_inputs(
        &state,
        &req.goal_id,
        req.planner_mode,
        req.plan,
        req.current_portfolio,
    )
    .await?;
    let result = fire::run_stress_tests_with_mode(&plan, current_portfolio, planner_mode);
    Ok(Json(result))
}

async fn retirement_scenario_analysis(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RetirementSimulationRequest>,
) -> ApiResult<Json<Vec<ScenarioResult>>> {
    let (plan, current_portfolio, planner_mode) = resolve_retirement_inputs(
        &state,
        &req.goal_id,
        req.planner_mode,
        req.plan,
        req.current_portfolio,
    )
    .await?;
    let result = fire::run_scenario_analysis_with_mode(&plan, current_portfolio, planner_mode);
    Ok(Json(result))
}

async fn retirement_sensitivity_analysis(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RetirementSimulationRequest>,
) -> ApiResult<Json<SensitivityResult>> {
    let (plan, current_portfolio, planner_mode) = resolve_retirement_inputs(
        &state,
        &req.goal_id,
        req.planner_mode,
        req.plan,
        req.current_portfolio,
    )
    .await?;
    let result = fire::run_sensitivity_analysis_with_mode(&plan, current_portfolio, planner_mode);
    Ok(Json(result))
}

async fn retirement_decision_sensitivity_analysis(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RetirementSimulationRequest>,
) -> ApiResult<Json<DecisionSensitivityResult>> {
    let (plan, current_portfolio, planner_mode) = resolve_retirement_inputs(
        &state,
        &req.goal_id,
        req.planner_mode,
        req.plan,
        req.current_portfolio,
    )
    .await?;
    let result =
        fire::run_decision_sensitivity_analysis_with_mode(&plan, current_portfolio, planner_mode);
    Ok(Json(result))
}

async fn retirement_sequence_of_returns(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RetirementSorrRequest>,
) -> ApiResult<Json<Vec<SorrScenario>>> {
    let plan = if let Some(goal_id) = &req.goal_id {
        let valuation_map = build_valuation_map(&state).await?;
        state
            .goal_service
            .prepare_retirement_simulation_input(goal_id, &valuation_map)
            .await?
            .plan
    } else {
        validate_retirement_plan(&req.plan)?;
        req.plan
    };
    let result = fire::run_sorr(&plan, req.portfolio_at_fire, req.retirement_start_age);
    Ok(Json(result))
}

async fn retirement_strategy_comparison(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RetirementStrategyComparisonRequest>,
) -> ApiResult<Json<StrategyComparisonResult>> {
    let n = req.n_sims.unwrap_or(10_000).min(MAX_SIMS);
    let (plan, current_portfolio, planner_mode) = resolve_retirement_inputs(
        &state,
        &req.goal_id,
        req.planner_mode,
        req.plan,
        req.current_portfolio,
    )
    .await?;
    Ok(Json(fire::run_strategy_comparison_with_mode(
        &plan,
        current_portfolio,
        n,
        planner_mode,
    )))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/goals", get(get_goals).post(create_goal).put(update_goal))
        .route("/goals/{id}", get(get_goal).delete(delete_goal))
        .route(
            "/goals/{id}/funding",
            get(get_goal_funding).put(save_goal_funding),
        )
        .route(
            "/goals/{id}/plan",
            get(get_goal_plan).delete(delete_goal_plan),
        )
        .route(
            "/goals/{id}/retirement-overview",
            get(get_retirement_overview),
        )
        .route("/goals/{id}/save-up-overview", get(get_save_up_overview))
        .route("/goals/plan", axum::routing::post(save_goal_plan))
        // RetirementPlan-based simulation endpoints
        .route(
            "/retirement/projection",
            axum::routing::post(retirement_projection),
        )
        .route(
            "/retirement/monte-carlo",
            axum::routing::post(retirement_monte_carlo),
        )
        .route(
            "/retirement/stress-tests",
            axum::routing::post(retirement_stress_tests),
        )
        .route(
            "/retirement/scenario-analysis",
            axum::routing::post(retirement_scenario_analysis),
        )
        .route(
            "/retirement/sensitivity-analysis",
            axum::routing::post(retirement_sensitivity_analysis),
        )
        .route(
            "/retirement/decision-sensitivity-analysis",
            axum::routing::post(retirement_decision_sensitivity_analysis),
        )
        .route(
            "/retirement/sequence-of-returns",
            axum::routing::post(retirement_sequence_of_returns),
        )
        .route(
            "/retirement/strategy-comparison",
            axum::routing::post(retirement_strategy_comparison),
        )
}
