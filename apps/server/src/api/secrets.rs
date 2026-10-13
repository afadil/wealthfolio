use std::sync::Arc;

use crate::{
    error::{ApiError, ApiResult},
    main_lib::AppState,
};
use axum::{
    extract::{Path, Query},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use wealthfolio_core::secrets::{
    addon_secret_service_id, legacy_addon_secret_service_id, validate_unscoped_secret_service_id,
};

#[derive(serde::Deserialize)]
struct SecretSetBody {
    #[serde(rename = "secretKey")]
    secret_key: String,
    secret: String,
}

async fn set_secret(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Json(body): Json<SecretSetBody>,
) -> ApiResult<StatusCode> {
    validate_unscoped_secret_service_id(&body.secret_key).map_err(ApiError::BadRequest)?;
    state
        .secret_store
        .set_secret(&body.secret_key, &body.secret)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct SecretQuery {
    #[serde(rename = "secretKey")]
    secret_key: String,
}

async fn get_secret(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Query(q): Query<SecretQuery>,
) -> ApiResult<Json<Option<String>>> {
    validate_unscoped_secret_service_id(&q.secret_key).map_err(ApiError::BadRequest)?;
    let val = state.secret_store.get_secret(&q.secret_key)?;
    Ok(Json(val))
}

async fn delete_secret(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Query(q): Query<SecretQuery>,
) -> ApiResult<StatusCode> {
    validate_unscoped_secret_service_id(&q.secret_key).map_err(ApiError::BadRequest)?;
    state.secret_store.delete_secret(&q.secret_key)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct AddonSecretSetBody {
    key: String,
    secret: String,
}

async fn set_addon_secret(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Path(addon_id): Path<String>,
    Json(body): Json<AddonSecretSetBody>,
) -> ApiResult<StatusCode> {
    let service_id = addon_secret_service_id(&addon_id, &body.key).map_err(ApiError::BadRequest)?;
    let legacy_service_id =
        legacy_addon_secret_service_id(&addon_id, &body.key).map_err(ApiError::BadRequest)?;
    state.secret_store.set_secret(&service_id, &body.secret)?;
    state.secret_store.delete_secret(&legacy_service_id)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct AddonSecretQuery {
    key: String,
}

async fn get_addon_secret(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Path(addon_id): Path<String>,
    Query(q): Query<AddonSecretQuery>,
) -> ApiResult<Json<Option<String>>> {
    let service_id = addon_secret_service_id(&addon_id, &q.key).map_err(ApiError::BadRequest)?;
    if let Some(value) = state.secret_store.get_secret(&service_id)? {
        return Ok(Json(Some(value)));
    }

    let legacy_service_id =
        legacy_addon_secret_service_id(&addon_id, &q.key).map_err(ApiError::BadRequest)?;
    let val = state.secret_store.get_secret(&legacy_service_id)?;
    if let Some(secret) = val.as_deref() {
        state.secret_store.set_secret(&service_id, secret)?;
        state.secret_store.delete_secret(&legacy_service_id)?;
    }
    Ok(Json(val))
}

async fn delete_addon_secret(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Path(addon_id): Path<String>,
    Query(q): Query<AddonSecretQuery>,
) -> ApiResult<StatusCode> {
    let service_id = addon_secret_service_id(&addon_id, &q.key).map_err(ApiError::BadRequest)?;
    let legacy_service_id =
        legacy_addon_secret_service_id(&addon_id, &q.key).map_err(ApiError::BadRequest)?;
    state.secret_store.delete_secret(&service_id)?;
    state.secret_store.delete_secret(&legacy_service_id)?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route(
            "/secrets",
            post(set_secret).get(get_secret).delete(delete_secret),
        )
        .route(
            "/addons/{addon_id}/secrets",
            post(set_addon_secret)
                .get(get_addon_secret)
                .delete(delete_addon_secret),
        )
}
