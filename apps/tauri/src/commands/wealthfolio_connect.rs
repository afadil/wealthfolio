use crate::commands::device_sync::clear_min_snapshot_created_at_from_store;
use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use log::{error, info};
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::secrets::SecretStore;

// Storage keys (without prefix - the SecretStore adds "wealthfolio_" prefix)
const SYNC_ACCESS_TOKEN_KEY: &str = "sync_access_token";
const SYNC_REFRESH_TOKEN_KEY: &str = "sync_refresh_token";

#[tauri::command]
pub async fn store_sync_session(
    access_token: String,
    refresh_token: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    if access_token.trim().is_empty() {
        return Err("Access token cannot be empty".to_string());
    }

    info!("Attempting to store sync session in keyring...");

    if let Err(e) = KeyringSecretStore.set_secret(SYNC_ACCESS_TOKEN_KEY, &access_token) {
        error!("Failed to store access token in keyring: {}", e);
        return Err(format!("Failed to store access token: {}", e));
    }
    info!("Access token stored successfully");

    match refresh_token.as_deref().map(str::trim) {
        Some(token) if !token.is_empty() => {
            if let Err(e) = KeyringSecretStore.set_secret(SYNC_REFRESH_TOKEN_KEY, token) {
                error!("Failed to store refresh token in keyring: {}", e);
                return Err(format!("Failed to store refresh token: {}", e));
            }
            info!("Refresh token stored successfully");
        }
        _ => {
            if let Err(e) = KeyringSecretStore.delete_secret(SYNC_REFRESH_TOKEN_KEY) {
                error!("Failed to delete refresh token from keyring: {}", e);
                // Don't fail the whole operation if we can't delete
            }
        }
    }

    info!("Sync session stored successfully in keyring");
    state.connect_service().clear_cached_token().await;
    Ok(())
}

#[tauri::command]
pub async fn clear_sync_session(state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    // Try to delete both tokens, collecting errors instead of failing fast
    let access_result = KeyringSecretStore.delete_secret(SYNC_ACCESS_TOKEN_KEY);
    let refresh_result = KeyringSecretStore.delete_secret(SYNC_REFRESH_TOKEN_KEY);

    // Report errors but don't fail if keys didn't exist
    let mut errors = Vec::new();
    if let Err(e) = access_result {
        error!("Failed to delete access token from keyring: {}", e);
        errors.push(format!("access_token: {}", e));
    }
    if let Err(e) = refresh_result {
        error!("Failed to delete refresh token from keyring: {}", e);
        errors.push(format!("refresh_token: {}", e));
    }

    state.connect_service().clear_cached_token().await;
    clear_min_snapshot_created_at_from_store();

    if errors.is_empty() {
        info!("Sync session cleared from keyring");
        Ok(())
    } else {
        Err(format!(
            "Failed to clear some tokens: {}",
            errors.join(", ")
        ))
    }
}
