use std::sync::Arc;

use crate::context::ServiceContext;
use log::{debug, error, info};
use tauri::State;

use wealthfolio_core::accounts::{Account, AccountUpdate, NewAccount, TrackingMode};

#[tauri::command]
pub async fn get_accounts(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Account>, String> {
    debug!("Fetching active accounts...");
    state
        .account_service()
        .get_all_accounts()
        .map_err(|e| format!("Failed to load accounts: {}", e))
}

#[tauri::command]
pub async fn create_account(
    account: NewAccount,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Account, String> {
    debug!("Adding new account...");
    // Domain events handle recalculation automatically
    state
        .account_service()
        .create_account(account)
        .await
        .map_err(|e| {
            error!("Failed to add new account: {}", e);
            format!("Failed to add new account: {}", e)
        })
}

#[tauri::command]
pub async fn update_account(
    account_update: AccountUpdate,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Account, String> {
    debug!("Updating account {:?}...", account_update.id);

    // Domain events handle recalculation automatically
    state
        .account_service()
        .update_account(account_update.clone())
        .await
        .map_err(|e| format!("Failed to update account {:?}: {}", account_update.id, e))
}

#[tauri::command]
pub async fn delete_account(
    account_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Deleting account {}...", account_id);
    // Domain events handle recalculation automatically
    state
        .account_service()
        .delete_account(&account_id)
        .await
        .map_err(|e| {
            error!("Failed to delete account {}: {}", account_id, e);
            e.to_string()
        })
}

/// Switches an account's tracking mode with proper handling of snapshot sources.
/// Updates account meta with the new tracking mode.
#[tauri::command]
pub async fn switch_tracking_mode(
    account_id: String,
    new_mode: TrackingMode,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!(
        "Switching tracking mode for account {} to {:?}",
        account_id, new_mode
    );

    // Get the current account for meta update
    let account = state
        .account_service()
        .get_account(&account_id)
        .map_err(|e| format!("Failed to get account: {}", e))?;

    // Update the account meta with the new tracking mode
    let new_meta = wealthfolio_core::accounts::set_tracking_mode(account.meta.clone(), new_mode);

    let account_update = AccountUpdate {
        id: Some(account_id.clone()),
        name: account.name,
        account_type: account.account_type,
        group: account.group,
        is_default: account.is_default,
        is_active: account.is_active,
        platform_id: account.platform_id,
        account_number: account.account_number,
        meta: Some(new_meta),
        provider: account.provider,
        provider_account_id: account.provider_account_id,
    };

    // Domain events handle recalculation and broker sync automatically
    state
        .account_service()
        .update_account(account_update)
        .await
        .map_err(|e| format!("Failed to update account: {}", e))?;

    info!(
        "Successfully switched tracking mode for account {} to {:?}",
        account_id, new_mode
    );

    Ok(())
}
