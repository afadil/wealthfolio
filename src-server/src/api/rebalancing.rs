use std::sync::Arc;

use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use wealthfolio_core::rebalancing::{AssetClassTarget, RebalancingStrategy};

use crate::main_lib::AppState;

// ─────────────────────────────────────────────────────────────────────────────
// Handlers: Account-Scoped Allocation Targets
// ─────────────────────────────────────────────────────────────────────────────

/// GET /api/v1/rebalancing/account/:account_id/strategy
/// Get the active rebalancing strategy for a specific account
#[utoipa::path(
    get,
    path = "/api/v1/rebalancing/account/{account_id}/strategy",
    params(("account_id" = String, Path, description = "Account ID")),
    responses(
        (status = 200, description = "Active strategy", body = Option<RebalancingStrategy>),
        (status = 500, description = "Internal server error"),
    ),
    tag = "Rebalancing"
)]
pub async fn get_active_strategy_for_account(
    Path(account_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Option<RebalancingStrategy>>, axum::http::StatusCode> {
    state
        .rebalancing_service
        .get_active_strategy_for_account(&account_id)
        .await
        .map(Json)
        .map_err(|err| {
            tracing::error!(
                "Failed to get active strategy for account {}: {}",
                account_id,
                err
            );
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })
}

/// GET /api/v1/rebalancing/account/:account_id/targets
/// Get asset class targets for a specific account's active strategy
#[utoipa::path(
    get,
    path = "/api/v1/rebalancing/account/{account_id}/targets",
    params(("account_id" = String, Path, description = "Account ID")),
    responses(
        (status = 200, description = "Asset class targets", body = Vec<AssetClassTarget>),
        (status = 500, description = "Internal server error"),
    ),
    tag = "Rebalancing"
)]
pub async fn get_asset_class_targets_for_account(
    Path(account_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<AssetClassTarget>>, axum::http::StatusCode> {
    state
        .rebalancing_service
        .get_asset_class_targets_for_account(&account_id)
        .await
        .map(Json)
        .map_err(|err| {
            tracing::error!(
                "Failed to get asset class targets for account {}: {}",
                account_id,
                err
            );
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/account/:account_id/strategy",
            get(get_active_strategy_for_account),
        )
        .route(
            "/account/:account_id/targets",
            get(get_asset_class_targets_for_account),
        )
}
