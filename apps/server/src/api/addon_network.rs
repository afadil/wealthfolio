use std::sync::Arc;

use crate::{
    error::{ApiError, ApiResult},
    main_lib::AppState,
};
use axum::{extract::Path, routing::post, Json, Router};
use wealthfolio_core::addons::network::{
    resolve_addon_network_auth_header, AddonNetworkRequest, AddonNetworkResponse,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddonNetworkBody {
    request: AddonNetworkRequest,
}

async fn addon_network_request(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Path(addon_id): Path<String>,
    Json(body): Json<AddonNetworkBody>,
) -> ApiResult<Json<AddonNetworkResponse>> {
    let mut request = body.request;
    let injected_authorization = resolve_addon_network_auth_header(
        &addon_id,
        request.auth.as_ref(),
        state.secret_store.as_ref(),
    )
    .map_err(ApiError::BadRequest)?;
    request.injected_authorization = injected_authorization;
    let response = state
        .addon_service
        .addon_network_request(&addon_id, request)
        .await
        .map_err(ApiError::BadRequest)?;
    Ok(Json(response))
}

pub fn router<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route(
        "/addons/{addon_id}/network/request",
        post(addon_network_request),
    )
}
