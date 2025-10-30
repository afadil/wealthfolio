use crate::context::ServiceContext;
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::secrets::SecretManager;

#[tauri::command]
pub async fn set_secret(
    provider_id: String,
    secret: String,
    _state: State<'_, Arc<ServiceContext>>, // keep signature consistent
) -> Result<(), String> {
    SecretManager::set_secret(&provider_id, &secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_secret(
    provider_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<String>, String> {
    SecretManager::get_secret(&provider_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_secret(
    provider_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    SecretManager::delete_secret(&provider_id).map_err(|e| e.to_string())
}
