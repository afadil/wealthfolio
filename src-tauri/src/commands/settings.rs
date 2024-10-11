use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{
    ContributionLimit, ExchangeRate, NewContributionLimit, NewExchangeRate, Settings,
    SettingsUpdate,
};
use crate::settings::settings_service;
use crate::AppState;
use diesel::r2d2::ConnectionManager;
use diesel::SqliteConnection;
use tauri::State;
use wealthfolio_core::models::DepositsCalculation;

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
    settings: SettingsUpdate,
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

// Add these imports
use crate::settings::contribution_limit_service::ContributionLimitService;

// Add these new commands

#[tauri::command]
pub async fn get_contribution_limits(
    state: State<'_, AppState>,
) -> Result<Vec<ContributionLimit>, String> {
    println!("Fetching contribution limits...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new();
    service
        .get_contribution_limits(&mut conn)
        .map_err(|e| format!("Failed to load contribution limits: {}", e))
}

#[tauri::command]
pub async fn create_contribution_limit(
    new_limit: NewContributionLimit,
    state: State<'_, AppState>,
) -> Result<ContributionLimit, String> {
    println!("Creating new contribution limit...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new();
    service
        .create_contribution_limit(&mut conn, new_limit)
        .map_err(|e| format!("Failed to create contribution limit: {}", e))
}

#[tauri::command]
pub async fn update_contribution_limit(
    id: String,
    updated_limit: NewContributionLimit,
    state: State<'_, AppState>,
) -> Result<ContributionLimit, String> {
    println!("Updating contribution limit...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new();
    service
        .update_contribution_limit(&mut conn, &id, updated_limit)
        .map_err(|e| format!("Failed to update contribution limit: {}", e))
}

#[tauri::command]
pub async fn delete_contribution_limit(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Deleting contribution limit...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new();
    service
        .delete_contribution_limit(&mut conn, &id)
        .map_err(|e| format!("Failed to delete contribution limit: {}", e))
}

// Add this new command
#[tauri::command]
pub async fn calculate_deposits_for_accounts(
    account_ids: Vec<String>,
    year: i32,
    state: State<'_, AppState>,
) -> Result<DepositsCalculation, String> {
    println!("Calculating deposits for accounts...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new();
    let base_currency = state.base_currency.read().map_err(|e| e.to_string())?;
    service
        .calculate_deposits_for_accounts(&mut conn, &account_ids, year, &base_currency)
        .map_err(|e| format!("Failed to calculate deposits for accounts: {}", e))
}
