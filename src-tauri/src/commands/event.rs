use std::collections::HashMap;
use std::sync::Arc;

use crate::context::ServiceContext;
use log::{debug, error};
use tauri::State;

use wealthfolio_core::events::{Event, EventSpendingSummary, EventWithTypeName};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventInput {
    pub name: String,
    pub description: Option<String>,
    pub event_type_id: String,
    pub start_date: String,
    pub end_date: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub event_type_id: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
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
pub async fn get_event_activity_counts(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HashMap<String, i64>, String> {
    debug!("Fetching event activity counts...");
    state
        .event_service()
        .get_activity_counts()
        .map_err(|e| {
            error!("Failed to fetch event activity counts: {}", e);
            format!("Failed to fetch event activity counts: {}", e)
        })
}

#[tauri::command]
pub async fn get_event_spending_summaries(
    start_date: Option<String>,
    end_date: Option<String>,
    base_currency: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<EventSpendingSummary>, String> {
    debug!(
        "Fetching event spending summaries for period: {:?} to {:?}",
        start_date, end_date
    );
    state
        .event_service()
        .get_event_spending_summaries(
            start_date.as_deref(),
            end_date.as_deref(),
            &base_currency,
        )
        .map_err(|e| {
            error!("Failed to fetch event spending summaries: {}", e);
            format!("Failed to fetch event spending summaries: {}", e)
        })
}
