//! Device sync API client for communicating with the Wealthfolio Connect cloud service.
//!
//! This client uses the REST API endpoints for device synchronization.

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
/// registration, pairing, and key synchronization.
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
    fn headers(&self, token: &str) -> Result<HeaderMap> {
        self.headers_with_device(token, None)
    }

    /// Create headers for an API request with optional device ID.
    fn headers_with_device(&self, token: &str, device_id: Option<&str>) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let auth_value = HeaderValue::from_str(&format!("Bearer {}", token))
            .map_err(|_| DeviceSyncError::auth("Invalid access token format"))?;
        headers.insert(AUTHORIZATION, auth_value);

        if let Some(device_id) = device_id {
            let device_id_value = HeaderValue::from_str(device_id)
                .map_err(|_| DeviceSyncError::auth("Invalid device ID format"))?;
            headers.insert("x-wf-device-id", device_id_value);
        }

        Ok(headers)
    }

    /// Parse a JSON response body.
    async fn parse_response<T: serde::de::DeserializeOwned>(
        response: reqwest::Response,
    ) -> Result<T> {
        let status = response.status();
        let body = response.text().await?;
        debug!("API response ({}): {}", status, body);

        if !status.is_success() {
            // Try to parse error response
            if let Ok(error) = serde_json::from_str::<ApiErrorResponse>(&body) {
                return Err(DeviceSyncError::api(
                    status.as_u16(),
                    format!("{}: {}", error.code, error.message),
                ));
            }
            return Err(DeviceSyncError::api(
                status.as_u16(),
                format!("Request failed: {}", body),
            ));
        }

        serde_json::from_str(&body).map_err(|e| {
            log::error!(
                "Failed to deserialize response. Body: {}, Error: {}",
                body,
                e
            );
            DeviceSyncError::api(status.as_u16(), format!("Failed to parse response: {}", e))
        })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Device Management
    // ─────────────────────────────────────────────────────────────────────────

    /// Enroll a device with the cloud API.
    ///
    /// This is the single entry point for device enrollment. Returns the next step:
    /// - BOOTSTRAP: First device for this team - generate RK locally
    /// - PAIR: E2EE already enabled - device must pair with existing trusted device
    /// - READY: Device is already trusted and ready to sync
    ///
    /// POST /api/v1/sync/team/devices
    pub async fn enroll_device(
        &self,
        token: &str,
        info: RegisterDeviceRequest,
    ) -> Result<EnrollDeviceResponse> {
        let url = format!("{}/api/v1/sync/team/devices", self.base_url);
        debug!("Enrolling device: {:?}", info);

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token)?)
            .json(&info)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Get device info by ID.
    ///
    /// GET /api/v1/sync/team/devices/{deviceId}
    pub async fn get_device(&self, token: &str, device_id: &str) -> Result<Device> {
        let url = format!("{}/api/v1/sync/team/devices/{}", self.base_url, device_id);

        let response = self
            .client
            .get(&url)
            .headers(self.headers(token)?)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// List all devices.
    ///
    /// GET /api/v1/sync/team/devices?scope=my|team
    pub async fn list_devices(&self, token: &str, scope: Option<&str>) -> Result<Vec<Device>> {
        let mut url = format!("{}/api/v1/sync/team/devices", self.base_url);
        if let Some(s) = scope {
            url = format!("{}?scope={}", url, s);
        }

        debug!("[DeviceSync] list_devices URL: {}", url);

        let response = self
            .client
            .get(&url)
            .headers(self.headers(token)?)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Update a device (e.g., rename).
    ///
    /// PATCH /api/v1/sync/team/devices/{deviceId}
    pub async fn update_device(
        &self,
        token: &str,
        device_id: &str,
        update: UpdateDeviceRequest,
    ) -> Result<SuccessResponse> {
        let url = format!("{}/api/v1/sync/team/devices/{}", self.base_url, device_id);

        let response = self
            .client
            .patch(&url)
            .headers(self.headers(token)?)
            .json(&update)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Delete a device.
    ///
    /// DELETE /api/v1/sync/team/devices/{deviceId}
    pub async fn delete_device(&self, token: &str, device_id: &str) -> Result<SuccessResponse> {
        let url = format!("{}/api/v1/sync/team/devices/{}", self.base_url, device_id);

        let response = self
            .client
            .delete(&url)
            .headers(self.headers(token)?)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Revoke a device's trust.
    ///
    /// POST /api/v1/sync/team/devices/{deviceId}/revoke
    pub async fn revoke_device(&self, token: &str, device_id: &str) -> Result<SuccessResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/revoke",
            self.base_url, device_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token)?)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Team Keys (E2EE)
    // ─────────────────────────────────────────────────────────────────────────

    /// Initialize team keys (Phase 1).
    ///
    /// Returns next step for key initialization:
    /// - BOOTSTRAP: Ready to initialize - challenge/nonce returned for key generation
    /// - PAIRING_REQUIRED: Already initialized - device must pair with trusted device
    /// - READY: Device already trusted at current key version
    ///
    /// POST /api/v1/sync/team/keys/initialize
    pub async fn initialize_team_keys(
        &self,
        token: &str,
        device_id: &str,
    ) -> Result<InitializeKeysResult> {
        let url = format!("{}/api/v1/sync/team/keys/initialize", self.base_url);

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .json(&serde_json::json!({ "device_id": device_id }))
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Commit team key initialization (Phase 2).
    /// Upload signed proof and key envelopes.
    ///
    /// POST /api/v1/sync/team/keys/initialize/commit
    pub async fn commit_initialize_team_keys(
        &self,
        token: &str,
        req: CommitInitializeKeysRequest,
    ) -> Result<CommitInitializeKeysResponse> {
        let url = format!("{}/api/v1/sync/team/keys/initialize/commit", self.base_url);
        let device_id = req.device_id.clone();

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(&device_id))?)
            .json(&req)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Start key rotation (Phase 1).
    ///
    /// POST /api/v1/sync/team/keys/rotate
    pub async fn rotate_team_keys(
        &self,
        token: &str,
        initiator_device_id: &str,
    ) -> Result<RotateKeysResponse> {
        let url = format!("{}/api/v1/sync/team/keys/rotate", self.base_url);

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(initiator_device_id))?)
            .json(&serde_json::json!({ "initiator_device_id": initiator_device_id }))
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Commit key rotation (Phase 2).
    ///
    /// POST /api/v1/sync/team/keys/rotate/commit
    pub async fn commit_rotate_team_keys(
        &self,
        token: &str,
        device_id: &str,
        req: CommitRotateKeysRequest,
    ) -> Result<CommitRotateKeysResponse> {
        let url = format!("{}/api/v1/sync/team/keys/rotate/commit", self.base_url);

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .json(&req)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Reset team sync (destructive).
    /// Owner only - revokes all devices and resets key version.
    ///
    /// POST /api/v1/sync/team/keys/reset
    pub async fn reset_team_sync(
        &self,
        token: &str,
        reason: Option<&str>,
    ) -> Result<ResetTeamSyncResponse> {
        let url = format!("{}/api/v1/sync/team/keys/reset", self.base_url);

        // Build body - only include reason if provided (API rejects null)
        let body = match reason {
            Some(r) => serde_json::json!({ "reason": r }),
            None => serde_json::json!({}),
        };

        let response = self
            .client
            .post(&url)
            .headers(self.headers(token)?)
            .json(&body)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pairing
    // ─────────────────────────────────────────────────────────────────────────

    /// Create a new pairing session (trusted device side).
    ///
    /// POST /api/v1/sync/team/devices/{deviceId}/pairings
    pub async fn create_pairing(
        &self,
        token: &str,
        device_id: &str,
        req: CreatePairingRequest,
    ) -> Result<CreatePairingResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/pairings",
            self.base_url, device_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .json(&req)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Get pairing session details.
    ///
    /// GET /api/v1/sync/team/devices/{deviceId}/pairings/{pairingId}
    pub async fn get_pairing(
        &self,
        token: &str,
        device_id: &str,
        pairing_id: &str,
    ) -> Result<GetPairingResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/pairings/{}",
            self.base_url, device_id, pairing_id
        );

        let response = self
            .client
            .get(&url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Approve a pairing session.
    ///
    /// POST /api/v1/sync/team/devices/{deviceId}/pairings/{pairingId}/approve
    pub async fn approve_pairing(
        &self,
        token: &str,
        device_id: &str,
        pairing_id: &str,
    ) -> Result<SuccessResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/pairings/{}/approve",
            self.base_url, device_id, pairing_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Complete a pairing session with key bundle.
    ///
    /// POST /api/v1/sync/team/devices/{deviceId}/pairings/{pairingId}/complete
    pub async fn complete_pairing(
        &self,
        token: &str,
        device_id: &str,
        pairing_id: &str,
        req: CompletePairingRequest,
    ) -> Result<SuccessResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/pairings/{}/complete",
            self.base_url, device_id, pairing_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .json(&req)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Cancel a pairing session.
    ///
    /// POST /api/v1/sync/team/devices/{deviceId}/pairings/{pairingId}/cancel
    pub async fn cancel_pairing(
        &self,
        token: &str,
        device_id: &str,
        pairing_id: &str,
    ) -> Result<SuccessResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/pairings/{}/cancel",
            self.base_url, device_id, pairing_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Claimer-Side Pairing (New Device)
    // ─────────────────────────────────────────────────────────────────────────

    /// Claim a pairing session using the code displayed on the issuer device.
    ///
    /// This is called by the claimer (new device) to join a pairing session.
    /// Returns the issuer's ephemeral public key for deriving the shared secret.
    ///
    /// POST /api/v1/sync/team/devices/{claimerDeviceId}/pairings/claim
    pub async fn claim_pairing(
        &self,
        token: &str,
        claimer_device_id: &str,
        req: ClaimPairingRequest,
    ) -> Result<ClaimPairingResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/pairings/claim",
            self.base_url, claimer_device_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(claimer_device_id))?)
            .json(&req)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Poll for messages/key bundle from the issuer (claimer side).
    ///
    /// The claimer polls this endpoint to receive the encrypted RK bundle
    /// from the issuer after they complete the pairing.
    ///
    /// GET /api/v1/sync/team/devices/{claimerDeviceId}/pairings/{pairingId}/messages
    pub async fn get_pairing_messages(
        &self,
        token: &str,
        claimer_device_id: &str,
        pairing_id: &str,
    ) -> Result<PairingMessagesResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/pairings/{}/messages",
            self.base_url, claimer_device_id, pairing_id
        );

        let response = self
            .client
            .get(&url)
            .headers(self.headers_with_device(token, Some(claimer_device_id))?)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Confirm pairing and become trusted (claimer side).
    ///
    /// This is the final step in the pairing flow. After successfully
    /// decrypting the RK bundle, the claimer calls this to confirm and
    /// be marked as trusted.
    ///
    /// POST /api/v1/sync/team/devices/{claimerDeviceId}/pairings/{pairingId}/confirm
    pub async fn confirm_pairing(
        &self,
        token: &str,
        claimer_device_id: &str,
        pairing_id: &str,
        req: ConfirmPairingRequest,
    ) -> Result<ConfirmPairingResponse> {
        let url = format!(
            "{}/api/v1/sync/team/devices/{}/pairings/{}/confirm",
            self.base_url, claimer_device_id, pairing_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(claimer_device_id))?)
            .json(&req)
            .send()
            .await?;

        Self::parse_response(response).await
    }
}
