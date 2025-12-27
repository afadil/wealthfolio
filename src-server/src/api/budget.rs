use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use wealthfolio_core::budget::{
    BudgetAllocationWithCategory, BudgetConfig, BudgetSummary, BudgetVsActual, NewBudgetConfig,
};

#[derive(serde::Deserialize)]
struct MonthQuery {
    month: String,
}

#[derive(serde::Deserialize)]
struct SetAllocationRequest {
    category_id: String,
    amount: f64,
}

async fn get_budget_config(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Option<BudgetConfig>>> {
    let config = state.budget_service.get_budget_config()?;
    Ok(Json(config))
}

async fn upsert_budget_config(
    State(state): State<Arc<AppState>>,
    Json(config): Json<NewBudgetConfig>,
) -> ApiResult<Json<BudgetConfig>> {
    let result = state.budget_service.upsert_budget_config(config).await?;
    Ok(Json(result))
}

async fn get_budget_summary(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<BudgetSummary>> {
    let summary = state.budget_service.get_budget_summary()?;
    Ok(Json(summary))
}

async fn get_budget_allocations(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<BudgetAllocationWithCategory>>> {
    let allocations = state.budget_service.get_allocations()?;
    Ok(Json(allocations))
}

async fn set_budget_allocation(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SetAllocationRequest>,
) -> ApiResult<Json<wealthfolio_core::budget::BudgetAllocation>> {
    let result = state
        .budget_service
        .set_allocation(request.category_id, request.amount)
        .await?;
    Ok(Json(result))
}

async fn delete_budget_allocation(
    Path(category_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    state.budget_service.delete_allocation(&category_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_budget_vs_actual(
    Query(query): Query<MonthQuery>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<BudgetVsActual>> {
    let result = state.budget_service.get_budget_vs_actual(&query.month)?;
    Ok(Json(result))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/budget/config", get(get_budget_config).post(upsert_budget_config))
        .route("/budget/summary", get(get_budget_summary))
        .route("/budget/allocations", get(get_budget_allocations).post(set_budget_allocation))
        .route("/budget/allocations/{category_id}", delete(delete_budget_allocation))
        .route("/budget/vs-actual", get(get_budget_vs_actual))
}
