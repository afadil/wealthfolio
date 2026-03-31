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
use wealthfolio_core::goals::{
    Goal, GoalFundingRule, GoalFundingRuleInput, GoalPlan, NewGoal, SaveGoalPlan,
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
        .route("/goals/plan", axum::routing::post(save_goal_plan))
}
