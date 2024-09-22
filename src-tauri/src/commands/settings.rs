use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{ExchangeRate, Settings};
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
pub fn update_settings(settings: Settings, state: State<AppState>) -> Result<Settings, String> {
    println!("Updating settings..."); // Log message
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

// #[tauri::command]
// pub async fn update_base_currency(
//     state: tauri::State<'_, AppState>,
//     new_currency: String,
// ) -> Result<Settings, String> {
//     let pool = &state.pool;
//     let mut conn = pool.get().map_err(|e| e.to_string())?;

//     let settings_service = settings_service::SettingsService::new();
//     settings_service
//         .update_base_currency(&mut conn, &new_currency)
//         .map_err(|e| e.to_string())?;

//     // Update the app state
//     let mut base_currency = state.base_currency.write().map_err(|e| e.to_string())?;
//     *base_currency = new_currency;

//     // Return the updated settings
//     settings_service
//         .get_settings(&mut conn)
//         .map_err(|e| format!("Failed to load updated settings: {}", e))
// }

#[tauri::command]
pub fn update_exchange_rate(
    rate: ExchangeRate,
    state: State<AppState>,
) -> Result<ExchangeRate, String> {
    println!("Updating exchange rate...");
    let fx_service = CurrencyExchangeService::new((*state.pool).clone());
    fx_service
        .update_exchange_rate(&rate)
        .map_err(|e| format!("Failed to update exchange rate: {}", e))
}

#[tauri::command]
pub fn get_exchange_rates(state: State<AppState>) -> Result<Vec<ExchangeRate>, String> {
    println!("Fetching exchange rates...");
    let fx_service = CurrencyExchangeService::new((*state.pool).clone());
    fx_service
        .get_exchange_rates()
        .map_err(|e| format!("Failed to load exchange rates: {}", e))
}
