use crate::models::{ExchangeRate, NewSettings, Quote, Settings};
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
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    println!("Fetching active settings...");
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new();
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub fn update_settings(settings: NewSettings, state: State<AppState>) -> Result<Settings, String> {
    println!("Updating settings..."); // Log message
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new();
    service
        .update_settings(&mut conn, &settings)
        .map_err(|e| format!("Failed to update settings: {}", e))?;
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub fn update_currency(currency: String, state: State<AppState>) -> Result<Settings, String> {
    println!("Updating base currency..."); // Log message
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new();
    service
        .update_base_currency(&mut conn, &currency)
        .map_err(|e| format!("Failed to update settings: {}", e))?;
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub fn update_exchange_rate(
    rate: ExchangeRate,
    state: State<AppState>,
) -> Result<ExchangeRate, String> {
    println!("Updating exchange rate...");
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new();
    service
        .update_exchange_rate(&mut conn, &rate)
        .map_err(|e| format!("Failed to update exchange rate: {}", e))
}

// #[tauri::command]
// pub fn get_exchange_rate_symbols(state: State<AppState>) -> Result<Vec<ExchangeRate>, String> {
//     println!("Fetching exchange rate symbols...");
//     let mut conn = get_connection(&state)?;
//     let service = settings_service::SettingsService::new();
//     service
//         .get_exchange_rate_symbols(&mut conn)
//         .map_err(|e| format!("Failed to load exchange rate symbols: {}", e))
// }

// #[tauri::command]
// pub fn get_latest_quote(state: State<AppState>, symbol: String) -> Result<Option<Quote>, String> {
//     println!("Fetching latest quote for symbol: {}", symbol);
//     let mut conn = get_connection(&state)?;
//     let service = settings_service::SettingsService::new();
//     service
//         .get_latest_quote(&mut conn, &symbol)
//         .map_err(|e| format!("Failed to load latest quote: {}", e))
// }

#[tauri::command]
pub fn get_exchange_rates(state: State<AppState>) -> Result<Vec<ExchangeRate>, String> {
    println!("Fetching exchange rates...");
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new();
    service
        .get_exchange_rates(&mut conn)
        .map_err(|e| format!("Failed to load exchange rates: {}", e))
}
