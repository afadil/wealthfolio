//! Types for device sync API requests and responses.

use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Device Types
// ─────────────────────────────────────────────────────────────────────────────

/// Information about a device for registration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    /// Display name of the device
    pub name: String,
    /// Platform identifier (e.g., "mac", "windows", "linux", "server", "ios", "android")
    pub platform: String,
    /// Application version
    pub app_version: String,
    /// Operating system version (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
}

/// Response from device registration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRegistrationResponse {
    /// Unique device ID assigned by the server
    pub device_id: String,
    /// Trust state of the device ("trusted" or "untrusted")
    pub trust_state: String,
    /// Key version if device is trusted
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trusted_key_version: Option<i32>,
}

/// Full device information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// Unique device ID
    pub id: String,
    /// User ID that owns this device
    pub user_id: String,
    /// Display name of the device
    pub name: String,
    /// Platform identifier
    pub platform: String,
    /// Application version
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
    /// Operating system version
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
    /// Trust state ("trusted" or "untrusted")
    pub trust_state: String,
    /// Key version if trusted
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trusted_key_version: Option<i32>,
    /// Last time this device was seen
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen_at: Option<String>,
    /// When the device was registered
    pub created_at: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Status Types
// ─────────────────────────────────────────────────────────────────────────────

/// E2EE sync status for a team.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    /// Whether E2EE is enabled for this team
    pub e2ee_enabled: bool,
    /// Current E2EE key version
    pub e2ee_key_version: i32,
    /// Whether SAS verification is required for pairing
    pub require_sas: bool,
    /// TTL for pairing sessions in seconds
    pub pairing_ttl_seconds: i32,
    /// When sync was last reset (if ever)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_at: Option<String>,
}

/// Trusted device info (returned in requires_pairing response).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustedDeviceInfo {
    /// Device ID
    pub id: String,
    /// Device name
    pub name: String,
    /// Platform identifier
    pub platform: String,
    /// Last time this device was seen
    pub last_seen_at: Option<String>,
}

/// Response from enabling E2EE - discriminated union based on status.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum EnableE2eeResponse {
    /// E2EE was initialized (first device enabling E2EE)
    Initialized {
        /// The E2EE key version
        #[serde(rename = "e2eeKeyVersion")]
        e2ee_key_version: i32,
        /// The device ID that bootstrapped E2EE
        #[serde(rename = "bootstrapDeviceId")]
        bootstrap_device_id: String,
    },
    /// E2EE already enabled, device needs to pair with a trusted device
    RequiresPairing {
        /// The E2EE key version
        #[serde(rename = "e2eeKeyVersion")]
        e2ee_key_version: i32,
        /// List of trusted devices that can share the key
        #[serde(rename = "trustedDevices")]
        trusted_devices: Vec<TrustedDeviceInfo>,
    },
}

// ─────────────────────────────────────────────────────────────────────────────
// Pairing Types
// ─────────────────────────────────────────────────────────────────────────────

/// Request to create a new pairing session (issuer side).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePairingRequest {
    /// Hash of the pairing code
    pub code_hash: String,
    /// Ephemeral public key (base64 encoded)
    pub ephemeral_public_key: String,
}

/// Response from creating a pairing session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePairingResponse {
    /// Unique session ID
    pub session_id: String,
    /// When the session expires
    pub expires_at: String,
}

/// Request to claim a pairing session (claimer side).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPairingRequest {
    /// The 6-digit pairing code
    pub code: String,
    /// Claimer's ephemeral public key (base64 encoded)
    pub ephemeral_public_key: String,
}

/// Response from claiming a pairing session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPairingResponse {
    /// Session ID
    pub session_id: String,
    /// Issuer's ephemeral public key (base64 encoded)
    pub issuer_eph_pub: String,
    /// Whether SAS verification is required
    pub require_sas: bool,
    /// When the session expires
    pub expires_at: String,
}

/// A message in a pairing session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingMessage {
    /// Message ID
    pub id: String,
    /// Type of payload (e.g., "root_key")
    pub payload_type: String,
    /// Encrypted payload (base64 encoded)
    pub payload: String,
    /// When the message was created
    pub created_at: String,
}

/// Response from polling for pairing messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollMessagesResponse {
    /// Current status of the session
    pub session_status: String,
    /// Messages received
    pub messages: Vec<PairingMessage>,
}

/// Response from getting a pairing session (issuer only).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSessionResponse {
    /// Session ID
    pub session_id: String,
    /// Session status ("open", "claimed", "approved", "completed", "cancelled", "expired")
    pub status: String,
    /// Claimer's device ID (if claimed)
    pub claimer_device_id: Option<String>,
    /// Claimer's ephemeral public key (if claimed, base64 encoded)
    pub claimer_eph_pub: Option<String>,
    /// When the session expires
    pub expires_at: String,
}

/// Request to send a pairing message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    /// Session ID
    pub session_id: String,
    /// Target device ID
    pub to_device_id: String,
    /// Type of payload
    pub payload_type: String,
    /// Encrypted payload (base64 encoded)
    pub payload: String,
}

/// Request to mark a device as trusted.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkTrustedRequest {
    /// Device ID to mark as trusted
    pub device_id: String,
    /// Key version to trust
    pub key_version: i32,
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal tRPC Response Types
// ─────────────────────────────────────────────────────────────────────────────

/// tRPC response wrapper.
#[derive(Debug, Deserialize)]
pub(crate) struct TrpcResponse<T> {
    pub result: TrpcResult<T>,
}

/// tRPC result wrapper.
#[derive(Debug, Deserialize)]
pub(crate) struct TrpcResult<T> {
    pub data: T,
}

/// tRPC envelope (single or batch).
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub(crate) enum TrpcEnvelope<T> {
    Single(TrpcResponse<T>),
    Batch(Vec<TrpcResponse<T>>),
}

/// tRPC data wrapper (json or raw).
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub(crate) enum TrpcData<T> {
    Json { json: T },
    Raw(T),
}

impl<T> TrpcData<T> {
    pub fn into_inner(self) -> T {
        match self {
            Self::Json { json } => json,
            Self::Raw(v) => v,
        }
    }
}
