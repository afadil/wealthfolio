use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::secrets::SecretStore;

const SYNC_ACCESS_TOKEN_KEY: &str = "wealthfolio_sync_access_token";
const SYNC_REFRESH_TOKEN_KEY: &str = "wealthfolio_sync_refresh_token";

#[tauri::command]
pub async fn store_sync_session(
    access_token: String,
    refresh_token: Option<String>,
    _state: State<'_, Arc<ServiceContext>>, // keep signature consistent
) -> Result<(), String> {
    if access_token.trim().is_empty() {
        return Err("Access token cannot be empty".to_string());
    }

    KeyringSecretStore
        .set_secret(SYNC_ACCESS_TOKEN_KEY, &access_token)
        .map_err(|e| e.to_string())?;

    match refresh_token {
        Some(token) if !token.trim().is_empty() => KeyringSecretStore
            .set_secret(SYNC_REFRESH_TOKEN_KEY, &token)
            .map_err(|e| e.to_string())?,
        _ => KeyringSecretStore
            .delete_secret(SYNC_REFRESH_TOKEN_KEY)
            .map_err(|e| e.to_string())?,
    }

    Ok(())
}

#[tauri::command]
pub async fn clear_sync_session(
    _state: State<'_, Arc<ServiceContext>>, // keep signature consistent
) -> Result<(), String> {
    KeyringSecretStore
        .delete_secret(SYNC_ACCESS_TOKEN_KEY)
        .map_err(|e| e.to_string())?;
    KeyringSecretStore
        .delete_secret(SYNC_REFRESH_TOKEN_KEY)
        .map_err(|e| e.to_string())?;

    Ok(())
}

