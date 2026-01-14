//! Device Enroll Service
//!
//! High-level service that orchestrates device enrollment and E2EE setup.
//! Owns all keyring operations and E2EE logic, exposing simple methods
//! for the Tauri commands to call.

use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::secret_store::KeyringSecretStore;
use wealthfolio_core::secrets::SecretStore;
use wealthfolio_connect::DEFAULT_CLOUD_API_URL;
use wealthfolio_device_sync::{
    CommitInitializeKeysRequest, DevicePlatform, DeviceSyncClient, EnrollDeviceResponse,
    InitializeKeysResult, RegisterDeviceRequest, TrustState,
};

use super::sync_crypto;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_IDENTITY_KEY: &str = "sync_identity";
const CLOUD_ACCESS_TOKEN_KEY: &str = "sync_access_token";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/// Sync identity stored in keychain
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncIdentity {
    /// Storage format version (defaults to 0 for old data without version field)
    #[serde(default)]
    pub version: i32,
    pub device_nonce: Option<String>,
    pub device_id: Option<String>,
    pub root_key: Option<String>,
    pub key_version: Option<i32>,
    pub device_secret_key: Option<String>,
    pub device_public_key: Option<String>,
}

/// Current sync state
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncState {
    /// No device nonce - never enrolled
    Fresh,
    /// Enrolled but no E2EE keys (needs pairing or bootstrap)
    Registered,
    /// Fully operational with E2EE keys
    Ready,
    /// Local keys out of date
    Stale,
    /// Device was revoked or removed
    Recovery,
    /// Keys exist on server but no trusted devices to pair with
    Orphaned,
}

/// Result from get_sync_state
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStateResult {
    pub state: SyncState,
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    pub key_version: Option<i32>,
    pub server_key_version: Option<i32>,
    pub is_trusted: bool,
    pub trusted_devices: Vec<TrustedDeviceSummary>,
}

/// Summary of a trusted device for pairing UI
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustedDeviceSummary {
    pub id: String,
    pub name: String,
    pub platform: String,
}

/// Result from enable_sync
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnableSyncResult {
    pub device_id: String,
    pub state: SyncState,
    pub key_version: Option<i32>,
    pub server_key_version: Option<i32>,
    pub needs_pairing: bool,
    pub trusted_devices: Vec<TrustedDeviceSummary>,
}

/// Service error
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncServiceError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for SyncServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl From<String> for SyncServiceError {
    fn from(message: String) -> Self {
        Self {
            code: "SYNC_ERROR".to_string(),
            message,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Sync Service
// ─────────────────────────────────────────────────────────────────────────────

pub struct DeviceEnrollService;

impl DeviceEnrollService {
    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    /// Get the current sync state.
    /// Reads from keyring and optionally verifies with server.
    pub async fn get_sync_state() -> Result<SyncStateResult, SyncServiceError> {
        info!("[DeviceEnrollService] Getting sync state...");

        // Read identity from keyring
        let identity = Self::read_identity()?;

        // No identity or no nonce = FRESH
        if identity.device_nonce.is_none() {
            info!("[DeviceEnrollService] State: FRESH (no device nonce)");
            return Ok(SyncStateResult {
                state: SyncState::Fresh,
                device_id: None,
                device_name: None,
                key_version: None,
                server_key_version: None,
                is_trusted: false,
                trusted_devices: vec![],
            });
        }

        // Have nonce but no device ID = FRESH (enrollment incomplete)
        let device_id = match &identity.device_id {
            Some(id) => id.clone(),
            None => {
                info!("[DeviceEnrollService] State: FRESH (no device ID)");
                return Ok(SyncStateResult {
                    state: SyncState::Fresh,
                    device_id: None,
                    device_name: None,
                    key_version: None,
                    server_key_version: None,
                    is_trusted: false,
                    trusted_devices: vec![],
                });
            }
        };

        // Verify device on server
        let token = Self::get_access_token()?;
        let client = Self::create_client();

        let device = match client.get_device(&token, &device_id).await {
            Ok(d) => d,
            Err(e) => {
                // Device not found = RECOVERY
                let err_str = e.to_string();
                if err_str.contains("404") || err_str.contains("not found") {
                    warn!("[DeviceEnrollService] State: RECOVERY (device not found)");
                    return Ok(SyncStateResult {
                        state: SyncState::Recovery,
                        device_id: Some(device_id),
                        device_name: None,
                        key_version: identity.key_version,
                        server_key_version: None,
                        is_trusted: false,
                        trusted_devices: vec![],
                    });
                }
                return Err(format!("Failed to get device: {}", e).into());
            }
        };

        // Check if device was revoked
        if device.trust_state == TrustState::Revoked {
            warn!("[DeviceEnrollService] State: RECOVERY (device revoked)");
            return Ok(SyncStateResult {
                state: SyncState::Recovery,
                device_id: Some(device_id),
                device_name: Some(device.display_name),
                key_version: identity.key_version,
                server_key_version: device.trusted_key_version.map(|v| v as i32),
                is_trusted: false,
                trusted_devices: vec![],
            });
        }

        let server_key_version = device.trusted_key_version.map(|v| v as i32);
        let is_trusted = device.trust_state == TrustState::Trusted;

        // Check E2EE credentials
        let has_root_key = identity.root_key.is_some();
        let has_key_version = identity.key_version.is_some();

        if !has_root_key || !has_key_version {
            // REGISTERED: No local E2EE credentials
            let trusted_devices = if !is_trusted {
                Self::get_trusted_devices(&client, &token).await
            } else {
                vec![]
            };

            info!("[DeviceEnrollService] State: REGISTERED (no E2EE keys)");
            return Ok(SyncStateResult {
                state: SyncState::Registered,
                device_id: Some(device_id),
                device_name: Some(device.display_name),
                key_version: None,
                server_key_version,
                is_trusted,
                trusted_devices,
            });
        }

        // Check key version match
        if let (Some(local_version), Some(server_version)) = (identity.key_version, server_key_version) {
            if local_version != server_version {
                warn!("[DeviceEnrollService] State: STALE (version mismatch: local={}, server={})",
                      local_version, server_version);
                let trusted_devices = Self::get_trusted_devices(&client, &token).await;
                return Ok(SyncStateResult {
                    state: SyncState::Stale,
                    device_id: Some(device_id),
                    device_name: Some(device.display_name),
                    key_version: identity.key_version,
                    server_key_version,
                    is_trusted,
                    trusted_devices,
                });
            }
        }

        // All checks passed = READY
        info!("[DeviceEnrollService] State: READY");
        Ok(SyncStateResult {
            state: SyncState::Ready,
            device_id: Some(device_id),
            device_name: Some(device.display_name),
            key_version: identity.key_version,
            server_key_version,
            is_trusted,
            trusted_devices: vec![],
        })
    }

    /// Enable device sync - full flow from FRESH to READY (if bootstrap) or REGISTERED (if pairing needed).
    ///
    /// This does:
    /// 1. Generate device nonce
    /// 2. Enroll device with server
    /// 3. If BOOTSTRAP mode: initialize E2EE keys
    /// 4. Save all credentials to keyring
    pub async fn enable_sync() -> Result<EnableSyncResult, SyncServiceError> {
        info!("[DeviceEnrollService] Enabling sync...");

        // Generate device nonce
        let device_nonce = sync_crypto::generate_device_id();
        debug!("[DeviceEnrollService] Generated device nonce: {}", device_nonce);

        // Save nonce immediately (so we can recover if later steps fail)
        Self::save_identity(&SyncIdentity {
            version: 2,
            device_nonce: Some(device_nonce.clone()),
            ..Default::default()
        })?;

        // Get display name and platform info
        let display_name = Self::get_device_display_name();
        let platform = DevicePlatform::detect().to_string();
        let os_version = Self::get_os_version();
        let app_version = Self::get_app_version();

        info!("[DeviceEnrollService] Enrolling device: {} ({})", display_name, platform);

        // Enroll with server
        let token = Self::get_access_token()?;
        let client = Self::create_client();

        let enroll_result = client
            .enroll_device(
                &token,
                RegisterDeviceRequest {
                    device_nonce: device_nonce.clone(),
                    display_name,
                    platform,
                    os_version,
                    app_version,
                },
            )
            .await
            .map_err(|e| format!("Enrollment failed: {}", e))?;

        // Extract device ID, mode, and server key version
        let (device_id, mode, server_key_version, trusted_devices) = match &enroll_result {
            EnrollDeviceResponse::Bootstrap { device_id, e2ee_key_version } => {
                (device_id.clone(), "BOOTSTRAP", Some(*e2ee_key_version), vec![])
            }
            EnrollDeviceResponse::Pair { device_id, e2ee_key_version, trusted_devices, .. } => {
                let summaries: Vec<TrustedDeviceSummary> = trusted_devices
                    .iter()
                    .map(|d| TrustedDeviceSummary {
                        id: d.id.clone(),
                        name: d.name.clone(),
                        platform: d.platform.clone(),
                    })
                    .collect();
                (device_id.clone(), "PAIR", Some(*e2ee_key_version), summaries)
            }
            EnrollDeviceResponse::Ready { device_id, e2ee_key_version, .. } => {
                (device_id.clone(), "READY", Some(*e2ee_key_version), vec![])
            }
        };

        info!("[DeviceEnrollService] Device enrolled: {} (mode: {}, server_key_version: {:?})",
              device_id, mode, server_key_version);

        // Update identity with device ID
        Self::save_identity(&SyncIdentity {
            version: 2,
            device_nonce: Some(device_nonce),
            device_id: Some(device_id.clone()),
            ..Default::default()
        })?;

        // If BOOTSTRAP mode, initialize E2EE keys
        if mode == "BOOTSTRAP" {
            info!("[DeviceEnrollService] Bootstrap mode - initializing E2EE keys...");
            let key_version = Self::initialize_e2ee_keys(&client, &token, &device_id).await?;

            return Ok(EnableSyncResult {
                device_id,
                state: SyncState::Ready,
                key_version: Some(key_version),
                server_key_version: Some(key_version),
                needs_pairing: false,
                trusted_devices: vec![],
            });
        }

        // PAIR mode - but no trusted devices to pair with
        if trusted_devices.is_empty() {
            let has_keys = server_key_version.map(|v| v > 0).unwrap_or(false);

            if has_keys {
                // Keys exist but no trusted devices - orphaned state
                warn!(
                    "[DeviceEnrollService] Orphaned state: keys exist (v{}) but no trusted devices",
                    server_key_version.unwrap()
                );
                return Ok(EnableSyncResult {
                    device_id,
                    state: SyncState::Orphaned,
                    key_version: None,
                    server_key_version,
                    needs_pairing: false,
                    trusted_devices: vec![],
                });
            } else {
                // No keys and no trusted devices - bootstrap as first device
                info!("[DeviceEnrollService] PAIR mode but no keys/devices - bootstrapping...");
                let key_version = Self::initialize_e2ee_keys(&client, &token, &device_id).await?;

                return Ok(EnableSyncResult {
                    device_id,
                    state: SyncState::Ready,
                    key_version: Some(key_version),
                    server_key_version: Some(key_version),
                    needs_pairing: false,
                    trusted_devices: vec![],
                });
            }
        }

        // Normal PAIR mode - return REGISTERED state
        Ok(EnableSyncResult {
            device_id,
            state: SyncState::Registered,
            key_version: None,
            server_key_version,
            needs_pairing: true,
            trusted_devices,
        })
    }

    /// Clear all sync data and return to FRESH state.
    pub fn clear_sync_data() -> Result<(), SyncServiceError> {
        info!("[DeviceEnrollService] Clearing sync data...");
        KeyringSecretStore
            .delete_secret(SYNC_IDENTITY_KEY)
            .map_err(|e| format!("Failed to clear sync data: {}", e))?;
        Ok(())
    }

    /// Reinitialize sync - reset server data and enable sync in one operation.
    /// Used when sync is in orphaned state (keys exist but no devices).
    pub async fn reinitialize_sync() -> Result<EnableSyncResult, SyncServiceError> {
        info!("[DeviceEnrollService] Reinitializing sync...");

        let token = Self::get_access_token()?;
        let client = Self::create_client();

        // Step 1: Reset team sync on server (deletes orphaned keys)
        info!("[DeviceEnrollService] Resetting team sync on server...");
        client
            .reset_team_sync(&token, Some("reinitialize"))
            .await
            .map_err(|e| format!("Failed to reset team sync: {}", e))?;

        // Step 2: Clear local keyring
        info!("[DeviceEnrollService] Clearing local sync data...");
        Self::clear_sync_data()?;

        // Step 3: Enable sync (will now be in bootstrap mode)
        info!("[DeviceEnrollService] Enabling sync...");
        Self::enable_sync().await
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL: E2EE KEY INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    async fn initialize_e2ee_keys(
        client: &DeviceSyncClient,
        token: &str,
        device_id: &str,
    ) -> Result<i32, SyncServiceError> {
        // Phase 1: Get challenge from server
        let init_result = client
            .initialize_team_keys(token, device_id)
            .await
            .map_err(|e| format!("Failed to initialize keys: {}", e))?;

        let (challenge, nonce, key_version) = match init_result {
            InitializeKeysResult::Bootstrap { challenge, nonce, key_version } => {
                (challenge, nonce, key_version)
            }
            InitializeKeysResult::PairingRequired { .. } => {
                return Err("Pairing required but expected bootstrap mode".to_string().into());
            }
            InitializeKeysResult::Ready { e2ee_key_version } => {
                // Already initialized - this shouldn't happen in bootstrap mode
                return Ok(e2ee_key_version);
            }
        };

        debug!("[DeviceEnrollService] Got challenge, generating keys...");

        // Generate root key
        let root_key = sync_crypto::generate_root_key();

        // Generate device keypair for E2EE
        let device_keypair = sync_crypto::generate_ephemeral_keypair();

        // Create device key envelope (encrypted root key for this device)
        let envelope_key = sync_crypto::derive_session_key(&root_key, "envelope")
            .map_err(|e| format!("Failed to derive envelope key: {}", e))?;
        let device_key_envelope = sync_crypto::encrypt(&envelope_key, &root_key)
            .map_err(|e| format!("Failed to create device key envelope: {}", e))?;

        // Create signature (raw hash, no normalization)
        let signature_data = format!("{}:{}:{}", challenge, key_version, device_key_envelope);
        let signature = sync_crypto::hash_sha256(&signature_data);

        // Create challenge response (raw hash, no normalization)
        let challenge_response_data = format!("{}:{}", challenge, nonce);
        let challenge_response = sync_crypto::hash_sha256(&challenge_response_data);

        debug!("[DeviceEnrollService] Committing keys...");

        // Phase 2: Commit the keys
        let commit_result = client
            .commit_initialize_team_keys(
                token,
                CommitInitializeKeysRequest {
                    device_id: device_id.to_string(),
                    key_version,
                    device_key_envelope,
                    signature,
                    challenge_response: Some(challenge_response),
                    recovery_envelope: None,
                },
            )
            .await
            .map_err(|e| format!("Failed to commit keys: {}", e))?;

        if !commit_result.success {
            return Err("Server rejected key commitment".to_string().into());
        }

        // Save E2EE credentials to keyring
        let mut identity = Self::read_identity()?;
        identity.root_key = Some(root_key);
        identity.key_version = Some(key_version);
        identity.device_secret_key = Some(device_keypair.secret_key);
        identity.device_public_key = Some(device_keypair.public_key);
        Self::save_identity(&identity)?;

        info!("[DeviceEnrollService] E2EE keys initialized (version: {})", key_version);
        Ok(key_version)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL: KEYRING OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    fn read_identity() -> Result<SyncIdentity, SyncServiceError> {
        match KeyringSecretStore.get_secret(SYNC_IDENTITY_KEY) {
            Ok(Some(json)) => {
                debug!("[DeviceEnrollService] Read identity from keyring");
                serde_json::from_str(&json)
                    .map_err(|e| format!("Failed to parse identity: {}", e).into())
            }
            Ok(None) => {
                debug!("[DeviceEnrollService] No identity in keyring");
                Ok(SyncIdentity::default())
            }
            Err(e) => Err(format!("Failed to read identity: {}", e).into()),
        }
    }

    fn save_identity(identity: &SyncIdentity) -> Result<(), SyncServiceError> {
        let json = serde_json::to_string(identity)
            .map_err(|e| format!("Failed to serialize identity: {}", e))?;
        KeyringSecretStore
            .set_secret(SYNC_IDENTITY_KEY, &json)
            .map_err(|e| format!("Failed to save identity: {}", e).into())
    }

    fn get_access_token() -> Result<String, SyncServiceError> {
        KeyringSecretStore
            .get_secret(CLOUD_ACCESS_TOKEN_KEY)
            .map_err(|e| format!("Failed to get access token: {}", e))?
            .ok_or_else(|| "No access token. Please sign in first.".to_string().into())
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL: HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    fn create_client() -> DeviceSyncClient {
        let base_url = std::env::var("CONNECT_API_URL")
            .ok()
            .map(|v| v.trim().trim_end_matches('/').to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_CLOUD_API_URL.to_string());
        DeviceSyncClient::new(&base_url)
    }

    fn get_device_display_name() -> String {
        #[cfg(target_os = "macos")]
        return "My Mac".to_string();
        #[cfg(target_os = "windows")]
        return "My Windows PC".to_string();
        #[cfg(target_os = "linux")]
        return "My Linux".to_string();
        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        return "My Device".to_string();
    }

    fn get_os_version() -> Option<String> {
        #[cfg(target_os = "macos")]
        {
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
        #[cfg(not(target_os = "macos"))]
        None
    }

    fn get_app_version() -> Option<String> {
        Some(env!("CARGO_PKG_VERSION").to_string())
    }

    async fn get_trusted_devices(client: &DeviceSyncClient, token: &str) -> Vec<TrustedDeviceSummary> {
        match client.list_devices(token, Some("my")).await {
            Ok(devices) => devices
                .into_iter()
                .filter(|d| d.trust_state == TrustState::Trusted)
                .map(|d| TrustedDeviceSummary {
                    id: d.id,
                    name: d.display_name,
                    platform: d.platform,
                })
                .collect(),
            Err(_) => vec![],
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAURI COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

/// Get the current device sync state.
/// Returns the state machine status: FRESH, REGISTERED, READY, STALE, or RECOVERY.
#[tauri::command]
pub async fn get_device_sync_state() -> Result<SyncStateResult, String> {
    DeviceEnrollService::get_sync_state()
        .await
        .map_err(|e| e.message)
}

/// Enable device sync - enrolls the device and initializes E2EE if first device.
/// Call this when user clicks "Enable Sync" button.
#[tauri::command]
pub async fn enable_device_sync() -> Result<EnableSyncResult, String> {
    DeviceEnrollService::enable_sync()
        .await
        .map_err(|e| e.message)
}

/// Clear all device sync data and return to FRESH state.
/// Use for troubleshooting or when user wants to reset sync.
#[tauri::command]
pub fn clear_device_sync_data() -> Result<(), String> {
    DeviceEnrollService::clear_sync_data()
        .map_err(|e| e.message)
}

/// Reinitialize device sync - resets server data and enables sync in one operation.
/// Used when sync is in orphaned state (keys exist but no devices).
#[tauri::command]
pub async fn reinitialize_device_sync() -> Result<EnableSyncResult, String> {
    DeviceEnrollService::reinitialize_sync()
        .await
        .map_err(|e| e.message)
}
