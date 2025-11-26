use std::sync::Arc;

use crate::{
    api::shared::{trigger_account_portfolio_job, AccountPortfolioImpact},
    error::ApiResult,
    main_lib::AppState,
    models::{Account, AccountUpdate, NewAccount},
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, put},
    Json, Router,
};
use wealthfolio_core::accounts::AccountServiceTrait;

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
    trigger_account_portfolio_job(
        state.clone(),
        AccountPortfolioImpact::CreatedOrUpdated {
            account_id: created.id.clone(),
            currency: created.currency.clone(),
        },
    );
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
    trigger_account_portfolio_job(
        state.clone(),
        AccountPortfolioImpact::CreatedOrUpdated {
            account_id: updated.id.clone(),
            currency: updated.currency.clone(),
        },
    );
    Ok(Json(Account::from(updated)))
}

#[utoipa::path(delete, path="/api/v1/accounts/{id}", responses((status=204)))]
async fn delete_account(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    state.account_service.delete_account(&id).await?;
    trigger_account_portfolio_job(state, AccountPortfolioImpact::Deleted);
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/accounts", get(list_accounts).post(create_account))
        .route("/accounts/{id}", put(update_account).delete(delete_account))
}
