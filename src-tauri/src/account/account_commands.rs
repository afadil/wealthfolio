use crate::account::account_service;
use crate::models::{Account, AccountUpdate, NewAccount};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn get_accounts(state: State<AppState>) -> Result<Vec<Account>, String> {
    println!("Fetching active accounts..."); // Log message
    let mut conn = state.conn.lock().unwrap();
    let service = account_service::AccountService::new();
    service
        .get_accounts(&mut conn)
        .map_err(|e| format!("Failed to load accounts: {}", e))
}

#[tauri::command]
pub fn create_account(account: NewAccount, state: State<AppState>) -> Result<Account, String> {
    println!("Adding new account..."); // Log message
    let mut conn = state.conn.lock().unwrap();
    let service = account_service::AccountService::new();
    service
        .create_account(&mut conn, account)
        .map_err(|e| format!("Failed to add new account: {}", e))
}

#[tauri::command]
pub fn update_account(account: AccountUpdate, state: State<AppState>) -> Result<Account, String> {
    println!("Updating account..."); // Log message
    let mut conn = state.conn.lock().unwrap();
    let service = account_service::AccountService::new();
    service
        .update_account(&mut conn, account)
        .map_err(|e| format!("Failed to update account: {}", e))
}

#[tauri::command]
pub fn delete_account(account_id: String, state: State<AppState>) -> Result<usize, String> {
    println!("Deleting account..."); // Log message
    let mut conn = state.conn.lock().unwrap();
    let service = account_service::AccountService::new();
    service
        .delete_account(&mut conn, account_id)
        .map_err(|e| format!("Failed to delete account: {}", e))
}
