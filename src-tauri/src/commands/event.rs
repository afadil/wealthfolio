use std::sync::Arc;

use crate::context::ServiceContext;
use log::{debug, error};
use tauri::State;

use wealthfolio_core::events::{Event, EventWithTypeName};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventInput {
    pub name: String,
    pub description: Option<String>,
    pub event_type_id: String,
    pub start_date: String,
    pub end_date: String,
    pub is_dynamic_range: Option<bool>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub event_type_id: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_dynamic_range: Option<bool>,
}

#[tauri::command]
pub async fn get_events(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Event>, String> {
    debug!("Fetching all events...");
    state
        .event_service()
        .get_all_events()
        .map_err(|e| {
            error!("Failed to fetch events: {}", e);
            format!("Failed to fetch events: {}", e)
        })
}

#[tauri::command]
pub async fn get_events_with_names(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<EventWithTypeName>, String> {
    debug!("Fetching events with type names...");
    state
        .event_service()
        .get_events_with_type_names()
        .map_err(|e| {
            error!("Failed to fetch events with type names: {}", e);
            format!("Failed to fetch events with type names: {}", e)
        })
}

#[tauri::command]
pub async fn get_event(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<Event>, String> {
    debug!("Fetching event: {}", id);
    state
        .event_service()
        .get_event(&id)
        .map_err(|e| {
            error!("Failed to fetch event: {}", e);
            format!("Failed to fetch event: {}", e)
        })
}

#[tauri::command]
pub async fn create_event(
    event: CreateEventInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Event, String> {
    debug!("Creating event: {:?}", event.name);
    state
        .event_service()
        .create_event(
            event.name,
            event.description,
            event.event_type_id,
            event.start_date,
            event.end_date,
            event.is_dynamic_range.unwrap_or(false),
        )
        .await
        .map_err(|e| {
            error!("Failed to create event: {}", e);
            format!("Failed to create event: {}", e)
        })
}

#[tauri::command]
pub async fn update_event(
    id: String,
    update: UpdateEventInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Event, String> {
    debug!("Updating event: {}", id);
    state
        .event_service()
        .update_event(
            &id,
            update.name,
            update.description,
            update.event_type_id,
            update.start_date,
            update.end_date,
            update.is_dynamic_range,
        )
        .await
        .map_err(|e| {
            error!("Failed to update event: {}", e);
            format!("Failed to update event: {}", e)
        })
}

#[tauri::command]
pub async fn delete_event(
    event_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Deleting event: {}", event_id);
    state
        .event_service()
        .delete_event(&event_id)
        .await
        .map_err(|e| {
            error!("Failed to delete event: {}", e);
            format!("Failed to delete event: {}", e)
        })?;
    Ok(())
}

#[tauri::command]
pub async fn validate_transaction_date(
    event_id: String,
    transaction_date: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<bool, String> {
    debug!("Validating transaction date for event: {}", event_id);
    state
        .event_service()
        .validate_transaction_date(&event_id, &transaction_date)
        .map_err(|e| {
            error!("Failed to validate transaction date: {}", e);
            format!("Failed to validate transaction date: {}", e)
        })
}
