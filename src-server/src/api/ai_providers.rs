use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::State,
    routing::{get, post, put},
    Json, Router,
};
use wealthfolio_core::ai::{
    AiProvidersResponse, SetDefaultProviderRequest, UpdateProviderSettingsRequest,
};

async fn get_ai_providers(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<AiProvidersResponse>> {
    let response = state.ai_provider_service.get_ai_providers()?;
    Ok(Json(response))
}

async fn update_provider_settings(
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdateProviderSettingsRequest>,
) -> ApiResult<Json<()>> {
    state
        .ai_provider_service
        .update_provider_settings(request)
        .await?;
    Ok(Json(()))
}

async fn set_default_provider(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SetDefaultProviderRequest>,
) -> ApiResult<Json<()>> {
    state
        .ai_provider_service
        .set_default_provider(request)
        .await?;
    Ok(Json(()))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/ai/providers", get(get_ai_providers))
        .route("/ai/providers/settings", put(update_provider_settings))
        .route("/ai/providers/default", post(set_default_provider))
}
