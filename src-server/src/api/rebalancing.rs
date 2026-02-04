use std::sync::Arc;

use axum::{
    extract::{Path, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use wealthfolio_core::rebalancing::{
    AssetClassTarget, HoldingTarget, NewHoldingTarget, RebalancingStrategy,
};

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
// Handlers: Holding Targets
// ─────────────────────────────────────────────────────────────────────────────

/// GET /api/v1/rebalancing/holding-targets/:asset_class_id
/// Get holding targets for a specific asset class
#[utoipa::path(
    get,
    path = "/api/v1/rebalancing/holding-targets/{asset_class_id}",
    params(("asset_class_id" = String, Path, description = "Asset Class ID")),
    responses(
        (status = 200, description = "Holding targets", body = Vec<HoldingTarget>),
        (status = 500, description = "Internal server error"),
    ),
    tag = "Rebalancing"
)]
pub async fn get_holding_targets(
    Path(asset_class_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<HoldingTarget>>, axum::http::StatusCode> {
    state
        .rebalancing_service
        .get_holding_targets(&asset_class_id)
        .await
        .map(Json)
        .map_err(|err| {
            tracing::error!(
                "Failed to get holding targets for asset class {}: {}",
                asset_class_id,
                err
            );
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })
}

/// POST /api/v1/rebalancing/holding-targets
/// Create or update a holding target
#[utoipa::path(
    post,
    path = "/api/v1/rebalancing/holding-targets",
    request_body = NewHoldingTarget,
    responses(
        (status = 200, description = "Holding target saved", body = HoldingTarget),
        (status = 400, description = "Bad request"),
        (status = 500, description = "Internal server error"),
    ),
    tag = "Rebalancing"
)]
pub async fn save_holding_target(
    State(state): State<Arc<AppState>>,
    Json(target): Json<NewHoldingTarget>,
) -> Result<Json<HoldingTarget>, axum::http::StatusCode> {
    state
        .rebalancing_service
        .save_holding_target(target)
        .await
        .map(Json)
        .map_err(|err| {
            tracing::error!("Failed to save holding target: {}", err);
            // Return 400 for validation errors, 500 for others
            if err.to_string().contains("must sum to 100%") {
                axum::http::StatusCode::BAD_REQUEST
            } else {
                axum::http::StatusCode::INTERNAL_SERVER_ERROR
            }
        })
}

/// DELETE /api/v1/rebalancing/holding-targets/:id
/// Delete a holding target
#[utoipa::path(
    delete,
    path = "/api/v1/rebalancing/holding-targets/{id}",
    params(("id" = String, Path, description = "Holding Target ID")),
    responses(
        (status = 200, description = "Holding target deleted"),
        (status = 500, description = "Internal server error"),
    ),
    tag = "Rebalancing"
)]
pub async fn delete_holding_target(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<()>, axum::http::StatusCode> {
    state
        .rebalancing_service
        .delete_holding_target(&id)
        .await
        .map(|_| Json(()))
        .map_err(|err| {
            tracing::error!("Failed to delete holding target {}: {}", id, err);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })
}

/// PUT /api/v1/rebalancing/holding-targets/:id/toggle-lock
/// Toggle lock status of a holding target
#[utoipa::path(
    put,
    path = "/api/v1/rebalancing/holding-targets/{id}/toggle-lock",
    params(("id" = String, Path, description = "Holding Target ID")),
    responses(
        (status = 200, description = "Lock status toggled", body = HoldingTarget),
        (status = 500, description = "Internal server error"),
    ),
    tag = "Rebalancing"
)]
pub async fn toggle_holding_target_lock(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<HoldingTarget>, axum::http::StatusCode> {
    state
        .rebalancing_service
        .toggle_holding_target_lock(&id)
        .await
        .map(Json)
        .map_err(|err| {
            tracing::error!("Failed to toggle lock for holding target {}: {}", id, err);
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
        // Holding targets
        .route("/holding-targets/:asset_class_id", get(get_holding_targets))
        .route("/holding-targets", post(save_holding_target))
        .route("/holding-targets/:id", delete(delete_holding_target))
        .route(
            "/holding-targets/:id/toggle-lock",
            put(toggle_holding_target_lock),
        )
}
