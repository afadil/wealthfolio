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
    goals::{Goal, GoalFundingRule, GoalFundingRuleInput, GoalPlan, NewGoal, SaveGoalPlan},
    planning::SaveUpOverview,
    portfolio::fire::{
        self, FireSettings, MonteCarloResult, RetirementOverview, ScenarioResult,
        SensitivityResult, SorrScenario, StrategyComparisonResult,
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
    let accounts = state.account_service.get_active_accounts()?;
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

// ─── FIRE Simulation Endpoints ───────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FireSimulationRequest {
    settings: FireSettings,
    current_portfolio: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FireMonteCarloRequest {
    settings: FireSettings,
    current_portfolio: f64,
    n_sims: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FireSorrRequest {
    settings: FireSettings,
    portfolio_at_fire: f64,
    retirement_start_age: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FireStrategyComparisonRequest {
    settings: FireSettings,
    current_portfolio: f64,
    n_sims: Option<u32>,
}

const MAX_SIMS: u32 = 500_000;

async fn fire_monte_carlo(
    Json(req): Json<FireMonteCarloRequest>,
) -> ApiResult<Json<MonteCarloResult>> {
    let n = req.n_sims.unwrap_or(100_000).min(MAX_SIMS);
    let result = fire::run_monte_carlo(&req.settings, req.current_portfolio, n);
    Ok(Json(result))
}

async fn fire_scenario_analysis(
    Json(req): Json<FireSimulationRequest>,
) -> ApiResult<Json<Vec<ScenarioResult>>> {
    let result = fire::run_scenario_analysis(&req.settings, req.current_portfolio);
    Ok(Json(result))
}

async fn fire_sensitivity_analysis(
    Json(req): Json<FireSimulationRequest>,
) -> ApiResult<Json<SensitivityResult>> {
    let result = fire::run_sensitivity_analysis(&req.settings, req.current_portfolio);
    Ok(Json(result))
}

async fn fire_sequence_of_returns(
    Json(req): Json<FireSorrRequest>,
) -> ApiResult<Json<Vec<SorrScenario>>> {
    let result = fire::run_sequence_of_returns_risk(
        &req.settings,
        req.portfolio_at_fire,
        req.retirement_start_age,
    );
    Ok(Json(result))
}

async fn fire_strategy_comparison(
    Json(req): Json<FireStrategyComparisonRequest>,
) -> ApiResult<Json<StrategyComparisonResult>> {
    let n = req.n_sims.unwrap_or(5_000).min(MAX_SIMS);
    let result = fire::run_strategy_comparison(&req.settings, req.current_portfolio, n);
    Ok(Json(result))
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
        // FIRE simulation endpoints
        .route("/fire/monte-carlo", axum::routing::post(fire_monte_carlo))
        .route(
            "/fire/scenario-analysis",
            axum::routing::post(fire_scenario_analysis),
        )
        .route(
            "/fire/sensitivity-analysis",
            axum::routing::post(fire_sensitivity_analysis),
        )
        .route(
            "/fire/sequence-of-returns",
            axum::routing::post(fire_sequence_of_returns),
        )
        .route(
            "/fire/strategy-comparison",
            axum::routing::post(fire_strategy_comparison),
        )
}
