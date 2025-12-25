//! Device sync API client for communicating with the Wealthfolio Connect cloud service.

use log::debug;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use std::time::Duration;

use crate::error::{DeviceSyncError, Result};
use crate::types::*;

/// Default timeout for API requests.
const DEFAULT_TIMEOUT_SECS: u64 = 30;

/// Client for the Wealthfolio device sync cloud API.
///
/// This client handles all communication with the cloud service for device
/// registration, pairing, and E2EE synchronization.
#[derive(Debug, Clone)]
pub struct DeviceSyncClient {
    client: reqwest::Client,
    base_url: String,
}

impl DeviceSyncClient {
    /// Create a new device sync client.
    ///
    /// # Arguments
    ///
    /// * `base_url` - The base URL of the cloud API (e.g., "https://api.wealthfolio.app")
    pub fn new(base_url: &str) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    /// Create headers for an API request.
    fn headers(&self, token: &str, device_id: Option<&str>) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let auth_value = HeaderValue::from_str(&format!("Bearer {}", token))
            .map_err(|_| DeviceSyncError::auth("Invalid access token format"))?;
        headers.insert(AUTHORIZATION, auth_value);

        if let Some(id) = device_id {
            if let Ok(header_value) = HeaderValue::from_str(id) {
                headers.insert("x-wf-device-id", header_value);
            }
        }

        Ok(headers)
    }

    /// Parse a tRPC response body.
    fn parse_trpc_body<T: serde::de::DeserializeOwned>(
        status: reqwest::StatusCode,
        body: &str,
    ) -> Result<T> {
        debug!("tRPC response body: {}", body);

        // First, try the standard envelope parsing
        if let Ok(envelope) = serde_json::from_str::<TrpcEnvelope<TrpcData<T>>>(body) {
            let data = match envelope {
                TrpcEnvelope::Single(r) => r.result.data,
                TrpcEnvelope::Batch(items) => items
                    .into_iter()
                    .next()
                    .ok_or_else(|| DeviceSyncError::trpc("Empty batched tRPC response"))?
                    .result
                    .data,
            };
            return Ok(data.into_inner());
        }

        // Try parsing as raw JSON value and extract data manually
        let v: serde_json::Value = serde_json::from_str(body).map_err(|e| {
            DeviceSyncError::trpc(format!(
                "Failed to parse response as JSON (status {}): {}",
                status, e
            ))
        })?;

        // Check for tRPC error
        if let Some(message) = v
            .pointer("/error/message")
            .and_then(|m| m.as_str())
            .or_else(|| v.pointer("/0/error/message").and_then(|m| m.as_str()))
        {
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("tRPC error: {}", message),
            ));
        }

        // Try various paths to find the data
        let data_value = v
            .pointer("/result/data/json")
            .or_else(|| v.pointer("/result/data"))
            .or_else(|| v.pointer("/0/result/data/json"))
            .or_else(|| v.pointer("/0/result/data"))
            .ok_or_else(|| {
                log::error!("Could not find data in tRPC response. Raw body: {}", body);
                DeviceSyncError::trpc(format!(
                    "Failed to parse tRPC response (status {}): could not locate data field",
                    status
                ))
            })?;

        serde_json::from_value(data_value.clone()).map_err(|e| {
            log::error!(
                "Failed to deserialize tRPC data. Value: {:?}, Error: {}",
                data_value,
                e
            );
            DeviceSyncError::trpc(format!(
                "Failed to deserialize tRPC data (status {}): {}",
                status, e
            ))
        })
    }

    /// Parse a tRPC response.
    async fn parse_trpc_response<T: serde::de::DeserializeOwned>(
        response: reqwest::Response,
    ) -> Result<T> {
        let status = response.status();
        let body = response.text().await?;
        Self::parse_trpc_body(status, &body)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Device Management
    // ─────────────────────────────────────────────────────────────────────────

    /// Register a new device with the cloud API.
    ///
    /// # Arguments
    ///
    /// * `token` - Access token for authentication
    /// * `device_id` - Optional existing device ID (for re-registration)
    /// * `info` - Device information
    pub async fn register_device(
        &self,
        token: &str,
        device_id: Option<&str>,
        info: DeviceInfo,
    ) -> Result<DeviceRegistrationResponse> {
        let url = format!("{}/trpc/syncDevice.register", self.base_url);
        debug!("Registering device: {:?}", info);

        let body = serde_json::json!({ "json": info });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, device_id)?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to register device: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    /// Get current device info.
    pub async fn get_current_device(&self, token: &str, device_id: &str) -> Result<Device> {
        let url = format!("{}/trpc/syncDevice.current", self.base_url);
        let input = serde_json::json!({ "json": {} });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers(token, Some(device_id))?)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to get current device: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    /// List all devices for the current user.
    pub async fn list_devices(&self, token: &str, device_id: &str) -> Result<Vec<Device>> {
        let url = format!("{}/trpc/syncDevice.list", self.base_url);
        let input = serde_json::json!({ "json": {} });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        debug!("[DeviceSync] list_devices URL: {}", full_url);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers(token, Some(device_id))?)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to list devices: {}", body),
            ));
        }

        let body = response.text().await?;
        debug!("[DeviceSync] list_devices raw response: {}", body);

        Self::parse_trpc_body(status, &body)
    }

    /// Rename a device.
    pub async fn rename_device(
        &self,
        token: &str,
        device_id: &str,
        target_device_id: &str,
        name: &str,
    ) -> Result<()> {
        let url = format!("{}/trpc/syncDevice.rename", self.base_url);
        let body = serde_json::json!({ "json": { "deviceId": target_device_id, "name": name } });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to rename device: {}", body),
            ));
        }

        Ok(())
    }

    /// Revoke a device.
    pub async fn revoke_device(
        &self,
        token: &str,
        device_id: &str,
        target_device_id: &str,
    ) -> Result<()> {
        let url = format!("{}/trpc/syncDevice.revoke", self.base_url);
        let body = serde_json::json!({ "json": { "deviceId": target_device_id } });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to revoke device: {}", body),
            ));
        }

        Ok(())
    }

    /// Mark a device as trusted.
    pub async fn mark_trusted(
        &self,
        token: &str,
        device_id: &str,
        req: MarkTrustedRequest,
    ) -> Result<()> {
        let url = format!("{}/trpc/syncDevice.markTrusted", self.base_url);
        let body = serde_json::json!({ "json": req });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to mark device trusted: {}", body),
            ));
        }

        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sync Status & E2EE
    // ─────────────────────────────────────────────────────────────────────────

    /// Get sync status for the current team.
    pub async fn get_sync_status(&self, token: &str, device_id: &str) -> Result<SyncStatus> {
        let url = format!("{}/trpc/syncTeam.getStatus", self.base_url);
        let input = serde_json::json!({ "json": {} });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers(token, Some(device_id))?)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to get sync status: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    /// Enable E2EE for the current team.
    pub async fn enable_e2ee(&self, token: &str, device_id: &str) -> Result<EnableE2eeResponse> {
        let url = format!("{}/trpc/syncTeam.enableE2EE", self.base_url);
        let body = serde_json::json!({ "json": {} });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to enable E2EE: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    /// Reset sync for the current team (owner only).
    pub async fn reset_sync(&self, token: &str, device_id: &str) -> Result<EnableE2eeResponse> {
        let url = format!("{}/trpc/syncTeam.resetSync", self.base_url);
        let body = serde_json::json!({ "json": {} });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to reset sync: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pairing
    // ─────────────────────────────────────────────────────────────────────────

    /// Create a new pairing session (issuer side).
    pub async fn create_pairing(
        &self,
        token: &str,
        device_id: &str,
        req: CreatePairingRequest,
    ) -> Result<CreatePairingResponse> {
        let url = format!("{}/trpc/syncPairing.create", self.base_url);
        let body = serde_json::json!({ "json": req });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to create pairing: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    /// Claim a pairing session (claimer side).
    pub async fn claim_pairing(
        &self,
        token: &str,
        device_id: &str,
        req: ClaimPairingRequest,
    ) -> Result<ClaimPairingResponse> {
        let url = format!("{}/trpc/syncPairing.claim", self.base_url);
        let body = serde_json::json!({ "json": req });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to claim pairing: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    /// Approve a pairing session (issuer side).
    pub async fn approve_pairing(
        &self,
        token: &str,
        device_id: &str,
        session_id: &str,
    ) -> Result<()> {
        let url = format!("{}/trpc/syncPairing.approve", self.base_url);
        let body = serde_json::json!({ "json": { "sessionId": session_id } });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to approve pairing: {}", body),
            ));
        }

        Ok(())
    }

    /// Cancel a pairing session.
    pub async fn cancel_pairing(
        &self,
        token: &str,
        device_id: &str,
        session_id: &str,
    ) -> Result<()> {
        let url = format!("{}/trpc/syncPairing.cancel", self.base_url);
        let body = serde_json::json!({ "json": { "sessionId": session_id } });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to cancel pairing: {}", body),
            ));
        }

        Ok(())
    }

    /// Get pairing session status (issuer only).
    pub async fn get_session(
        &self,
        token: &str,
        device_id: &str,
        session_id: &str,
    ) -> Result<GetSessionResponse> {
        let url = format!("{}/trpc/syncPairing.getSession", self.base_url);
        let input = serde_json::json!({ "json": { "sessionId": session_id } });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers(token, Some(device_id))?)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to get session: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    /// Poll for pairing messages.
    pub async fn poll_messages(
        &self,
        token: &str,
        device_id: &str,
        session_id: &str,
    ) -> Result<PollMessagesResponse> {
        let url = format!("{}/trpc/syncPairing.pollMessages", self.base_url);
        let input = serde_json::json!({ "json": { "sessionId": session_id } });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let full_url = format!("{}?input={}", url, encoded);

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers(token, Some(device_id))?)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to poll messages: {}", body),
            ));
        }

        Self::parse_trpc_response(response).await
    }

    /// Send a pairing message.
    pub async fn send_message(
        &self,
        token: &str,
        device_id: &str,
        req: SendMessageRequest,
    ) -> Result<()> {
        let url = format!("{}/trpc/syncPairing.sendMessage", self.base_url);
        let body = serde_json::json!({ "json": req });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token, Some(device_id))?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Failed to send message: {}", body),
            ));
        }

        Ok(())
    }
}
