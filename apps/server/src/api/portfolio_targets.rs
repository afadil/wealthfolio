use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use wealthfolio_core::portfolio::targets::{
    DeviationReport, NewPortfolioTarget, NewTargetAllocation, PortfolioTarget, TargetAllocation,
};

async fn get_portfolio_targets(
    Path(account_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<PortfolioTarget>>> {
    let targets = state
        .portfolio_target_service
        .get_targets_by_account(&account_id)?;
    Ok(Json(targets))
}

async fn get_portfolio_target(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Option<PortfolioTarget>>> {
    let target = state.portfolio_target_service.get_target(&id)?;
    Ok(Json(target))
}

async fn create_portfolio_target(
    State(state): State<Arc<AppState>>,
    Json(target): Json<NewPortfolioTarget>,
) -> ApiResult<Json<PortfolioTarget>> {
    let created = state.portfolio_target_service.create_target(target).await?;
    Ok(Json(created))
}

async fn update_portfolio_target(
    State(state): State<Arc<AppState>>,
    Json(target): Json<PortfolioTarget>,
) -> ApiResult<Json<PortfolioTarget>> {
    let updated = state.portfolio_target_service.update_target(target).await?;
    Ok(Json(updated))
}

async fn delete_portfolio_target(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    let _ = state.portfolio_target_service.delete_target(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_target_allocations(
    Path(target_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<TargetAllocation>>> {
    let allocations = state
        .portfolio_target_service
        .get_allocations_by_target(&target_id)?;
    Ok(Json(allocations))
}

async fn upsert_target_allocation(
    State(state): State<Arc<AppState>>,
    Json(allocation): Json<NewTargetAllocation>,
) -> ApiResult<Json<TargetAllocation>> {
    let result = state
        .portfolio_target_service
        .upsert_allocation(allocation)
        .await?;
    Ok(Json(result))
}

async fn delete_target_allocation(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    let _ = state
        .portfolio_target_service
        .delete_allocation(&id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_allocation_deviations(
    Path(target_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<DeviationReport>> {
    let base_currency = state.base_currency.read().unwrap().clone();
    let report = state
        .portfolio_target_service
        .get_deviation_report(&target_id, &base_currency)
        .await?;
    Ok(Json(report))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/portfolio-targets/account/{accountId}",
            get(get_portfolio_targets),
        )
        .route(
            "/portfolio-targets",
            post(create_portfolio_target).put(update_portfolio_target),
        )
        .route(
            "/portfolio-targets/{id}",
            get(get_portfolio_target).delete(delete_portfolio_target),
        )
        .route(
            "/portfolio-targets/{targetId}/allocations",
            get(get_target_allocations),
        )
        .route(
            "/portfolio-targets/allocations",
            post(upsert_target_allocation),
        )
        .route(
            "/portfolio-targets/allocations/{id}",
            delete(delete_target_allocation),
        )
        .route(
            "/portfolio-targets/{targetId}/deviations",
            get(get_allocation_deviations),
        )
}
