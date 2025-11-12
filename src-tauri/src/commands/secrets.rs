use crate::{context::ServiceContext, secret_store::KeyringSecretStore};
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::secrets::SecretStore;

#[tauri::command]
pub async fn set_secret(
    provider_id: String,
    secret: String,
    _state: State<'_, Arc<ServiceContext>>, // keep signature consistent
) -> Result<(), String> {
    KeyringSecretStore::default()
        .set_secret(&provider_id, &secret)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_secret(
    provider_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<String>, String> {
    KeyringSecretStore::default()
        .get_secret(&provider_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_secret(
    provider_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    KeyringSecretStore::default()
        .delete_secret(&provider_id)
        .map_err(|e| e.to_string())
}
