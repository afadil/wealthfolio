use std::sync::Arc;
use tauri::State;
use crate::context::ServiceContext;
use wealthfolio_core::secrets::SecretManager;

#[tauri::command]
pub async fn set_api_key(
    service: String,
    api_key: String,
    _state: State<'_, Arc<ServiceContext>>, // keep signature consistent
) -> Result<(), String> {
    SecretManager::set_api_key(&service, &api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_api_key(
    service: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<String>, String> {
    SecretManager::get_api_key(&service).map_err(|e| e.to_string())
}
