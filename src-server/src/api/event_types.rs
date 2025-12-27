use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use wealthfolio_core::event_types::EventType;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventTypeRequest {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventTypeRequest {
    pub name: Option<String>,
    pub color: Option<String>,
}

/// Get all event types
async fn get_all_event_types(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<EventType>>> {
    let event_types = state.event_type_service.get_all_event_types()?;
    Ok(Json(event_types))
}

/// Get a single event type by ID
async fn get_event_type(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<EventType>> {
    let event_type = state
        .event_type_service
        .get_event_type(&id)?
        .ok_or(crate::error::ApiError::NotFound)?;
    Ok(Json(event_type))
}

/// Create a new event type
async fn create_event_type(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateEventTypeRequest>,
) -> ApiResult<Json<EventType>> {
    let event_type = state
        .event_type_service
        .create_event_type(req.name, req.color)
        .await?;
    Ok(Json(event_type))
}

/// Update an event type
async fn update_event_type(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateEventTypeRequest>,
) -> ApiResult<Json<EventType>> {
    let event_type = state
        .event_type_service
        .update_event_type(&id, req.name, req.color)
        .await?;
    Ok(Json(event_type))
}

/// Delete an event type
async fn delete_event_type(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    state.event_type_service.delete_event_type(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/event-types", get(get_all_event_types).post(create_event_type))
        .route(
            "/event-types/{id}",
            get(get_event_type)
                .put(update_event_type)
                .delete(delete_event_type),
        )
}
