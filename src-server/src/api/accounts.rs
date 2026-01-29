use std::sync::Arc;

use crate::{
    error::ApiResult,
    main_lib::AppState,
    models::{Account, AccountUpdate, NewAccount},
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use serde::Deserialize;
use tracing::info;
use wealthfolio_core::accounts::{set_tracking_mode, AccountServiceTrait, TrackingMode};

#[utoipa::path(get, path="/api/v1/accounts", responses((status=200, body = [Account])))]
async fn list_accounts(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Account>>> {
    let accounts = state.account_service.get_all_accounts()?;
    Ok(Json(accounts.into_iter().map(Account::from).collect()))
}

#[utoipa::path(post, path="/api/v1/accounts", request_body = NewAccount, responses((status=200, body = Account)))]
async fn create_account(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<NewAccount>,
) -> ApiResult<Json<Account>> {
    let core_new = payload.into();
    let created = state.account_service.create_account(core_new).await?;
    // Domain events handle portfolio recalculation
    Ok(Json(Account::from(created)))
}

#[utoipa::path(put, path="/api/v1/accounts/{id}", request_body = AccountUpdate, responses((status=200, body=Account)))]
async fn update_account(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(mut payload): Json<AccountUpdate>,
) -> ApiResult<Json<Account>> {
    payload.id = Some(id);
    let updated = state.account_service.update_account(payload.into()).await?;
    // Domain events handle portfolio recalculation
    Ok(Json(Account::from(updated)))
}

#[utoipa::path(delete, path="/api/v1/accounts/{id}", responses((status=204)))]
async fn delete_account(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    state.account_service.delete_account(&id).await?;
    // Domain events handle portfolio recalculation
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwitchTrackingModePayload {
    new_mode: TrackingMode,
}

/// Switches an account's tracking mode with proper handling of snapshot sources.
/// Updates account meta with the new tracking mode.
#[utoipa::path(post, path="/api/v1/accounts/{id}/switch-tracking-mode", request_body = SwitchTrackingModePayload, responses((status=204)))]
async fn switch_tracking_mode(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SwitchTrackingModePayload>,
) -> ApiResult<StatusCode> {
    // Get the current account for meta update
    let account = state.account_service.get_account(&id)?;

    // Update the account meta with the new tracking mode
    let new_meta = set_tracking_mode(account.meta.clone(), payload.new_mode);

    let account_update = wealthfolio_core::accounts::AccountUpdate {
        id: Some(id.clone()),
        name: account.name,
        account_type: account.account_type,
        group: account.group,
        is_default: account.is_default,
        is_active: account.is_active,
        platform_id: account.platform_id,
        account_number: account.account_number,
        meta: Some(new_meta),
        provider: account.provider,
        provider_account_id: account.provider_account_id,
    };

    let _updated = state.account_service.update_account(account_update).await?;
    // Domain events handle portfolio recalculation and broker sync

    info!(
        "Successfully switched tracking mode for account {} to {:?}",
        id, payload.new_mode
    );

    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/accounts", get(list_accounts).post(create_account))
        .route("/accounts/{id}", put(update_account).delete(delete_account))
        .route(
            "/accounts/{id}/switch-tracking-mode",
            post(switch_tracking_mode),
        )
}
