use std::sync::Arc;

use crate::context::ServiceContext;
use crate::events::{emit_portfolio_trigger_recalculate, PortfolioRequestPayload};
use log::debug;
use tauri::{AppHandle, State};
use wealthfolio_core::fx::{ExchangeRate, NewExchangeRate};
use wealthfolio_core::settings::{Settings, SettingsUpdate};

#[tauri::command]
pub async fn get_settings(state: State<'_, Arc<ServiceContext>>) -> Result<Settings, String> {
    debug!("Fetching active settings...");
    state
        .settings_service()
        .get_settings()
        .map_err(|e| format!("Failed to load settings: {}", e))
}

#[tauri::command]
pub async fn is_auto_update_check_enabled(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<bool, String> {
    debug!("Checking if auto-update check is enabled...");
    state
        .settings_service()
        .is_auto_update_check_enabled()
        .map_err(|e| format!("Failed to check auto-update setting: {}", e))
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
    let mut base_currency_changed = false;
    let mut new_base_currency_val: Option<String> = None;

    // Check if base_currency is present in the update and if it's different
    if let Some(ref updated_currency) = settings_update.base_currency {
        // Compare the current String with the String inside the Option
        if &current_base_currency != updated_currency {
            base_currency_changed = true;
            new_base_currency_val = Some(updated_currency.clone());
        }
    }

    // Update settings in the database (this applies all changes in settings_update)
    service
        .update_settings(&settings_update)
        .await
        .map_err(|e| format!("Failed to update settings: {}", e))?;

    if let Some(menu_visible) = settings_update.menu_bar_visible {
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            if menu_visible {
                // Create and set the menu on desktop platforms
                match crate::menu::create_menu(&handle) {
                    Ok(menu) => {
                        if let Err(e) = handle.set_menu(menu) {
                            debug!("Failed to set menu: {}", e);
                        }
                    }
                    Err(e) => {
                        debug!("Failed to create menu: {}", e);
                    }
                }
            } else {
                // Remove the menu entirely by setting it to None
                if let Err(e) = handle.remove_menu() {
                    debug!("Failed to remove menu: {}", e);
                }
            }
        }

        #[cfg(any(target_os = "android", target_os = "ios"))]
        {
            let _ = menu_visible;
            debug!("Menu bar visibility toggling is not supported on mobile runtimes.");
        }
    }

    // If the base currency was changed, update the state and emit the event
    if base_currency_changed {
        // new_base_currency_val is guaranteed to be Some(String) here because
        // base_currency_changed is true only if the check above passed.
        if let Some(new_currency) = new_base_currency_val {
            // Still good practice to use if let
            debug!(
                "Base currency changed from {} to {}, updating state.", // Use {} as new_currency is String
                current_base_currency,
                &new_currency // Log the String itself
            );
            state.update_base_currency(new_currency); // Pass the unwrapped String

            let handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                // Emit event to trigger portfolio update using the builder
                let payload = PortfolioRequestPayload::builder()
                    .account_ids(None) // Base currency change affects all accounts
                    .refetch_all_market_data(true)
                    .symbols(None) // Sync all relevant symbols
                    .build();
                emit_portfolio_trigger_recalculate(&handle, payload);
            });
        }
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
        .await
        .map_err(|e| format!("Failed to update exchange rate: {}", e))?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        // Emit event to trigger portfolio update
        emit_portfolio_trigger_recalculate(&handle, PortfolioRequestPayload::builder().build());
    });
    Ok(result)
}

#[tauri::command]
pub async fn get_latest_exchange_rates(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ExchangeRate>, String> {
    debug!("Fetching exchange rates...");
    state
        .fx_service()
        .get_latest_exchange_rates()
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
        .await
        .map_err(|e| format!("Failed to add exchange rate: {}", e))?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        // Emit event to trigger portfolio update
        emit_portfolio_trigger_recalculate(&handle, PortfolioRequestPayload::builder().build());
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
        .await
        .map_err(|e| format!("Failed to delete exchange rate: {}", e))?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        // Emit event to trigger portfolio update
        emit_portfolio_trigger_recalculate(&handle, PortfolioRequestPayload::builder().build());
    });
    Ok(())
}
