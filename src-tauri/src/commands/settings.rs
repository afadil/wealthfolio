use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{ExchangeRate, NewExchangeRate, Settings};
use crate::settings::settings_service;
use crate::AppState;
use diesel::r2d2::ConnectionManager;
use diesel::SqliteConnection;
use tauri::State;

fn get_connection(
    state: &State<AppState>,
) -> Result<diesel::r2d2::PooledConnection<ConnectionManager<SqliteConnection>>, String> {
    state
        .pool
        .clone()
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    println!("Fetching active settings...");
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new();
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub async fn update_settings(
    settings: Settings,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    println!("Updating settings...");
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new();
    service
        .update_settings(&mut conn, &settings)
        .map_err(|e| format!("Failed to update settings: {}", e))?;
    // Update the app state
    let mut base_currency = state.base_currency.write().map_err(|e| e.to_string())?;
    *base_currency = settings.base_currency;
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub async fn update_exchange_rate(
    rate: ExchangeRate,
    state: State<'_, AppState>,
) -> Result<ExchangeRate, String> {
    println!("Updating exchange rate...");
    let mut conn = get_connection(&state)?;
    let fx_service = CurrencyExchangeService::new();
    fx_service
        .update_exchange_rate(&mut conn, &rate)
        .map_err(|e| format!("Failed to update exchange rate: {}", e))
}

#[tauri::command]
pub async fn get_exchange_rates(state: State<'_, AppState>) -> Result<Vec<ExchangeRate>, String> {
    println!("Fetching exchange rates...");
    let mut conn = get_connection(&state)?;
    let fx_service = CurrencyExchangeService::new();
    fx_service
        .get_exchange_rates(&mut conn)
        .map_err(|e| format!("Failed to load exchange rates: {}", e))
}

#[tauri::command]
pub async fn add_exchange_rate(
    new_rate: NewExchangeRate,
    state: State<'_, AppState>,
) -> Result<ExchangeRate, String> {
    println!("Adding new exchange rate...");
    let mut conn = get_connection(&state)?;
    let fx_service = CurrencyExchangeService::new();
    fx_service
        .add_exchange_rate(
            &mut conn,
            new_rate.from_currency,
            new_rate.to_currency,
            Some(new_rate.rate),
        )
        .map_err(|e| format!("Failed to add exchange rate: {}", e))
}

#[tauri::command]
pub async fn delete_exchange_rate(
    rate_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Deleting exchange rate...");
    let mut conn = get_connection(&state)?;
    let fx_service = CurrencyExchangeService::new();
    fx_service
        .delete_exchange_rate(&mut conn, &rate_id)
        .map_err(|e| format!("Failed to delete exchange rate: {}", e))
}
