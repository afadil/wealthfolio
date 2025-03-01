use crate::AppState;
use log::debug;
use tauri::State;
use wealthfolio_core::accounts::{Account, AccountService, AccountUpdate, NewAccount};

#[tauri::command]
pub async fn get_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    debug!("Fetching active accounts...");
    let base_currency = state.get_base_currency();
    let service = AccountService::new(state.pool.clone(), base_currency);
    service
        .get_all_accounts()
        .map_err(|e| format!("Failed to load accounts: {}", e))
}

#[tauri::command]
pub async fn create_account(
    account: NewAccount,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    debug!("Adding new account...");
    let base_currency = state.get_base_currency();
    let service = AccountService::new(state.pool.clone(), base_currency);
    service
        .create_account(account)
        .await
        .map_err(|e| format!("Failed to add new account: {}", e))
}

#[tauri::command]
pub async fn update_account(
    account: AccountUpdate,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    debug!("Updating account...");
    let base_currency = state.get_base_currency();
    let service = AccountService::new(state.pool.clone(), base_currency);
    service
        .update_account(account)
        .map_err(|e| format!("Failed to update account: {}", e))
}

#[tauri::command]
pub async fn delete_account(
    account_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    debug!("Deleting account...");
    let base_currency = state.get_base_currency();
    let service = AccountService::new(state.pool.clone(), base_currency);
    service
        .delete_account(&account_id)
        .map_err(|e| format!("Failed to delete account: {}", e))
}
