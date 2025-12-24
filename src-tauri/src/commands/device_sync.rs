//! Commands for device sync and E2EE pairing.
//!
//! This module handles device registration, pairing sessions, and E2EE bootstrap
//! for cross-device synchronization via the Wealthfolio Connect cloud API.

use log::{debug, info};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use wealthfolio_core::secrets::SecretStore;

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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub platform: String,
    pub app_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRegistrationResponse {
    pub device_id: String,
    pub trust_state: String,
    pub trusted_key_version: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
    pub trust_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trusted_key_version: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub e2ee_enabled: bool,
    pub e2ee_key_version: i32,
    pub require_sas: bool,
    pub pairing_ttl_seconds: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnableE2eeResponse {
    pub e2ee_enabled: bool,
    pub e2ee_key_version: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePairingRequest {
    pub code_hash: String,
    pub ephemeral_public_key: String, // base64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePairingResponse {
    pub session_id: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPairingRequest {
    pub code: String,
    pub ephemeral_public_key: String, // base64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPairingResponse {
    pub session_id: String,
    pub issuer_eph_pub: String, // base64
    pub require_sas: bool,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingMessage {
    pub id: String,
    pub payload_type: String,
    pub payload: String, // base64
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollMessagesResponse {
    pub session_status: String,
    pub messages: Vec<PairingMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSessionResponse {
    pub session_id: String,
    pub status: String,
    pub claimer_device_id: Option<String>,
    pub claimer_eph_pub: Option<String>,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub session_id: String,
    pub to_device_id: String,
    pub payload_type: String,
    pub payload: String, // base64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkTrustedRequest {
    pub device_id: String,
    pub key_version: i32,
}

// ─────────────────────────────────────────────────────────────────────────────
// tRPC Response Parsing (adapted from brokers_sync.rs)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct TrpcResponse<T> {
    result: TrpcResult<T>,
}

#[derive(Debug, Deserialize)]
struct TrpcResult<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TrpcEnvelope<T> {
    Single(TrpcResponse<T>),
    Batch(Vec<TrpcResponse<T>>),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TrpcData<T> {
    Json { json: T },
    Raw(T),
}

impl<T> TrpcData<T> {
    fn into_inner(self) -> T {
        match self {
            Self::Raw(v) => v,
            Self::Json { json } => json,
        }
    }
}

async fn parse_trpc_response<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    parse_trpc_body(status, &body)
}

fn parse_trpc_body<T: serde::de::DeserializeOwned>(
    status: reqwest::StatusCode,
    body: &str,
) -> Result<T, String> {
    debug!("tRPC response body: {}", body);

    // First, try the standard envelope parsing
    if let Ok(envelope) = serde_json::from_str::<TrpcEnvelope<TrpcData<T>>>(body) {
        let data = match envelope {
            TrpcEnvelope::Single(r) => r.result.data,
            TrpcEnvelope::Batch(items) => items
                .into_iter()
                .next()
                .ok_or_else(|| "Empty batched tRPC response".to_string())?
                .result
                .data,
        };
        return Ok(data.into_inner());
    }

    // Try parsing as raw JSON value and extract data manually
    let v: serde_json::Value = serde_json::from_str(body).map_err(|e| {
        format!("Failed to parse response as JSON (status {}): {}", status, e)
    })?;

    // Check for tRPC error
    if let Some(message) = v
        .pointer("/error/message")
        .and_then(|m| m.as_str())
        .or_else(|| v.pointer("/0/error/message").and_then(|m| m.as_str()))
    {
        return Err(format!("tRPC error (status {}): {}", status, message));
    }

    // Try various paths to find the data
    let data_value = v
        .pointer("/result/data/json")
        .or_else(|| v.pointer("/result/data"))
        .or_else(|| v.pointer("/0/result/data/json"))
        .or_else(|| v.pointer("/0/result/data"))
        .ok_or_else(|| {
            log::error!("Could not find data in tRPC response. Raw body: {}", body);
            format!(
                "Failed to parse tRPC response (status {}): could not locate data field",
                status
            )
        })?;

    serde_json::from_value(data_value.clone()).map_err(|e| {
        log::error!(
            "Failed to deserialize tRPC data. Value: {:?}, Error: {}",
            data_value,
            e
        );
        format!("Failed to deserialize tRPC data (status {}): {}", status, e)
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// API Client
// ─────────────────────────────────────────────────────────────────────────────

struct DeviceSyncApiClient {
    client: reqwest::Client,
    base_url: String,
    auth_header: HeaderValue,
    device_id: Option<String>,
}

impl DeviceSyncApiClient {
    fn try_new(base_url: String, access_token: String, device_id: Option<String>) -> Result<Self, String> {
        let auth_header = HeaderValue::from_str(&format!("Bearer {}", access_token))
            .map_err(|e| format!("Invalid access token: {}", e))?;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

        Ok(Self {
            client,
            base_url,
            auth_header,
            device_id,
        })
    }

    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(AUTHORIZATION, self.auth_header.clone());

        // Add device ID header if available
        if let Some(ref device_id) = self.device_id {
            if let Ok(header_value) = HeaderValue::from_str(device_id) {
                headers.insert("x-wf-device-id", header_value);
            }
        }

        headers
    }

    /// Register a new device
    async fn register_device(&self, info: DeviceInfo) -> Result<DeviceRegistrationResponse, String> {
        let url = format!("{}/trpc/syncDevice.register", self.base_url);
        debug!("Registering device: {:?}", info);

        let body = serde_json::json!({ "json": info });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to register device: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error registering device: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Get current device info
    async fn get_current_device(&self) -> Result<Device, String> {
        let url = format!("{}/trpc/syncDevice.current", self.base_url);
        let input = serde_json::json!({ "json": {} });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get current device: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error getting device: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// List all devices
    async fn list_devices(&self) -> Result<Vec<Device>, String> {
        let url = format!("{}/trpc/syncDevice.list", self.base_url);
        let input = serde_json::json!({ "json": {} });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        debug!("[DeviceSync] list_devices URL: {}", full_url);
        debug!("[DeviceSync] list_devices device_id header: {:?}", self.device_id);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to list devices: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error listing devices: {} - {}", status, body));
        }

        let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        debug!("[DeviceSync] list_devices raw response: {}", body);

        parse_trpc_body(status, &body)
    }

    /// Get sync status
    async fn get_sync_status(&self) -> Result<SyncStatus, String> {
        let url = format!("{}/trpc/syncTeam.getStatus", self.base_url);
        let input = serde_json::json!({ "json": {} });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get sync status: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error getting sync status: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Enable E2EE
    async fn enable_e2ee(&self) -> Result<EnableE2eeResponse, String> {
        let url = format!("{}/trpc/syncTeam.enableE2EE", self.base_url);
        let body = serde_json::json!({ "json": {} });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to enable E2EE: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error enabling E2EE: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Create a pairing session
    async fn create_pairing(&self, req: CreatePairingRequest) -> Result<CreatePairingResponse, String> {
        let url = format!("{}/trpc/syncPairing.create", self.base_url);
        let body = serde_json::json!({ "json": req });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to create pairing: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error creating pairing: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Claim a pairing session
    async fn claim_pairing(&self, req: ClaimPairingRequest) -> Result<ClaimPairingResponse, String> {
        let url = format!("{}/trpc/syncPairing.claim", self.base_url);
        let body = serde_json::json!({ "json": req });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to claim pairing: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error claiming pairing: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Approve a pairing session
    async fn approve_pairing(&self, session_id: &str) -> Result<(), String> {
        let url = format!("{}/trpc/syncPairing.approve", self.base_url);
        let body = serde_json::json!({ "json": { "sessionId": session_id } });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to approve pairing: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error approving pairing: {} - {}", status, body));
        }

        Ok(())
    }

    /// Cancel a pairing session
    async fn cancel_pairing(&self, session_id: &str) -> Result<(), String> {
        let url = format!("{}/trpc/syncPairing.cancel", self.base_url);
        let body = serde_json::json!({ "json": { "sessionId": session_id } });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to cancel pairing: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error canceling pairing: {} - {}", status, body));
        }

        Ok(())
    }

    /// Poll for pairing messages
    async fn poll_messages(&self, session_id: &str) -> Result<PollMessagesResponse, String> {
        let url = format!("{}/trpc/syncPairing.pollMessages", self.base_url);
        let input = serde_json::json!({ "json": { "sessionId": session_id } });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to poll messages: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error polling messages: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Get pairing session status (issuer only)
    async fn get_session(&self, session_id: &str) -> Result<GetSessionResponse, String> {
        let url = format!("{}/trpc/syncPairing.getSession", self.base_url);
        let input = serde_json::json!({ "json": { "sessionId": session_id } });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get session: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error getting session: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Send a pairing message
    async fn send_message(&self, req: SendMessageRequest) -> Result<(), String> {
        let url = format!("{}/trpc/syncPairing.sendMessage", self.base_url);
        let body = serde_json::json!({ "json": req });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to send message: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error sending message: {} - {}", status, body));
        }

        Ok(())
    }

    /// Mark a device as trusted
    async fn mark_trusted(&self, req: MarkTrustedRequest) -> Result<(), String> {
        let url = format!("{}/trpc/syncDevice.markTrusted", self.base_url);
        let body = serde_json::json!({ "json": req });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to mark trusted: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error marking trusted: {} - {}", status, body));
        }

        Ok(())
    }

    /// Rename a device
    async fn rename_device(&self, device_id: &str, name: &str) -> Result<(), String> {
        let url = format!("{}/trpc/syncDevice.rename", self.base_url);
        let body = serde_json::json!({ "json": { "deviceId": device_id, "name": name } });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to rename device: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error renaming device: {} - {}", status, body));
        }

        Ok(())
    }

    /// Revoke a device
    async fn revoke_device(&self, device_id: &str) -> Result<(), String> {
        let url = format!("{}/trpc/syncDevice.revoke", self.base_url);
        let body = serde_json::json!({ "json": { "deviceId": device_id } });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to revoke device: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error revoking device: {} - {}", status, body));
        }

        Ok(())
    }

    /// Reset sync (owner only)
    async fn reset_sync(&self) -> Result<EnableE2eeResponse, String> {
        let url = format!("{}/trpc/syncTeam.resetSync", self.base_url);
        let body = serde_json::json!({ "json": {} });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to reset sync: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error resetting sync: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }
}

fn create_api_client() -> Result<DeviceSyncApiClient, String> {
    let access_token = KeyringSecretStore
        .get_secret(CLOUD_ACCESS_TOKEN_KEY)
        .map_err(|e| format!("Failed to get access token: {}", e))?
        .ok_or_else(|| "No access token configured. Please sign in first.".to_string())?;

    let device_id = match KeyringSecretStore.get_secret(DEVICE_ID_KEY) {
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
    };

    DeviceSyncApiClient::try_new(cloud_api_base_url(), access_token, device_id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Get the stored device ID
#[tauri::command]
pub async fn get_device_id(_state: State<'_, Arc<ServiceContext>>) -> Result<Option<String>, String> {
    KeyringSecretStore
        .get_secret(DEVICE_ID_KEY)
        .map_err(|e| format!("Failed to get device ID: {}", e))
}

/// Store the device ID
#[tauri::command]
pub async fn set_device_id(
    device_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    KeyringSecretStore
        .set_secret(DEVICE_ID_KEY, &device_id)
        .map_err(|e| format!("Failed to store device ID: {}", e))
}

/// Clear the device ID
#[tauri::command]
pub async fn clear_device_id(_state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    KeyringSecretStore
        .delete_secret(DEVICE_ID_KEY)
        .map_err(|e| format!("Failed to delete device ID: {}", e))
}

/// Register a new device with the cloud API
#[tauri::command]
pub async fn register_device(
    device_info: DeviceInfo,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<DeviceRegistrationResponse, String> {
    info!("[DeviceSync] Registering device: {:?}", device_info);
    let client = create_api_client()?;
    let result = client.register_device(device_info).await?;

    // Store the device ID in keyring
    info!("[DeviceSync] Storing device ID in keyring: {}", result.device_id);
    KeyringSecretStore
        .set_secret(DEVICE_ID_KEY, &result.device_id)
        .map_err(|e| format!("Failed to store device ID: {}", e))?;

    // Verify storage was successful
    let stored_id = KeyringSecretStore
        .get_secret(DEVICE_ID_KEY)
        .map_err(|e| format!("Failed to verify device ID storage: {}", e))?;

    if stored_id.as_deref() != Some(&result.device_id) {
        log::error!("[DeviceSync] Device ID storage verification failed! Expected: {}, Got: {:?}",
            result.device_id, stored_id);
        return Err("Device ID storage verification failed".to_string());
    }

    info!("[DeviceSync] Device registered and stored successfully: {}", result.device_id);
    Ok(result)
}

/// Get current device info
#[tauri::command]
pub async fn get_current_device(_state: State<'_, Arc<ServiceContext>>) -> Result<Device, String> {
    let client = create_api_client()?;
    client.get_current_device().await
}

/// List all devices
#[tauri::command]
pub async fn list_devices(_state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Device>, String> {
    info!("[DeviceSync] Listing devices...");
    let client = create_api_client()?;
    let devices = client.list_devices().await?;
    info!("[DeviceSync] Found {} devices", devices.len());
    Ok(devices)
}

/// Get sync status
#[tauri::command]
pub async fn get_sync_status(_state: State<'_, Arc<ServiceContext>>) -> Result<SyncStatus, String> {
    let client = create_api_client()?;
    client.get_sync_status().await
}

/// Enable E2EE
#[tauri::command]
pub async fn enable_e2ee(_state: State<'_, Arc<ServiceContext>>) -> Result<EnableE2eeResponse, String> {
    info!("[DeviceSync] Enabling E2EE...");
    let client = create_api_client()?;
    info!("[DeviceSync] API client created, device_id header present: {}", client.device_id.is_some());
    let result = client.enable_e2ee().await?;
    info!("[DeviceSync] E2EE enabled, key version: {}", result.e2ee_key_version);
    Ok(result)
}

/// Create a pairing session
#[tauri::command]
pub async fn create_pairing(
    code_hash: String,
    ephemeral_public_key: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<CreatePairingResponse, String> {
    debug!("Creating pairing session...");
    let client = create_api_client()?;
    client.create_pairing(CreatePairingRequest { code_hash, ephemeral_public_key }).await
}

/// Claim a pairing session
#[tauri::command]
pub async fn claim_pairing(
    code: String,
    ephemeral_public_key: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<ClaimPairingResponse, String> {
    debug!("Claiming pairing session...");
    let client = create_api_client()?;
    client.claim_pairing(ClaimPairingRequest { code, ephemeral_public_key }).await
}

/// Approve a pairing session
#[tauri::command]
pub async fn approve_pairing(
    session_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Approving pairing session: {}", session_id);
    let client = create_api_client()?;
    client.approve_pairing(&session_id).await
}

/// Cancel a pairing session
#[tauri::command]
pub async fn cancel_pairing(
    session_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Canceling pairing session: {}", session_id);
    let client = create_api_client()?;
    client.cancel_pairing(&session_id).await
}

/// Poll for pairing messages
#[tauri::command]
pub async fn poll_pairing_messages(
    session_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<PollMessagesResponse, String> {
    let client = create_api_client()?;
    client.poll_messages(&session_id).await
}

/// Get pairing session status (issuer only)
#[tauri::command]
pub async fn get_pairing_session(
    session_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<GetSessionResponse, String> {
    debug!("Getting pairing session: {}", session_id);
    let client = create_api_client()?;
    client.get_session(&session_id).await
}

/// Send a pairing message
#[tauri::command]
pub async fn send_pairing_message(
    session_id: String,
    to_device_id: String,
    payload_type: String,
    payload: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Sending pairing message to: {}", to_device_id);
    let client = create_api_client()?;
    client.send_message(SendMessageRequest {
        session_id,
        to_device_id,
        payload_type,
        payload,
    }).await
}

/// Mark a device as trusted
#[tauri::command]
pub async fn mark_device_trusted(
    device_id: String,
    key_version: i32,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    info!("Marking device {} as trusted (key version {})", device_id, key_version);
    let client = create_api_client()?;
    client.mark_trusted(MarkTrustedRequest { device_id, key_version }).await
}

/// Rename a device
#[tauri::command]
pub async fn rename_device(
    device_id: String,
    name: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    info!("Renaming device {} to: {}", device_id, name);
    let client = create_api_client()?;
    client.rename_device(&device_id, &name).await
}

/// Revoke a device
#[tauri::command]
pub async fn revoke_device(
    device_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    info!("Revoking device: {}", device_id);
    let client = create_api_client()?;
    client.revoke_device(&device_id).await
}

/// Reset sync (owner only)
#[tauri::command]
pub async fn reset_sync(_state: State<'_, Arc<ServiceContext>>) -> Result<EnableE2eeResponse, String> {
    info!("Resetting sync...");
    let client = create_api_client()?;
    let result = client.reset_sync().await?;
    info!("Sync reset, new key version: {}", result.e2ee_key_version);
    Ok(result)
}
