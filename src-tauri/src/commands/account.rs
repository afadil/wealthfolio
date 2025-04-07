use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use tauri::State;
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
pub async fn create_account(
    account: NewAccount,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Account, String> {
    debug!("Adding new account...");
    state
        .account_service()
        .create_account(account)
        .await
        .map_err(|e| format!("Failed to add new account: {}", e))
}

#[tauri::command]
pub async fn update_account(
    account: AccountUpdate,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Account, String> {
    debug!("Updating account...");
    state
        .account_service()
        .update_account(account)
        .map_err(|e| format!("Failed to update account: {}", e))
}

#[tauri::command]
pub async fn delete_account(account_id: String, state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    debug!("Deleting account...");
    state
        .account_service()
        .delete_account(&account_id)
        .map_err(|e| format!("Failed to delete account: {}", e))
}
