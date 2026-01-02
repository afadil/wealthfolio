use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_resource_changed, ResourceEventPayload},
};
use log::debug;
use serde_json::json;
use tauri::{AppHandle, State};
use wealthfolio_core::inflation::{InflationAdjustedValue, InflationRate, NewInflationRate};

#[tauri::command]
pub async fn get_inflation_rates(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<InflationRate>, String> {
    debug!("Fetching inflation rates...");
    state
        .inflation_service()
        .get_inflation_rates()
        .map_err(|e| format!("Failed to load inflation rates: {}", e))
}

#[tauri::command]
pub async fn get_inflation_rates_by_country(
    country_code: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<InflationRate>, String> {
    debug!("Fetching inflation rates for country: {}", country_code);
    state
        .inflation_service()
        .get_inflation_rates_by_country(&country_code)
        .map_err(|e| format!("Failed to load inflation rates: {}", e))
}

#[tauri::command]
pub async fn create_inflation_rate(
    new_rate: NewInflationRate,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<InflationRate, String> {
    debug!("Creating new inflation rate...");
    let rate = state
        .inflation_service()
        .create_inflation_rate(new_rate)
        .await
        .map_err(|e| format!("Failed to create inflation rate: {}", e))?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("inflation_rate", "created", json!({ "rate_id": rate.id })),
    );

    Ok(rate)
}

#[tauri::command]
pub async fn update_inflation_rate(
    id: String,
    updated_rate: NewInflationRate,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<InflationRate, String> {
    debug!("Updating inflation rate...");
    let rate = state
        .inflation_service()
        .update_inflation_rate(&id, updated_rate)
        .await
        .map_err(|e| format!("Failed to update inflation rate: {}", e))?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("inflation_rate", "updated", json!({ "rate_id": id })),
    );

    Ok(rate)
}

#[tauri::command]
pub async fn delete_inflation_rate(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    debug!("Deleting inflation rate...");
    state
        .inflation_service()
        .delete_inflation_rate(&id)
        .await
        .map_err(|e| format!("Failed to delete inflation rate: {}", e))?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("inflation_rate", "deleted", json!({ "rate_id": id })),
    );

    Ok(())
}

#[tauri::command]
pub async fn fetch_inflation_rates_from_world_bank(
    country_code: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Vec<InflationRate>, String> {
    debug!(
        "Fetching inflation rates from World Bank for: {}",
        country_code
    );
    let rates = state
        .inflation_service()
        .fetch_from_world_bank(&country_code)
        .await
        .map_err(|e| format!("Failed to fetch from World Bank: {}", e))?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "inflation_rate",
            "synced",
            json!({ "country_code": country_code }),
        ),
    );

    Ok(rates)
}

#[tauri::command]
pub async fn calculate_inflation_adjusted_portfolio(
    nominal_values: Vec<(i32, f64, String)>,
    country_code: String,
    base_year: i32,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<InflationAdjustedValue>, String> {
    debug!("Calculating inflation-adjusted portfolio values...");
    state
        .inflation_service()
        .calculate_inflation_adjusted_values(nominal_values, &country_code, base_year)
        .map_err(|e| format!("Failed to calculate adjusted values: {}", e))
}
