use crate::{context::ServiceContext, secret_store::KeyringSecretStore};
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::secrets::SecretStore;

#[tauri::command]
pub async fn set_secret(
    secret_key: String,
    secret: String,
    _state: State<'_, Arc<ServiceContext>>, // keep signature consistent
) -> Result<(), String> {
    KeyringSecretStore
        .set_secret(&secret_key, &secret)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_secret(
    secret_key: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<String>, String> {
    KeyringSecretStore
        .get_secret(&secret_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_secret(
    secret_key: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    KeyringSecretStore
        .delete_secret(&secret_key)
        .map_err(|e| e.to_string())
}
