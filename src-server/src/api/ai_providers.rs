use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, State},
    routing::{get, post, put},
    Json, Router,
};
use wealthfolio_ai::{
    AiProvidersResponse, ListModelsResponse, SetDefaultProviderRequest,
    UpdateProviderSettingsRequest,
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

/// List available models from a provider.
/// Fetches models from the provider's API using backend-stored secrets.
/// Frontend never needs to send API keys - they are retrieved internally.
async fn list_models(
    State(state): State<Arc<AppState>>,
    Path(provider_id): Path<String>,
) -> ApiResult<Json<ListModelsResponse>> {
    let response = state.ai_provider_service.list_models(&provider_id).await?;
    Ok(Json(response))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/ai/providers", get(get_ai_providers))
        .route("/ai/providers/settings", put(update_provider_settings))
        .route("/ai/providers/default", post(set_default_provider))
        .route("/ai/providers/{provider_id}/models", get(list_models))
}
