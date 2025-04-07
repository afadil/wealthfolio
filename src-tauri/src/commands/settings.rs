use std::sync::Arc;

use crate::context::ServiceContext;
use crate::models::{Settings, SettingsUpdate};
use log::debug;
use tauri::State;
use wealthfolio_core::fx::fx_model::{ExchangeRate, NewExchangeRate};

// #[tauri::command]
// pub async fn get_settings(state: State<'_, ServiceContext>) -> Result<Settings, String> {
//     debug!("Fetching active settings...");
//     state
//         .settings_service()
//         .get_settings()
//         .map_err(|e| format!("Failed to load settings: {}", e))
// }

#[tauri::command]
pub async fn get_settings(state: State<'_, Arc<ServiceContext>>) -> Result<Settings, String> {
    debug!("Fetching active settings...");
    state
        .settings_service()
        .get_settings()
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub async fn update_settings(
    settings: SettingsUpdate,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Settings, String> {
    debug!("Updating settings...");
    let service = state.settings_service();
    let new_base_currency = settings.base_currency.clone();
    service
        .update_settings(&settings)
        .map_err(|e| format!("Failed to update settings: {}", e))?;
    state.update_base_currency(new_base_currency);
    service
        .get_settings()
        .map_err(|e| format!("Failed to load updated settings: {}", e))
}

#[tauri::command]
pub async fn update_exchange_rate(
    rate: ExchangeRate,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ExchangeRate, String> {
    debug!("Updating exchange rate...");
    state
        .fx_service()
        .update_exchange_rate(&rate.from_currency, &rate.to_currency, rate.rate)
        .map_err(|e| format!("Failed to update exchange rate: {}", e))
}

#[tauri::command]
pub async fn get_exchange_rates(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ExchangeRate>, String> {
    debug!("Fetching exchange rates...");
    state
        .fx_service()
        .get_exchange_rates()
        .map_err(|e| format!("Failed to load exchange rates: {}", e))
}

#[tauri::command]
pub async fn add_exchange_rate(
    new_rate: NewExchangeRate,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ExchangeRate, String> {
    debug!("Adding new exchange rate...");
    state
        .fx_service()
        .add_exchange_rate(new_rate)
        .map_err(|e| format!("Failed to add exchange rate: {}", e))
}

#[tauri::command]
pub async fn delete_exchange_rate(
    rate_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Deleting exchange rate...");
    state
        .fx_service()
        .delete_exchange_rate(&rate_id)
        .map_err(|e| format!("Failed to delete exchange rate: {}", e))
}
