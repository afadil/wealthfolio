use crate::account::account_service::AccountService;
use crate::models::{Account, AccountUpdate, NewAccount, ImportMapping, NewImportMapping};
use crate::AppState;
use chrono::Utc;
use tauri::State;

#[tauri::command]
pub async fn get_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    println!("Fetching active accounts...");
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = AccountService::new(base_currency);
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    service
        .get_accounts(&mut conn)
        .map_err(|e| format!("Failed to load accounts: {}", e))
}

#[tauri::command]
pub async fn create_account(
    account: NewAccount,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    println!("Adding new account...");
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = AccountService::new(base_currency);
    service
        .create_account(&mut conn, account)
        .await
        .map_err(|e| format!("Failed to add new account: {}", e))
}

#[tauri::command]
pub async fn update_account(
    account: AccountUpdate,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    println!("Updating account...");
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = AccountService::new(base_currency);
    service
        .update_account(&mut conn, account)
        .map_err(|e| format!("Failed to update account: {}", e))
}

#[tauri::command]
pub async fn delete_account(
    account_id: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    println!("Deleting account...");
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = AccountService::new(base_currency);
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    service
        .delete_account(&mut conn, account_id)
        .map_err(|e| format!("Failed to delete account: {}", e))
}

#[tauri::command]
pub fn add_import_mapping(
    state: State<'_, AppState>,
    account_id: String,
    fields_mappings: String,
    activity_type_mappings: String,
) -> Result<(), String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    let base_currency = state.base_currency.read().unwrap().clone();
    let account_service = AccountService::new(base_currency);

    let now = Utc::now().naive_utc();

    let new_import_mapping = NewImportMapping {
        account_id: account_id.clone(),
        fields_mappings,
        activity_type_mappings,
        created_at: now,
        updated_at: now,
    };

    account_service
        .save_account_import_mapping(&mut conn, &account_id, new_import_mapping)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fetch_import_mapping(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Option<ImportMapping>, String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    let base_currency = state.base_currency.read().unwrap().clone();
    let account_service = AccountService::new(base_currency);

    account_service
        .get_account_import_mapping(&mut conn, &account_id)
        .map_err(|e| e.to_string())
}
