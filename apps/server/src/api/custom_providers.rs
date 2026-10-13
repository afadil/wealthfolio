use axum::{
    extract::Path,
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

pub fn router<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/custom-providers", get(get_custom_providers))
        .route("/custom-providers", post(create_custom_provider))
        .route("/custom-providers/{id}", put(update_custom_provider))
        .route("/custom-providers/{id}", delete(delete_custom_provider))
        .route(
            "/custom-providers/test-source",
            post(test_custom_provider_source),
        )
}

async fn get_custom_providers(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
) -> ApiResult<Json<Vec<CustomProviderWithSources>>> {
    let providers = state.custom_provider_service.get_all()?;
    Ok(Json(providers))
}

async fn create_custom_provider(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Json(payload): Json<NewCustomProvider>,
) -> ApiResult<Json<CustomProviderWithSources>> {
    let provider = state.custom_provider_service.create(payload).await?;
    Ok(Json(provider))
}

async fn update_custom_provider(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateCustomProvider>,
) -> ApiResult<Json<CustomProviderWithSources>> {
    let provider = state.custom_provider_service.update(&id, payload).await?;
    Ok(Json(provider))
}

async fn delete_custom_provider(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<()> {
    state.custom_provider_service.delete(&id).await?;
    Ok(())
}

async fn test_custom_provider_source(
    axum::Extension(state): axum::Extension<Arc<AppState>>,
    Json(payload): Json<TestSourceRequest>,
) -> ApiResult<Json<TestSourceResult>> {
    let result = state.custom_provider_service.test_source(payload).await?;
    Ok(Json(result))
}
