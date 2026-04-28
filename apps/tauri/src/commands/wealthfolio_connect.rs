use crate::commands::device_sync::clear_min_snapshot_created_at_from_store;
use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use log::{debug, error};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::secrets::SecretStore;

// Storage keys (without prefix - the SecretStore adds "wealthfolio_" prefix)
const SYNC_ACCESS_TOKEN_KEY: &str = "sync_access_token";
const SYNC_REFRESH_TOKEN_KEY: &str = "sync_refresh_token";

#[tauri::command]
pub async fn store_sync_session(
    refresh_token: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    match refresh_token.as_deref().map(str::trim) {
        Some(token) if !token.is_empty() => {
            if let Err(e) = KeyringSecretStore.set_secret(SYNC_REFRESH_TOKEN_KEY, token) {
                error!("Failed to store refresh token in keyring: {}", e);
                return Err(format!("Failed to store refresh token: {}", e));
            }
            // Best-effort cleanup for legacy versions that stored access tokens at rest.
            let _ = KeyringSecretStore.delete_secret(SYNC_ACCESS_TOKEN_KEY);
            debug!("Refresh token stored successfully");
        }
        _ => {
            if let Err(e) = KeyringSecretStore.delete_secret(SYNC_REFRESH_TOKEN_KEY) {
                error!("Failed to delete refresh token from keyring: {}", e);
                // Don't fail the whole operation if we can't delete
            }
        }
    }

    state.connect_service().clear_cached_token().await;
    Ok(())
}

#[tauri::command]
pub async fn clear_sync_session(state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    // Best-effort cleanup for legacy installs that persisted the access token.
    let _ = KeyringSecretStore.delete_secret(SYNC_ACCESS_TOKEN_KEY);
    let refresh_result = KeyringSecretStore.delete_secret(SYNC_REFRESH_TOKEN_KEY);

    // Report refresh-token errors but don't fail on legacy access-token cleanup.
    let mut errors = Vec::new();
    if let Err(e) = refresh_result {
        error!("Failed to delete refresh token from keyring: {}", e);
        errors.push(format!("refresh_token: {}", e));
    }

    state.connect_service().clear_cached_token().await;
    clear_min_snapshot_created_at_from_store();
    let _ = state
        .app_sync_repository()
        .clear_all_min_snapshot_created_at()
        .await;

    if errors.is_empty() {
        debug!("Sync session cleared from keyring");
        Ok(())
    } else {
        Err(format!(
            "Failed to clear some tokens: {}",
            errors.join(", ")
        ))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSyncSessionResponse {
    pub access_token: String,
    pub refresh_token: String,
}

#[tauri::command]
pub async fn restore_sync_session(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<RestoreSyncSessionResponse, String> {
    let access_token = state.connect_service().get_valid_access_token().await?;

    let refresh_token = KeyringSecretStore
        .get_secret(SYNC_REFRESH_TOKEN_KEY)
        .map_err(|e| format!("Failed to read refresh token: {}", e))?
        .ok_or_else(|| "No sync session configured".to_string())?;

    Ok(RestoreSyncSessionResponse {
        access_token,
        refresh_token,
    })
}
