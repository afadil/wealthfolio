use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use wealthfolio_core::events::{Event, EventWithTypeName, NewEvent};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventRequest {
    pub name: String,
    pub description: Option<String>,
    pub event_type_id: String,
    pub start_date: String,
    pub end_date: String,
    pub is_dynamic_range: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub event_type_id: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_dynamic_range: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateTransactionDateRequest {
    pub transaction_date: String,
}

/// Get all events
async fn get_all_events(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<Event>>> {
    let events = state.event_service.get_all_events()?;
    Ok(Json(events))
}

/// Get all events with event type names
async fn get_events_with_type_names(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<EventWithTypeName>>> {
    let events = state.event_service.get_events_with_type_names()?;
    Ok(Json(events))
}

/// Get a single event by ID
async fn get_event(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Event>> {
    let event = state
        .event_service
        .get_event(&id)?
        .ok_or(crate::error::ApiError::NotFound)?;
    Ok(Json(event))
}

/// Create a new event
async fn create_event(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateEventRequest>,
) -> ApiResult<Json<Event>> {
    let now = Utc::now().to_rfc3339();
    let new_event = NewEvent {
        id: None,
        name: req.name,
        description: req.description,
        event_type_id: req.event_type_id,
        start_date: req.start_date,
        end_date: req.end_date,
        is_dynamic_range: if req.is_dynamic_range.unwrap_or(false) { 1 } else { 0 },
        created_at: now.clone(),
        updated_at: now,
    };

    let event = state
        .event_service
        .create_event(
            new_event.name,
            new_event.description,
            new_event.event_type_id,
            new_event.start_date,
            new_event.end_date,
            new_event.is_dynamic_range == 1,
        )
        .await?;
    Ok(Json(event))
}

/// Update an event
async fn update_event(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateEventRequest>,
) -> ApiResult<Json<Event>> {
    let event = state
        .event_service
        .update_event(
            &id,
            req.name,
            req.description,
            req.event_type_id,
            req.start_date,
            req.end_date,
            req.is_dynamic_range,
        )
        .await?;
    Ok(Json(event))
}

/// Delete an event
async fn delete_event(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    state.event_service.delete_event(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Validate transaction date against event date range
async fn validate_transaction_date(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<ValidateTransactionDateRequest>,
) -> ApiResult<Json<bool>> {
    let is_valid = state
        .event_service
        .validate_transaction_date(&id, &req.transaction_date)?;
    Ok(Json(is_valid))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/events", get(get_all_events).post(create_event))
        .route("/events/with-names", get(get_events_with_type_names))
        .route(
            "/events/{id}",
            get(get_event).put(update_event).delete(delete_event),
        )
        .route(
            "/events/{id}/validate-transaction-date",
            axum::routing::post(validate_transaction_date),
        )
}
