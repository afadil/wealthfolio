//! Commands for device sync and E2EE pairing.
//!
//! This module provides Tauri commands that wrap the shared device sync client,
//! handling token/device ID storage via the keyring.

use log::{debug, info};
use std::process::Command;
use std::sync::Arc;
use tauri::State;

use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use wealthfolio_core::secrets::SecretStore;
use wealthfolio_device_sync::{
    ClaimPairingRequest, ClaimPairingResponse, CommitInitializeKeysRequest,
    CommitInitializeKeysResponse, CommitRotateKeysRequest, CommitRotateKeysResponse,
    CompletePairingRequest, ConfirmPairingRequest, ConfirmPairingResponse, CreatePairingRequest,
    CreatePairingResponse, Device, DevicePlatform, DeviceSyncClient, EnrollDeviceResponse,
    GetPairingResponse, InitializeKeysResult, PairingMessagesResponse, RegisterDeviceRequest,
    ResetTeamSyncResponse, RotateKeysResponse, SuccessResponse, UpdateDeviceRequest,
};

// Storage keys (without prefix - the SecretStore adds "wealthfolio_" prefix)
const CLOUD_ACCESS_TOKEN_KEY: &str = "sync_access_token";

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

/// Sync identity stored in keychain as JSON (only device_id is needed here)
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncIdentity {
    device_id: String,
}

/// Get the device ID from sync_identity in keyring.
fn get_device_id_from_store() -> Option<String> {
    const SYNC_IDENTITY_KEY: &str = "sync_identity";

    match KeyringSecretStore.get_secret(SYNC_IDENTITY_KEY) {
        Ok(Some(json)) => match serde_json::from_str::<SyncIdentity>(&json) {
            Ok(identity) => {
                debug!(
                    "[DeviceSync] Using device ID from sync_identity: {}",
                    identity.device_id
                );
                Some(identity.device_id)
            }
            Err(e) => {
                log::warn!("[DeviceSync] Failed to parse sync_identity: {}", e);
                None
            }
        },
        Ok(None) => {
            debug!("[DeviceSync] No sync_identity in keyring");
            None
        }
        Err(e) => {
            log::warn!(
                "[DeviceSync] Failed to read sync_identity from keyring: {}",
                e
            );
            None
        }
    }
}

/// Create a device sync client with the stored credentials.
fn create_client() -> DeviceSyncClient {
    DeviceSyncClient::new(&cloud_api_base_url())
}

/// Get the OS version string.
fn get_os_version() -> Option<String> {
    let version = get_os_version_impl();
    if version.is_none() {
        debug!("[DeviceSync] Could not detect OS version");
    }
    version
}

#[cfg(target_os = "macos")]
fn get_os_version_impl() -> Option<String> {
    // sw_vers -productVersion returns e.g., "15.2"
    Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok()
            } else {
                None
            }
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(target_os = "windows")]
fn get_os_version_impl() -> Option<String> {
    // Use PowerShell to get OS version reliably (works across locales)
    Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "[System.Environment]::OSVersion.Version.ToString()",
        ])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok()
            } else {
                None
            }
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(target_os = "linux")]
fn get_os_version_impl() -> Option<String> {
    // Try /etc/os-release first (standard on modern distros)
    std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|content| {
            // Try VERSION_ID first (e.g., "22.04"), then VERSION (e.g., "22.04 LTS")
            content
                .lines()
                .find(|l| l.starts_with("VERSION_ID="))
                .map(|l| {
                    l.trim_start_matches("VERSION_ID=")
                        .trim_matches('"')
                        .to_string()
                })
        })
        .or_else(|| {
            // Fallback: try /etc/lsb-release
            std::fs::read_to_string("/etc/lsb-release")
                .ok()
                .and_then(|content| {
                    content
                        .lines()
                        .find(|l| l.starts_with("DISTRIB_RELEASE="))
                        .map(|l| {
                            l.trim_start_matches("DISTRIB_RELEASE=")
                                .trim_matches('"')
                                .to_string()
                        })
                })
        })
        .or_else(|| {
            // Last resort: kernel version via uname
            Command::new("uname")
                .arg("-r")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
        })
        .filter(|s| !s.is_empty())
}

#[cfg(target_os = "ios")]
fn get_os_version_impl() -> Option<String> {
    // For iOS, we rely on Tauri's device info plugin or Swift interop
    // This is a placeholder - actual implementation would use UIDevice.current.systemVersion
    None
}

#[cfg(target_os = "android")]
fn get_os_version_impl() -> Option<String> {
    // For Android, we rely on Tauri's device info plugin or JNI
    // This is a placeholder - actual implementation would use Build.VERSION.RELEASE
    None
}

#[cfg(not(any(
    target_os = "macos",
    target_os = "windows",
    target_os = "linux",
    target_os = "ios",
    target_os = "android"
)))]
fn get_os_version_impl() -> Option<String> {
    None
}

/// Get the app version from Cargo.toml
fn get_app_version() -> Option<String> {
    Some(env!("CARGO_PKG_VERSION").to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Management
// ─────────────────────────────────────────────────────────────────────────────

/// Enroll a device with the cloud API.
///
/// Returns the next step for the device:
/// - BOOTSTRAP: First device for this team - generate RK locally
/// - PAIR: E2EE already enabled - device must pair with existing trusted device
/// - READY: Device is already trusted and ready to sync
#[tauri::command(rename_all = "camelCase")]
pub async fn register_device(
    display_name: String,
    instance_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<EnrollDeviceResponse, String> {
    info!("[DeviceSync] Enrolling device: {}", display_name);

    let token = get_access_token()?;
    let client = create_client();

    // Auto-detect platform, OS version, and app version
    let platform = DevicePlatform::detect().to_string();
    let os_version = get_os_version();
    let app_version = get_app_version();

    info!(
        "[DeviceSync] Platform: {}, OS version: {:?}, App version: {:?}",
        platform, os_version, app_version
    );

    let request = RegisterDeviceRequest {
        instance_id,
        display_name,
        platform,
        os_version,
        app_version,
    };

    debug!("[DeviceSync] Request: {:?}", request);

    let result = client
        .enroll_device(&token, request)
        .await
        .map_err(|e| e.to_string())?;

    // Log the result - device ID storage is handled by TypeScript via sync_identity
    let device_id = match &result {
        EnrollDeviceResponse::Bootstrap { device_id, .. } => device_id,
        EnrollDeviceResponse::Pair { device_id, .. } => device_id,
        EnrollDeviceResponse::Ready { device_id, .. } => device_id,
    };

    info!(
        "[DeviceSync] Device enrolled: {} (mode: {:?})",
        device_id,
        match &result {
            EnrollDeviceResponse::Bootstrap { .. } => "BOOTSTRAP",
            EnrollDeviceResponse::Pair { .. } => "PAIR",
            EnrollDeviceResponse::Ready { .. } => "READY",
        }
    );
    Ok(result)
}

/// Get device info by ID.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_device(
    device_id: Option<String>,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Device, String> {
    let token = get_access_token()?;
    let device_id = device_id
        .or_else(get_device_id_from_store)
        .ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .get_device(&token, &device_id)
        .await
        .map_err(|e| e.to_string())
}

/// List all devices.
#[tauri::command]
pub async fn list_devices(
    scope: Option<String>,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Device>, String> {
    info!("[DeviceSync] Listing devices (scope: {:?})...", scope);

    let token = get_access_token()?;

    let devices = create_client()
        .list_devices(&token, scope.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    info!("[DeviceSync] Found {} devices", devices.len());
    Ok(devices)
}

/// Update a device (e.g., rename).
#[tauri::command(rename_all = "camelCase")]
pub async fn update_device(
    device_id: String,
    display_name: Option<String>,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<SuccessResponse, String> {
    info!("Updating device {}: name={:?}", device_id, display_name);

    let token = get_access_token()?;

    create_client()
        .update_device(
            &token,
            &device_id,
            UpdateDeviceRequest {
                display_name,
                metadata: None,
            },
        )
        .await
        .map_err(|e| e.to_string())
}

/// Delete a device.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_device(
    device_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<SuccessResponse, String> {
    info!("Deleting device: {}", device_id);

    let token = get_access_token()?;

    create_client()
        .delete_device(&token, &device_id)
        .await
        .map_err(|e| e.to_string())
}

/// Revoke a device's trust.
#[tauri::command(rename_all = "camelCase")]
pub async fn revoke_device(
    device_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<SuccessResponse, String> {
    info!("Revoking device: {}", device_id);

    let token = get_access_token()?;

    create_client()
        .revoke_device(&token, &device_id)
        .await
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Keys (E2EE)
// ─────────────────────────────────────────────────────────────────────────────

/// Initialize team keys (Phase 1).
///
/// Returns next step for key initialization:
/// - BOOTSTRAP: Ready to initialize - challenge/nonce returned for key generation
/// - PAIRING_REQUIRED: Already initialized - device must pair with trusted device
/// - READY: Device already trusted at current key version
#[tauri::command]
pub async fn initialize_team_keys(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<InitializeKeysResult, String> {
    info!("[DeviceSync] Initializing team keys...");

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    let result = create_client()
        .initialize_team_keys(&token, &device_id)
        .await
        .map_err(|e| e.to_string())?;

    info!(
        "[DeviceSync] Initialize team keys result: {:?}",
        match &result {
            InitializeKeysResult::Bootstrap { .. } => "BOOTSTRAP",
            InitializeKeysResult::PairingRequired { .. } => "PAIRING_REQUIRED",
            InitializeKeysResult::Ready { .. } => "READY",
        }
    );

    Ok(result)
}

/// Commit team key initialization (Phase 2).
#[tauri::command(rename_all = "camelCase")]
pub async fn commit_initialize_team_keys(
    key_version: i32,
    device_key_envelope: String,
    signature: String,
    challenge_response: Option<String>,
    recovery_envelope: Option<String>,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<CommitInitializeKeysResponse, String> {
    info!("[DeviceSync] Committing team key initialization...");

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    let request = CommitInitializeKeysRequest {
        device_id: device_id.clone(),
        key_version,
        device_key_envelope,
        signature,
        challenge_response,
        recovery_envelope,
    };

    create_client()
        .commit_initialize_team_keys(&token, request)
        .await
        .map_err(|e| e.to_string())
}

/// Start key rotation (Phase 1).
#[tauri::command]
pub async fn rotate_team_keys(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<RotateKeysResponse, String> {
    info!("[DeviceSync] Starting key rotation...");

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .rotate_team_keys(&token, &device_id)
        .await
        .map_err(|e| e.to_string())
}

/// Commit key rotation (Phase 2).
#[tauri::command]
pub async fn commit_rotate_team_keys(
    request: CommitRotateKeysRequest,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<CommitRotateKeysResponse, String> {
    info!("[DeviceSync] Committing key rotation...");

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .commit_rotate_team_keys(&token, &device_id, request)
        .await
        .map_err(|e| e.to_string())
}

/// Reset team sync (destructive, owner only).
/// Revokes all devices and increments key version.
#[tauri::command]
pub async fn reset_team_sync(
    reason: Option<String>,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<ResetTeamSyncResponse, String> {
    info!("[DeviceSync] Resetting team sync...");

    let token = get_access_token()?;

    create_client()
        .reset_team_sync(&token, reason.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Pairing
// ─────────────────────────────────────────────────────────────────────────────

/// Create a pairing session (trusted device side).
#[tauri::command(rename_all = "camelCase")]
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

/// Get pairing session details.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_pairing(
    pairing_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<GetPairingResponse, String> {
    debug!("Getting pairing session: {}", pairing_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .get_pairing(&token, &device_id, &pairing_id)
        .await
        .map_err(|e| e.to_string())
}

/// Approve a pairing session.
#[tauri::command(rename_all = "camelCase")]
pub async fn approve_pairing(
    pairing_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<SuccessResponse, String> {
    debug!("Approving pairing session: {}", pairing_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .approve_pairing(&token, &device_id, &pairing_id)
        .await
        .map_err(|e| e.to_string())
}

/// Complete a pairing session with key bundle.
#[tauri::command(rename_all = "camelCase")]
pub async fn complete_pairing(
    pairing_id: String,
    encrypted_key_bundle: String,
    sas_proof: serde_json::Value,
    signature: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<SuccessResponse, String> {
    debug!("Completing pairing session: {}", pairing_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .complete_pairing(
            &token,
            &device_id,
            &pairing_id,
            CompletePairingRequest {
                encrypted_key_bundle,
                sas_proof,
                signature,
            },
        )
        .await
        .map_err(|e| e.to_string())
}

/// Cancel a pairing session.
#[tauri::command(rename_all = "camelCase")]
pub async fn cancel_pairing(
    pairing_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<SuccessResponse, String> {
    debug!("Canceling pairing session: {}", pairing_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .cancel_pairing(&token, &device_id, &pairing_id)
        .await
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Claimer-Side Pairing (New Device)
// ─────────────────────────────────────────────────────────────────────────────

/// Claim a pairing session using the code from the issuer device.
///
/// This is called by the claimer (new device) to join a pairing session.
/// Returns the issuer's ephemeral public key for deriving the shared secret.
#[tauri::command(rename_all = "camelCase")]
pub async fn claim_pairing(
    code: String,
    ephemeral_public_key: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<ClaimPairingResponse, String> {
    info!("[DeviceSync] Claiming pairing session...");

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

/// Poll for messages/key bundle from the issuer (claimer side).
///
/// The claimer polls this endpoint to receive the encrypted RK bundle
/// from the issuer after they complete the pairing.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_pairing_messages(
    pairing_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<PairingMessagesResponse, String> {
    debug!("[DeviceSync] Polling for pairing messages: {}", pairing_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .get_pairing_messages(&token, &device_id, &pairing_id)
        .await
        .map_err(|e| e.to_string())
}

/// Confirm pairing and become trusted (claimer side).
///
/// This is the final step in the pairing flow. After successfully
/// decrypting the RK bundle, the claimer calls this to confirm and
/// be marked as trusted.
#[tauri::command(rename_all = "camelCase")]
pub async fn confirm_pairing(
    pairing_id: String,
    proof: Option<String>,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<ConfirmPairingResponse, String> {
    info!("[DeviceSync] Confirming pairing: {}", pairing_id);

    let token = get_access_token()?;
    let device_id =
        get_device_id_from_store().ok_or_else(|| "No device ID configured".to_string())?;

    create_client()
        .confirm_pairing(
            &token,
            &device_id,
            &pairing_id,
            ConfirmPairingRequest { proof },
        )
        .await
        .map_err(|e| e.to_string())
}
