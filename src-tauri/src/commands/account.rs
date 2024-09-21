use crate::account::account_service::AccountService;
use crate::models::{Account, AccountUpdate, NewAccount};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn get_accounts(state: State<AppState>) -> Result<Vec<Account>, String> {
    println!("Fetching active accounts...");
    let service = AccountService::new((*state.pool).clone());
    service
        .get_accounts()
        .map_err(|e| format!("Failed to load accounts: {}", e))
}

#[tauri::command]
pub async fn create_account(
    account: NewAccount,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    println!("Adding new account...");
    let service = AccountService::new((*state.pool).clone());
    service
        .create_account(account)
        .await
        .map_err(|e| format!("Failed to add new account: {}", e))
}

#[tauri::command]
pub fn update_account(account: AccountUpdate, state: State<AppState>) -> Result<Account, String> {
    println!("Updating account...");
    let service = AccountService::new((*state.pool).clone());
    service
        .update_account(account)
        .map_err(|e| format!("Failed to update account: {}", e))
}

#[tauri::command]
pub fn delete_account(account_id: String, state: State<AppState>) -> Result<usize, String> {
    println!("Deleting account...");
    let service = AccountService::new((*state.pool).clone());
    service
        .delete_account(account_id)
        .map_err(|e| format!("Failed to delete account: {}", e))
}
