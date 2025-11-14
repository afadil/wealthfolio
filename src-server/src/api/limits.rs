use std::sync::Arc;

use crate::{
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use wealthfolio_core::limits::{ContributionLimit, DepositsCalculation, NewContributionLimit};

async fn get_contribution_limits(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<ContributionLimit>>> {
    let limits = state.limits_service.get_contribution_limits()?;
    Ok(Json(limits))
}

async fn create_contribution_limit(
    State(state): State<Arc<AppState>>,
    Json(new_limit): Json<NewContributionLimit>,
) -> ApiResult<Json<ContributionLimit>> {
    let created = state
        .limits_service
        .create_contribution_limit(new_limit)
        .await?;
    Ok(Json(created))
}

async fn update_contribution_limit(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(updated): Json<NewContributionLimit>,
) -> ApiResult<Json<ContributionLimit>> {
    let updated = state
        .limits_service
        .update_contribution_limit(&id, updated)
        .await?;
    Ok(Json(updated))
}

async fn delete_contribution_limit(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<()> {
    state.limits_service.delete_contribution_limit(&id).await?;
    Ok(())
}

async fn calculate_deposits_for_contribution_limit(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<DepositsCalculation>> {
    let base = state.base_currency.read().unwrap().clone();
    let calc = state
        .limits_service
        .calculate_deposits_for_contribution_limit(&id, &base)?;
    Ok(Json(calc))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/limits",
            get(get_contribution_limits).post(create_contribution_limit),
        )
        .route(
            "/limits/:id",
            put(update_contribution_limit).delete(delete_contribution_limit),
        )
        .route(
            "/limits/:id/deposits",
            get(calculate_deposits_for_contribution_limit),
        )
}
