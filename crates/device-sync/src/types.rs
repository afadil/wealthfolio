//! Types for device sync API requests and responses.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─────────────────────────────────────────────────────────────────────────────
// Common Response Types
// ─────────────────────────────────────────────────────────────────────────────

/// API error response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorResponse {
    pub error: String,
    pub code: String,
    pub message: String,
}

/// Generic success response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuccessResponse {
    pub success: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Types
// ─────────────────────────────────────────────────────────────────────────────

/// Platform types for devices.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DevicePlatform {
    #[serde(rename = "ios")]
    Ios,
    #[serde(rename = "android")]
    Android,
    #[serde(rename = "macos")]
    MacOS,
    #[serde(rename = "windows")]
    Windows,
    #[serde(rename = "linux")]
    Linux,
    #[serde(rename = "server")]
    Server,
}

impl std::fmt::Display for DevicePlatform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DevicePlatform::Ios => write!(f, "ios"),
            DevicePlatform::Android => write!(f, "android"),
            DevicePlatform::MacOS => write!(f, "macos"),
            DevicePlatform::Windows => write!(f, "windows"),
            DevicePlatform::Linux => write!(f, "linux"),
            DevicePlatform::Server => write!(f, "server"),
        }
    }
}

impl DevicePlatform {
    /// Detect the current platform from the runtime environment.
    /// Uses compile-time detection via target_os.
    pub fn detect() -> Self {
        match std::env::consts::OS {
            "macos" => DevicePlatform::MacOS,
            "windows" => DevicePlatform::Windows,
            "linux" => DevicePlatform::Linux,
            "ios" => DevicePlatform::Ios,
            "android" => DevicePlatform::Android,
            _ => DevicePlatform::Server,
        }
    }
}

/// Trust state for devices.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TrustState {
    Untrusted,
    Trusted,
    Revoked,
}

/// Request to register/enroll a new device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterDeviceRequest {
    /// Client instance ID for idempotency (UUID stored in local settings)
    pub instance_id: String,
    /// Display name of the device
    pub display_name: String,
    /// Platform identifier (ios, android, mac, windows, linux, web)
    pub platform: String,
    /// OS version (e.g., "14.5", "10.0.19041")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
    /// App version (e.g., "3.0.0")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
}

/// Summary of a trusted device (used in PAIR mode response).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedDeviceSummary {
    /// Device ID
    pub id: String,
    /// Display name
    pub name: String,
    /// Platform identifier
    pub platform: String,
    /// Last seen timestamp
    #[serde(rename = "lastSeenAt", alias = "last_seen_at")]
    pub last_seen_at: Option<String>,
}

/// Response from device enrollment - discriminated union based on mode.
///
/// The server returns different responses depending on the device's enrollment state:
/// - BOOTSTRAP: First device for this team, generate RK locally
/// - PAIR: E2EE already enabled, device must pair with existing trusted device
/// - READY: Device is already trusted and ready to sync
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EnrollDeviceResponse {
    /// First device - generate root key locally and initialize E2EE
    Bootstrap {
        #[serde(rename = "deviceId", alias = "device_id")]
        device_id: String,
        #[serde(rename = "e2eeKeyVersion", alias = "e2ee_key_version")]
        e2ee_key_version: i32,
    },
    /// Device must pair with an existing trusted device to receive root key
    Pair {
        #[serde(rename = "deviceId", alias = "device_id")]
        device_id: String,
        #[serde(rename = "e2eeKeyVersion", alias = "e2ee_key_version")]
        e2ee_key_version: i32,
        #[serde(rename = "requireSas", alias = "require_sas")]
        require_sas: bool,
        #[serde(rename = "pairingTtlSeconds", alias = "pairing_ttl_seconds")]
        pairing_ttl_seconds: i32,
        #[serde(rename = "trustedDevices", alias = "trusted_devices")]
        trusted_devices: Vec<TrustedDeviceSummary>,
    },
    /// Device is already trusted and ready to sync
    Ready {
        #[serde(rename = "deviceId", alias = "device_id")]
        device_id: String,
        #[serde(rename = "e2eeKeyVersion", alias = "e2ee_key_version")]
        e2ee_key_version: i32,
        #[serde(rename = "trustState", alias = "trust_state")]
        trust_state: TrustState,
    },
}

/// Full device information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// Unique device ID
    pub id: String,
    /// User ID that owns this device
    #[serde(alias = "user_id")]
    pub user_id: String,
    /// Display name of the device
    #[serde(alias = "display_name")]
    pub display_name: String,
    /// Platform identifier
    pub platform: String,
    /// Device public key (base64 encoded)
    #[serde(alias = "device_public_key")]
    pub device_public_key: Option<String>,
    /// Trust state
    #[serde(alias = "trust_state")]
    pub trust_state: TrustState,
    /// Key version if trusted
    #[serde(alias = "trusted_key_version")]
    pub trusted_key_version: Option<f64>,
    /// OS version
    #[serde(alias = "os_version")]
    pub os_version: Option<String>,
    /// App version
    #[serde(alias = "app_version")]
    pub app_version: Option<String>,
    /// Last time this device was seen
    #[serde(alias = "last_seen_at")]
    pub last_seen_at: Option<String>,
    /// When the device was registered
    #[serde(alias = "created_at")]
    pub created_at: String,
}

/// Request to update a device.
/// Note: Uses snake_case for cloud API serialization.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateDeviceRequest {
    /// New display name (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Metadata (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Keys Types (E2EE)
// ─────────────────────────────────────────────────────────────────────────────

/// Response from initializing team keys (Phase 1) - discriminated union based on mode.
///
/// The server returns different responses depending on the team's key state:
/// - BOOTSTRAP: Ready to initialize - challenge/nonce returned for key generation
/// - PAIRING_REQUIRED: Already initialized - device must pair with trusted device
/// - READY: Device already trusted at current key version
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InitializeKeysResult {
    /// Ready to bootstrap - generate RK locally and call /commit
    Bootstrap {
        challenge: String,
        nonce: String,
        #[serde(rename = "keyVersion", alias = "key_version")]
        key_version: i32,
    },
    /// E2EE already initialized - device must pair with a trusted device
    PairingRequired {
        #[serde(rename = "e2eeKeyVersion", alias = "e2ee_key_version")]
        e2ee_key_version: i32,
        #[serde(rename = "requireSas", alias = "require_sas")]
        require_sas: bool,
        #[serde(rename = "pairingTtlSeconds", alias = "pairing_ttl_seconds")]
        pairing_ttl_seconds: i32,
        #[serde(rename = "trustedDevices", alias = "trusted_devices")]
        trusted_devices: Vec<TrustedDeviceSummary>,
    },
    /// Device is already trusted at current key version
    Ready {
        #[serde(rename = "e2eeKeyVersion", alias = "e2ee_key_version")]
        e2ee_key_version: i32,
    },
}

/// Request to commit team key initialization (Phase 2).
/// Note: Uses snake_case for cloud API serialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInitializeKeysRequest {
    /// Device ID
    pub device_id: String,
    /// Key version
    pub key_version: i32,
    /// Base64 encoded device key envelope
    pub device_key_envelope: String,
    /// Base64 encoded signature
    pub signature: String,
    /// Base64 encoded challenge response (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub challenge_response: Option<String>,
    /// Base64 encoded recovery envelope (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_envelope: Option<String>,
}

/// Key state after initialization.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KeyState {
    Active,
    Pending,
}

/// Response from committing team key initialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInitializeKeysResponse {
    pub success: bool,
    #[serde(alias = "key_state")]
    pub key_state: KeyState,
}

/// Response from starting key rotation (Phase 1).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotateKeysResponse {
    /// Base64 encoded challenge
    pub challenge: String,
    /// Base64 encoded nonce
    pub nonce: String,
    /// New key version
    #[serde(alias = "new_key_version")]
    pub new_key_version: i32,
}

/// Envelope for a device during key rotation.
/// Note: Uses snake_case for cloud API serialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceKeyEnvelope {
    /// Device ID
    pub device_id: String,
    /// Base64 encoded device key envelope
    pub device_key_envelope: String,
}

/// Request to commit key rotation (Phase 2).
/// Note: Uses snake_case for cloud API serialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitRotateKeysRequest {
    /// New key version
    pub new_key_version: i32,
    /// Envelopes for all devices
    pub envelopes: Vec<DeviceKeyEnvelope>,
    /// Base64 encoded signature
    pub signature: String,
    /// Base64 encoded challenge response (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub challenge_response: Option<String>,
}

/// Response from committing key rotation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRotateKeysResponse {
    pub success: bool,
    #[serde(alias = "key_version")]
    pub key_version: i32,
}

/// Response from resetting team sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetTeamSyncResponse {
    pub success: bool,
    #[serde(alias = "key_version")]
    pub key_version: i32,
    #[serde(alias = "reset_at")]
    pub reset_at: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Pairing Types
// ─────────────────────────────────────────────────────────────────────────────

/// Request to create a new pairing session.
/// Note: Uses snake_case for cloud API serialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePairingRequest {
    /// SHA-256 hash of pairing code (hex, 64 chars)
    pub code_hash: String,
    /// Ephemeral public key (base64 encoded)
    pub ephemeral_public_key: String,
}

/// Response from creating a pairing session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePairingResponse {
    /// Unique pairing ID
    #[serde(alias = "pairing_id")]
    pub pairing_id: String,
    /// When the session expires
    #[serde(alias = "expires_at")]
    pub expires_at: String,
    /// Key version
    #[serde(alias = "key_version")]
    pub key_version: i32,
    /// Whether SAS verification is required
    #[serde(alias = "require_sas")]
    pub require_sas: bool,
}

/// Pairing session status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PairingStatus {
    Open,
    Claimed,
    Approved,
    Completed,
    Cancelled,
    Expired,
}

/// Response from getting a pairing session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPairingResponse {
    /// Pairing ID
    #[serde(alias = "pairing_id")]
    pub pairing_id: String,
    /// Session status
    pub status: PairingStatus,
    /// Claimer's device ID (if claimed)
    #[serde(alias = "claimer_device_id")]
    pub claimer_device_id: Option<String>,
    /// Claimer's ephemeral public key (if claimed, base64 encoded)
    #[serde(alias = "claimer_ephemeral_pub")]
    pub claimer_ephemeral_pub: Option<String>,
    /// When the session expires
    #[serde(alias = "expires_at")]
    pub expires_at: String,
}

/// Request to complete a pairing session (issuer side).
/// Note: Uses snake_case for cloud API serialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletePairingRequest {
    /// Base64 encoded encrypted key bundle
    pub encrypted_key_bundle: String,
    /// SAS proof (string or object)
    pub sas_proof: serde_json::Value,
    /// Base64 encoded signature
    pub signature: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Claimer-Side Pairing Types
// ─────────────────────────────────────────────────────────────────────────────

/// Request to claim a pairing session (claimer/new device side).
/// Note: Uses snake_case for cloud API serialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimPairingRequest {
    /// Pairing code displayed on the issuer device (plain text, not hash)
    pub code: String,
    /// Claimer's ephemeral public key for key exchange (base64 encoded)
    pub ephemeral_public_key: String,
}

/// Response from claiming a pairing session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPairingResponse {
    /// Pairing session ID (same as pairing_id)
    #[serde(alias = "session_id")]
    pub session_id: String,
    /// Issuer's X25519 ephemeral public key for deriving shared secret (base64)
    #[serde(alias = "issuer_ephemeral_pub")]
    pub issuer_ephemeral_pub: String,
    /// Current E2EE key version (epoch)
    #[serde(alias = "e2ee_key_version")]
    pub e2ee_key_version: i32,
    /// Whether SAS verification is required
    #[serde(alias = "require_sas")]
    pub require_sas: bool,
    /// Session expiration timestamp
    #[serde(alias = "expires_at")]
    pub expires_at: String,
}

/// Message from issuer to claimer during pairing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingMessage {
    /// Message identifier
    pub id: String,
    /// Type of encrypted payload (e.g., 'rk_transfer_v1' for RK bundle)
    #[serde(alias = "payload_type")]
    pub payload_type: String,
    /// Encrypted payload (base64 encoded)
    pub payload: String,
    /// Message timestamp
    #[serde(alias = "created_at")]
    pub created_at: String,
}

/// Response from polling for messages (claimer side).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingMessagesResponse {
    /// Current session status
    #[serde(alias = "session_status")]
    pub session_status: PairingStatus,
    /// List of encrypted messages in the pairing session
    pub messages: Vec<PairingMessage>,
}

/// Request to confirm pairing and become trusted (claimer side).
/// Note: Uses snake_case for cloud API serialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfirmPairingRequest {
    /// Optional HMAC proof that device successfully decrypted the RK bundle
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proof: Option<String>,
}

/// Response from confirming pairing (claimer becomes trusted).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmPairingResponse {
    /// Operation succeeded
    pub success: bool,
    /// E2EE key version the device is now trusted at
    #[serde(alias = "key_version")]
    pub key_version: i32,
}

