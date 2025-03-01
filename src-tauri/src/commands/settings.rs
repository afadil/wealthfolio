use crate::models::{
    ContributionLimit, NewContributionLimit, Settings,
    SettingsUpdate,
};
use crate::settings::settings_service;
use crate::AppState;
use diesel::r2d2::ConnectionManager;
use diesel::SqliteConnection;
use log::debug;
use tauri::State;
use wealthfolio_core::fx::fx_service::FxService;
use wealthfolio_core::models::DepositsCalculation;
use wealthfolio_core::fx::fx_model::{ExchangeRate, NewExchangeRate};

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
    debug!("Fetching active settings...");
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new(state.pool.clone());
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub async fn update_settings(
    settings: SettingsUpdate,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    debug!("Updating settings...");
    let mut conn = get_connection(&state)?;
    let service = settings_service::SettingsService::new(state.pool.clone());

    // Update settings
    service
        .update_settings(&mut conn, &settings)
        .map_err(|e| format!("Failed to update settings: {}", e))?;

    // Update the app state with the new base currency
    state.update_base_currency(settings.base_currency);

    // Return updated settings
    service
        .get_settings(&mut conn)
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub async fn update_exchange_rate(
    rate: ExchangeRate,
    state: State<'_, AppState>,
) -> Result<ExchangeRate, String> {
    debug!("Updating exchange rate...");
    let service = FxService::new(state.pool.clone());
    service
        .update_exchange_rate(&rate.from_currency, &rate.to_currency, rate.rate)
        .map_err(|e| format!("Failed to update exchange rate: {}", e))
}

#[tauri::command]
pub async fn get_exchange_rates(state: State<'_, AppState>) -> Result<Vec<ExchangeRate>, String> {
    debug!("Fetching exchange rates...");
    let service = FxService::new(state.pool.clone());
    service
        .get_exchange_rates()
        .map_err(|e| format!("Failed to load exchange rates: {}", e))
}

#[tauri::command]
pub async fn add_exchange_rate(
    new_rate: NewExchangeRate,
    state: State<'_, AppState>,
) -> Result<ExchangeRate, String> {
    debug!("Adding new exchange rate...");
    let service = FxService::new(state.pool.clone());
    service
        .add_exchange_rate(new_rate)
        .map_err(|e| format!("Failed to add exchange rate: {}", e))
}

#[tauri::command]
pub async fn delete_exchange_rate(
    rate_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    debug!("Deleting exchange rate...");
    let service = FxService::new(state.pool.clone());
    service
        .delete_exchange_rate(&rate_id)
        .map_err(|e| format!("Failed to delete exchange rate: {}", e))
}

// Add these imports
use crate::settings::contribution_limit_service::ContributionLimitService;

// Add these new commands

#[tauri::command]
pub async fn get_contribution_limits(
    state: State<'_, AppState>,
) -> Result<Vec<ContributionLimit>, String> {
    debug!("Fetching contribution limits...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new(state.pool.clone());
    service
        .get_contribution_limits(&mut conn)
        .map_err(|e| format!("Failed to load contribution limits: {}", e))
}

#[tauri::command]
pub async fn create_contribution_limit(
    new_limit: NewContributionLimit,
    state: State<'_, AppState>,
) -> Result<ContributionLimit, String> {
    debug!("Creating new contribution limit...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new(state.pool.clone());
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
    debug!("Updating contribution limit...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new(state.pool.clone());
    service
        .update_contribution_limit(&mut conn, &id, updated_limit)
        .map_err(|e| format!("Failed to update contribution limit: {}", e))
}

#[tauri::command]
pub async fn delete_contribution_limit(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    debug!("Deleting contribution limit...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new(state.pool.clone());
    service
        .delete_contribution_limit(&mut conn, &id)
        .map_err(|e| format!("Failed to delete contribution limit: {}", e))
}

#[tauri::command]
pub async fn calculate_deposits_for_accounts(
    account_ids: Vec<String>,
    year: i32,
    state: State<'_, AppState>,
) -> Result<DepositsCalculation, String> {
    debug!("Calculating deposits for accounts...");
    let mut conn = get_connection(&state)?;
    let service = ContributionLimitService::new(state.pool.clone());
    let base_currency = state.get_base_currency();
    service
        .calculate_deposits_for_accounts(&mut conn, &account_ids, year, &base_currency)
        .map_err(|e| format!("Failed to calculate deposits for accounts: {}", e))
}
