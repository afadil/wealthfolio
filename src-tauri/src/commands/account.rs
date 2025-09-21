use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_portfolio_trigger_recalculate, PortfolioRequestPayload},
};
use log::{debug, error, warn};
use tauri::{AppHandle, State};

use wealthfolio_core::accounts::{Account, AccountUpdate, NewAccount};

#[tauri::command]
pub async fn get_accounts(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Account>, String> {
    debug!("Fetching active accounts...");
    state
        .account_service()
        .get_all_accounts()
        .map_err(|e| format!("Failed to load accounts: {}", e))
}

#[tauri::command]
pub async fn get_active_accounts(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Account>, String> {
    debug!("Fetching active accounts...");
    state
        .account_service()
        .get_active_accounts()
        .map_err(|e| format!("Failed to load accounts: {}", e))
}

#[tauri::command]
pub async fn create_account(
    account: NewAccount,
    state: State<'_, Arc<ServiceContext>>,
    handle: tauri::AppHandle,
) -> Result<Account, String> {
    debug!("Adding new account...");
    let result = state.account_service().create_account(account).await;

    match result {
        Ok(acc) => {
            let handle = handle.clone();
            let account_id = acc.id.clone();
            let account_currency = acc.currency.clone();
            let settings_service = state.settings_service(); // Assuming settings_service is available

            tauri::async_runtime::spawn(async move {
                let mut symbols_to_sync: Option<Vec<String>> = None;

                // Attempt to get base currency and construct the specific symbol
                match settings_service.get_base_currency() {
                    Ok(Some(base_currency)) => {
                        if !base_currency.is_empty() && base_currency != account_currency {
                            let symbol = format!("{}{}={}", account_currency, base_currency, "X");
                            symbols_to_sync = Some(vec![symbol]);
                            debug!(
                                "Requesting portfolio update for account {} with currency sync for {}",
                                account_id,
                                symbols_to_sync.as_ref().unwrap().join(", ")
                            );
                        } else {
                            debug!(
                                "Requesting portfolio update for account {}. Base currency matches account currency or is empty, skipping specific symbol sync.",
                                account_id
                            );
                        }
                    }
                    Ok(None) => {
                        // Base currency is not set
                        warn!(
                            "Base currency not set. Requesting update for account {} with generic sync.",
                            account_id
                        );
                        // Fallback to syncing all relevant symbols
                    }
                    Err(e) => {
                        warn!(
                            "Failed to get base currency for symbol generation: {}. Requesting update for account {} with generic sync.",
                            e, account_id
                        );
                        // Fallback to syncing all relevant symbols if base currency fetch fails
                    }
                }

                // Build the payload using the builder pattern
                let payload = PortfolioRequestPayload::builder()
                    .account_ids(Some(vec![account_id]))
                    .symbols(symbols_to_sync)
                    .build();

                emit_portfolio_trigger_recalculate(&handle, payload);
            });
            Ok(acc)
        }
        Err(e) => {
            error!("Failed to add new account: {}", e); // Use error! for errors
            Err(format!("Failed to add new account: {}", e))
        }
    }
}

#[tauri::command]
pub async fn update_account(
    account_update: AccountUpdate,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Account, String> {
    debug!("Updating account {:?}...", account_update.id);

    // Perform the update - Assuming synchronous based on prior linter errors
    let updated_account = state
        .account_service()
        .update_account(account_update.clone()) // Removed .await
        .await // Add .await here
        .map_err(|e| format!("Failed to update account {:?}: {}", account_update.id, e))?;

    // Trigger recalculation after successful update
    let handle = handle.clone();
    let account_id_clone = updated_account.id.clone();

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id_clone]))
        .build();

    // Emit the recalculation request
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(updated_account)
}

#[tauri::command]
pub async fn delete_account(
    account_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Deleting account {}...", account_id); // Add account_id to log
    state
        .account_service()
        .delete_account(&account_id)
        .await // Add .await here
        .map_err(|e| {
            error!("Failed to delete account {}: {}", account_id, e); // Log error
            e.to_string()
        })?;

    // Emit event to trigger recalculation if deletion was successful
    // Deleting an account likely requires a full recalculation or broader update
    let payload = PortfolioRequestPayload::builder()
        .account_ids(None) // None signifies all accounts
        .build();

    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(())
}
