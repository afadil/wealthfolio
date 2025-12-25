//! Commands for device sync and E2EE pairing.
//!
//! This module provides Tauri commands that wrap the shared device sync client,
//! handling token/device ID storage via the keyring.

use log::{debug, info};
use std::sync::Arc;
use tauri::State;

use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use wealthfolio_core::secrets::SecretStore;
use wealthfolio_device_sync::{
    ClaimPairingRequest, ClaimPairingResponse, CreatePairingRequest, CreatePairingResponse,
    Device, DeviceInfo, DeviceRegistrationResponse, DeviceSyncClient, EnableE2eeResponse,
    GetSessionResponse, MarkTrustedRequest, PollMessagesResponse, SendMessageRequest, SyncStatus,
};

// Storage keys (without prefix - the SecretStore adds "wealthfolio_" prefix)
const CLOUD_ACCESS_TOKEN_KEY: &str = "sync_access_token";
const DEVICE_ID_KEY: &str = "sync_device_id";

/// Default base URL for Wealthfolio Connect cloud service.
const DEFAULT_CLOUD_API_URL: &str = "https://api.wealthfolio.app";

fn cloud_api_base_url() -> String {
    std::env::var("CONNECT_API_URL")
        .ok()
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CLOUD_API_URL.to_string())
}

/// Get the access token from keyring.
fn get_access_token() -> Result<String, String> {
    KeyringSecretStore
        .get_secret(CLOUD_ACCESS_TOKEN_KEY)
        .map_err(|e| format!("Failed to get access token: {}", e))?
        .ok_or_else(|| "No access token configured. Please sign in first.".to_string())
}

/// Get the device ID from keyring.
fn get_device_id_from_store() -> Option<String> {
    match KeyringSecretStore.get_secret(DEVICE_ID_KEY) {
        Ok(Some(id)) => {
            debug!("[DeviceSync] Using device ID from keyring: {}", id);
            Some(id)
        }
        Ok(None) => {
            debug!("[DeviceSync] No device ID in keyring");
            None
        }
        Err(e) => {
            log::warn!("[DeviceSync] Failed to read device ID from keyring: {}", e);
            None
        }
    }
}

/// Create a device sync client with the stored credentials.
fn create_client() -> DeviceSyncClient {
    DeviceSyncClient::new(&cloud_api_base_url())
}

// ─────────────────────────────────────────────────────────────────────────────
// Device ID Management
// ─────────────────────────────────────────────────────────────────────────────

/// Get the stored device ID.
#[tauri::command]
pub async fn get_device_id(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<String>, String> {
    KeyringSecretStore
        .get_secret(DEVICE_ID_KEY)
        .map_err(|e| format!("Failed to get device ID: {}", e))
}

/// Store the device ID.
#[tauri::command]
pub async fn set_device_id(
    device_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    KeyringSecretStore
        .set_secret(DEVICE_ID_KEY, &device_id)
        .map_err(|e| format!("Failed to store device ID: {}", e))
}

/// Clear the device ID.
#[tauri::command]
pub async fn clear_device_id(_state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    KeyringSecretStore
        .delete_secret(DEVICE_ID_KEY)
        .map_err(|e| format!("Failed to delete device ID: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Management
// ─────────────────────────────────────────────────────────────────────────────

/// Register a new device with the cloud API.
#[tauri::command]
pub async fn register_device(
    device_info: DeviceInfo,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<DeviceRegistrationResponse, String> {
    info!("[DeviceSync] Registering device: {:?}", device_info);

    let token = get_access_token()?;
    let device_id = get_device_id_from_store();
    let client = create_client();

    let result = client
        .register_device(&token, device_id.as_deref(), device_info)
        .await
        .map_err(|e| e.to_string())?;

    // Store the device ID in keyring
    info!(
        "[DeviceSync] Storing device ID in keyring: {}",
        result.device_id
    );
    KeyringSecretStore
        .set_secret(DEVICE_ID_KEY, &result.device_id)
        .map_err(|e| format!("Failed to store device ID: {}", e))?;

    // Verify storage was successful
    let stored_id = KeyringSecretStore
        .get_secret(DEVICE_ID_KEY)
        .map_err(|e| format!("Failed to verify device ID storage: {}", e))?;

    if stored_id.as_deref() != Some(&result.device_id) {
        log::error!(
            "[DeviceSync] Device ID storage verification failed! Expected: {}, Got: {:?}",
            result.device_id,
            stored_id
        );
        return Err("Device ID storage verification failed".to_string());
    }

    info!(
        "[DeviceSync] Device registered and stored successfully: {}",
        result.device_id
    );
    Ok(result)
}

/// Get current device info.
#[tauri::command]
pub async fn get_current_device(_state: State<'_, Arc<ServiceContext>>) -> Result<Device, String> {
    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .get_current_device(&token, &device_id)
        .await
        .map_err(|e| e.to_string())
}

/// List all devices.
#[tauri::command]
pub async fn list_devices(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Device>, String> {
    info!("[DeviceSync] Listing devices...");

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    let devices = create_client()
        .list_devices(&token, &device_id)
        .await
        .map_err(|e| e.to_string())?;

    info!("[DeviceSync] Found {} devices", devices.len());
    Ok(devices)
}

/// Rename a device.
#[tauri::command]
pub async fn rename_device(
    device_id: String,
    name: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    info!("Renaming device {} to: {}", device_id, name);

    let token = get_access_token()?;
    let my_device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .rename_device(&token, &my_device_id, &device_id, &name)
        .await
        .map_err(|e| e.to_string())
}

/// Revoke a device.
#[tauri::command]
pub async fn revoke_device(
    device_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    info!("Revoking device: {}", device_id);

    let token = get_access_token()?;
    let my_device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .revoke_device(&token, &my_device_id, &device_id)
        .await
        .map_err(|e| e.to_string())
}

/// Mark a device as trusted.
#[tauri::command]
pub async fn mark_device_trusted(
    device_id: String,
    key_version: i32,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    info!(
        "Marking device {} as trusted (key version {})",
        device_id, key_version
    );

    let token = get_access_token()?;
    let my_device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .mark_trusted(
            &token,
            &my_device_id,
            MarkTrustedRequest {
                device_id,
                key_version,
            },
        )
        .await
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Status & E2EE
// ─────────────────────────────────────────────────────────────────────────────

/// Get sync status.
#[tauri::command]
pub async fn get_sync_status(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<SyncStatus, String> {
    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .get_sync_status(&token, &device_id)
        .await
        .map_err(|e| e.to_string())
}

/// Enable E2EE.
#[tauri::command]
pub async fn enable_e2ee(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<EnableE2eeResponse, String> {
    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .enable_e2ee(&token, &device_id)
        .await
        .map_err(|e| e.to_string())
}

/// Reset sync (owner only).
#[tauri::command]
pub async fn reset_sync(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<EnableE2eeResponse, String> {
    info!("[DeviceSync] Resetting sync...");

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .reset_sync(&token, &device_id)
        .await
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Pairing
// ─────────────────────────────────────────────────────────────────────────────

/// Create a pairing session.
#[tauri::command]
pub async fn create_pairing(
    code_hash: String,
    ephemeral_public_key: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<CreatePairingResponse, String> {
    debug!("Creating pairing session...");

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .create_pairing(
            &token,
            &device_id,
            CreatePairingRequest {
                code_hash,
                ephemeral_public_key,
            },
        )
        .await
        .map_err(|e| e.to_string())
}

/// Claim a pairing session.
#[tauri::command]
pub async fn claim_pairing(
    code: String,
    ephemeral_public_key: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<ClaimPairingResponse, String> {
    debug!("Claiming pairing session...");

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .claim_pairing(
            &token,
            &device_id,
            ClaimPairingRequest {
                code,
                ephemeral_public_key,
            },
        )
        .await
        .map_err(|e| e.to_string())
}

/// Approve a pairing session.
#[tauri::command]
pub async fn approve_pairing(
    session_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Approving pairing session: {}", session_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .approve_pairing(&token, &device_id, &session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Cancel a pairing session.
#[tauri::command]
pub async fn cancel_pairing(
    session_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Canceling pairing session: {}", session_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .cancel_pairing(&token, &device_id, &session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get pairing session status (issuer only).
#[tauri::command]
pub async fn get_pairing_session(
    session_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<GetSessionResponse, String> {
    debug!("Getting pairing session: {}", session_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .get_session(&token, &device_id, &session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Poll for pairing messages.
#[tauri::command]
pub async fn poll_pairing_messages(
    session_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<PollMessagesResponse, String> {
    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .poll_messages(&token, &device_id, &session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Send a pairing message.
#[tauri::command]
pub async fn send_pairing_message(
    session_id: String,
    to_device_id: String,
    payload_type: String,
    payload: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Sending pairing message to: {}", to_device_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .send_message(
            &token,
            &device_id,
            SendMessageRequest {
                session_id,
                to_device_id,
                payload_type,
                payload,
            },
        )
        .await
        .map_err(|e| e.to_string())
}
