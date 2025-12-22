use std::sync::Arc;

use crate::{
    api::shared::trigger_lightweight_portfolio_update, error::ApiResult, main_lib::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use wealthfolio_core::goals::{Goal, GoalsAllocation, NewGoal};

async fn get_goals(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Goal>>> {
    let goals = state.goal_service.get_goals()?;
    Ok(Json(goals))
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

async fn load_goals_allocations(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<GoalsAllocation>>> {
    let allocs = state.goal_service.load_goals_allocations()?;
    Ok(Json(allocs))
}

async fn update_goal_allocations(
    State(state): State<Arc<AppState>>,
    Json(allocs): Json<Vec<GoalsAllocation>>,
) -> ApiResult<StatusCode> {
    let _ = state.goal_service.upsert_goal_allocations(allocs).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/goals/allocations",
            get(load_goals_allocations).post(update_goal_allocations),
        )
        .route("/goals", get(get_goals).post(create_goal).put(update_goal))
        .route("/goals/{id}", delete(delete_goal))
}
