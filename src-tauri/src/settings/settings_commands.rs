use crate::models::{NewSettings, Settings};
use crate::settings::settings_service;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    println!("Fetching active settings...");
    let mut conn = state.conn.lock().unwrap();
    let service = settings_service::SettingsService::new();
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub fn update_settings(settings: NewSettings, state: State<AppState>) -> Result<Settings, String> {
    println!("Updating settings..."); // Log message
    let mut conn = state.conn.lock().unwrap();
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
    let mut conn = state.conn.lock().unwrap();
    let service = settings_service::SettingsService::new();
    service
        .update_base_currency(&mut conn, &currency)
        .map_err(|e| format!("Failed to update settings: {}", e))?;
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}
