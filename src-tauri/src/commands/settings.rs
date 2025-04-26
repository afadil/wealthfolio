use std::sync::Arc;

use crate::context::ServiceContext;
use crate::events::{emit_portfolio_recalculate_request, PortfolioRequestPayload};
use crate::models::{Settings, SettingsUpdate};
use log::debug;
use tauri::{State, AppHandle};
use wealthfolio_core::fx::fx_model::{ExchangeRate, NewExchangeRate};

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
    settings_update: SettingsUpdate,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Settings, String> {
    debug!("Updating settings...");
    let service = state.settings_service();

    let current_base_currency = state.get_base_currency();

    // Determine if the base currency specified in the update is different from the current one
    let base_currency_changed = current_base_currency != settings_update.base_currency;

    // Update settings in the database (this applies all changes in settings_update)
    service
        .update_settings(&settings_update)
        .map_err(|e| format!("Failed to update settings: {}", e))?;

    // If the base currency was changed, update the state and emit the event
    if base_currency_changed {
        // We clone the String from the update to pass to the state update function.
        let new_base_currency = settings_update.base_currency.clone();
        debug!("Base currency changed, updating state to: {}", new_base_currency);
        state.update_base_currency(new_base_currency);

        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            // Emit event to trigger portfolio update using the builder
            let payload = PortfolioRequestPayload::builder()
                .account_ids(None) // Base currency change affects all accounts
                .sync_market_data(true)
                .symbols(None) // Sync all relevant symbols
                .build();
            emit_portfolio_recalculate_request(&handle, payload);
        });
    }

    // Return the latest settings from the database
    service
        .get_settings()
        .map_err(|e| format!("Failed to load updated settings after change: {}", e))
}

#[tauri::command]
pub async fn update_exchange_rate(
    rate: ExchangeRate,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<ExchangeRate, String> {
    debug!("Updating exchange rate...");
    let result = state
        .fx_service()
        .update_exchange_rate(&rate.from_currency, &rate.to_currency, rate.rate)
        .map_err(|e| format!("Failed to update exchange rate: {}", e))?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        // Emit event to trigger portfolio update
        // emit_holdings_history_calculation_request(&handle, None, false);
    });
    Ok(result)
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
    handle: AppHandle,
) -> Result<ExchangeRate, String> {
    debug!("Adding new exchange rate...");
    let result = state
        .fx_service()
        .add_exchange_rate(new_rate)
        .map_err(|e| format!("Failed to add exchange rate: {}", e))?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        // Emit event to trigger portfolio update
        // emit_holdings_history_calculation_request(&handle, None, false);
    });
    Ok(result)
}

#[tauri::command]
pub async fn delete_exchange_rate(
    rate_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    debug!("Deleting exchange rate...");
    state
        .fx_service()
        .delete_exchange_rate(&rate_id)
        .map_err(|e| format!("Failed to delete exchange rate: {}", e))?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        // Emit event to trigger portfolio update
        // emit_holdings_history_calculation_request(&handle, None, false);
    });
    Ok(())
}
