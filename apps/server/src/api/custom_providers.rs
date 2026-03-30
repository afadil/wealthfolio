use axum::{
    extract::{Path, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use std::sync::Arc;
use wealthfolio_core::custom_provider::{
    CustomProviderWithSources, NewCustomProvider, TestSourceRequest, TestSourceResult,
    UpdateCustomProvider,
};

use crate::error::ApiResult;
use crate::main_lib::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/custom-providers", get(get_custom_providers))
        .route("/api/v1/custom-providers", post(create_custom_provider))
        .route("/api/v1/custom-providers/{id}", put(update_custom_provider))
        .route(
            "/api/v1/custom-providers/{id}",
            delete(delete_custom_provider),
        )
        .route(
            "/api/v1/custom-providers/test-source",
            post(test_custom_provider_source),
        )
}

async fn get_custom_providers(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<CustomProviderWithSources>>> {
    let providers = state.custom_provider_service.get_all()?;
    Ok(Json(providers))
}

async fn create_custom_provider(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<NewCustomProvider>,
) -> ApiResult<Json<CustomProviderWithSources>> {
    let provider = state.custom_provider_service.create(payload).await?;
    Ok(Json(provider))
}

async fn update_custom_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateCustomProvider>,
) -> ApiResult<Json<CustomProviderWithSources>> {
    let provider = state.custom_provider_service.update(&id, payload).await?;
    Ok(Json(provider))
}

async fn delete_custom_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<()> {
    state.custom_provider_service.delete(&id).await?;
    Ok(())
}

async fn test_custom_provider_source(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<TestSourceRequest>,
) -> ApiResult<Json<TestSourceResult>> {
    let result = state.custom_provider_service.test_source(payload).await?;
    Ok(Json(result))
}
