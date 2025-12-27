use std::sync::Arc;

use crate::context::ServiceContext;
use log::{debug, error};
use tauri::State;

use wealthfolio_core::event_types::EventType;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventTypeInput {
    pub name: String,
    pub color: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventTypeInput {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[tauri::command]
pub async fn get_event_types(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<EventType>, String> {
    debug!("Fetching all event types...");
    state
        .event_type_service()
        .get_all_event_types()
        .map_err(|e| {
            error!("Failed to fetch event types: {}", e);
            format!("Failed to fetch event types: {}", e)
        })
}

#[tauri::command]
pub async fn get_event_type(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<EventType>, String> {
    debug!("Fetching event type: {}", id);
    state
        .event_type_service()
        .get_event_type(&id)
        .map_err(|e| {
            error!("Failed to fetch event type: {}", e);
            format!("Failed to fetch event type: {}", e)
        })
}

#[tauri::command]
pub async fn create_event_type(
    event_type: CreateEventTypeInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<EventType, String> {
    debug!("Creating event type: {:?}", event_type.name);
    state
        .event_type_service()
        .create_event_type(event_type.name, event_type.color)
        .await
        .map_err(|e| {
            error!("Failed to create event type: {}", e);
            format!("Failed to create event type: {}", e)
        })
}

#[tauri::command]
pub async fn update_event_type(
    id: String,
    update: UpdateEventTypeInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<EventType, String> {
    debug!("Updating event type: {}", id);
    state
        .event_type_service()
        .update_event_type(&id, update.name, update.color)
        .await
        .map_err(|e| {
            error!("Failed to update event type: {}", e);
            format!("Failed to update event type: {}", e)
        })
}

#[tauri::command]
pub async fn delete_event_type(
    event_type_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Deleting event type: {}", event_type_id);
    state
        .event_type_service()
        .delete_event_type(&event_type_id)
        .await
        .map_err(|e| {
            error!("Failed to delete event type: {}", e);
            format!("Failed to delete event type: {}", e)
        })?;
    Ok(())
}
