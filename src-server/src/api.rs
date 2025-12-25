use std::sync::Arc;

use crate::{
    auth,
    config::Config,
    main_lib::AppState,
    models::{Account, AccountUpdate, NewAccount},
};
use axum::middleware;
use axum::{routing::get, Json, Router};
use tower_http::{
    cors::{Any, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use utoipa::OpenApi;

mod accounts;
mod activities;
mod addons;
mod assets;
mod connect;
mod device_sync;
mod exchange_rates;
mod goals;
mod holdings;
mod limits;
mod market_data;
mod performance;
mod portfolio;
mod secrets;
mod settings;
mod shared;

#[utoipa::path(get, path = "/api/v1/healthz", responses((status = 200, description = "Health")))]
pub async fn healthz() -> &'static str {
    "ok"
}

#[utoipa::path(get, path = "/api/v1/readyz", responses((status = 200, description = "Ready")))]
pub async fn readyz() -> &'static str {
    "ok"
}

#[derive(OpenApi)]
#[openapi(
    paths(healthz, readyz, accounts::list_accounts, accounts::create_account, accounts::update_account, accounts::delete_account),
    components(schemas(Account, NewAccount, AccountUpdate)),
    tags((name="wealthfolio"))
)]
pub struct ApiDoc;

#[allow(deprecated)]
pub fn app_router(state: Arc<AppState>, config: &Config) -> Router {
    let cors = if config.cors_allow.iter().any(|o| o == "*") {
        CorsLayer::new().allow_origin(Any)
    } else {
        let origins = config
            .cors_allow
            .iter()
            .map(|o| o.parse().unwrap())
            .collect::<Vec<_>>();
        CorsLayer::new().allow_origin(origins)
    };

    let openapi = ApiDoc::openapi();
    let requires_auth = state.auth.is_some();

    // Compose all protected routes from individual modules
    let protected_api = Router::new()
        .merge(accounts::router())
        .merge(settings::router())
        .merge(portfolio::router())
        .merge(holdings::router())
        .merge(performance::router())
        .merge(activities::router())
        .merge(goals::router())
        .merge(exchange_rates::router())
        .merge(market_data::router())
        .merge(assets::router())
        .merge(secrets::router())
        .merge(limits::router())
        .merge(addons::router())
        .merge(device_sync::router())
        .merge(connect::router());

    let protected_api = if requires_auth {
        protected_api.layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_jwt,
        ))
    } else {
        protected_api
    };

    let api = Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/auth/status", get(auth::auth_status))
        .route("/auth/login", axum::routing::post(auth::login))
        .merge(protected_api)
        .with_state(state.clone());

    Router::new()
        .nest("/api/v1", api)
        .route("/openapi.json", get(|| async { Json(openapi) }))
        .with_state(state)
        .layer(cors)
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(TimeoutLayer::new(config.request_timeout))
        .layer(TraceLayer::new_for_http())
}
