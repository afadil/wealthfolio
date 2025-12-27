use std::sync::Arc;

use crate::{
    api::shared::trigger_lightweight_portfolio_update, error::ApiResult, main_lib::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use wealthfolio_core::goals::{
    AccountFreeCash, Goal, GoalContributionWithStatus, GoalWithContributions, NewGoal,
    NewGoalContribution,
};

async fn get_goals(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Goal>>> {
    let goals = state.goal_service.get_goals()?;
    Ok(Json(goals))
}

async fn get_goals_with_contributions(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<GoalWithContributions>>> {
    let goals = state.goal_service.get_goals_with_contributions()?;
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

#[derive(serde::Deserialize)]
struct AccountIdsQuery {
    account_ids: Vec<String>,
}

async fn get_account_free_cash(
    State(state): State<Arc<AppState>>,
    Json(query): Json<AccountIdsQuery>,
) -> ApiResult<Json<Vec<AccountFreeCash>>> {
    let free_cash = state.goal_service.get_account_free_cash(&query.account_ids)?;
    Ok(Json(free_cash))
}

async fn add_goal_contribution(
    State(state): State<Arc<AppState>>,
    Json(contribution): Json<NewGoalContribution>,
) -> ApiResult<Json<GoalContributionWithStatus>> {
    let result = state.goal_service.add_contribution(contribution).await?;
    trigger_lightweight_portfolio_update(state);
    Ok(Json(result))
}

async fn remove_goal_contribution(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    let _ = state.goal_service.remove_contribution(&id).await?;
    trigger_lightweight_portfolio_update(state);
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/goals", get(get_goals).post(create_goal).put(update_goal))
        .route("/goals/with-contributions", get(get_goals_with_contributions))
        .route("/goals/{id}", delete(delete_goal))
        .route("/goals/free-cash", post(get_account_free_cash))
        .route("/goals/contributions", post(add_goal_contribution))
        .route("/goals/contributions/{id}", delete(remove_goal_contribution))
}
