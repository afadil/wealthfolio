use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_resource_changed, ResourceEventPayload},
};
use log::{debug, error};
use tauri::{AppHandle, State};

use serde_json::json;
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
            emit_resource_changed(
                &handle,
                ResourceEventPayload::new(
                    "account",
                    "created",
                    json!({
                        "account_id": acc.id,
                        "currency": acc.currency,
                    }),
                ),
            );
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

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "account",
            "updated",
            json!({
                "account_id": account_id_clone,
                "currency": updated_account.currency,
            }),
        ),
    );

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

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "account",
            "deleted",
            json!({
                "account_id": account_id,
            }),
        ),
    );

    Ok(())
}
