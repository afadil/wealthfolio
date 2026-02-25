//! Device sync API client for communicating with the Wealthfolio Connect cloud service.
//!
//! This client uses the REST API endpoints for device synchronization.

use log::debug;
use rand::Rng;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::sleep;
use uuid::Uuid;

use crate::error::{DeviceSyncError, Result};
use crate::types::*;

/// Default timeout for API requests.
const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_LOG_BODY_CHARS: usize = 512;
const SNAPSHOT_UPLOAD_MAX_ATTEMPTS: usize = 5;
const SNAPSHOT_UPLOAD_BASE_BACKOFF_MS: u64 = 250;
const SNAPSHOT_UPLOAD_MAX_BACKOFF_MS: u64 = 8_000;

static SNAPSHOT_UPLOAD_IN_FLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn snapshot_upload_in_flight() -> &'static Mutex<HashSet<String>> {
    SNAPSHOT_UPLOAD_IN_FLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn compute_sha256_checksum(payload: &[u8]) -> String {
    crate::crypto::sha256_checksum(payload)
}

fn is_valid_sha256_checksum(checksum: &str) -> bool {
    let Some(hex) = checksum.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit())
}

fn is_retryable_snapshot_status(status: u16) -> bool {
    matches!(status, 408 | 429 | 500..=599)
}

fn is_retryable_transport_error(err: &reqwest::Error) -> bool {
    err.is_timeout() || err.is_connect() || err.is_request() || err.is_body()
}

fn snapshot_backoff_with_jitter(attempt: usize) -> Duration {
    let exp = (attempt.saturating_sub(1) as u32).min(8);
    let backoff = (SNAPSHOT_UPLOAD_BASE_BACKOFF_MS.saturating_mul(1_u64 << exp))
        .min(SNAPSHOT_UPLOAD_MAX_BACKOFF_MS);
    let jitter = rand::thread_rng().gen_range(0..=(backoff / 5).max(1));
    Duration::from_millis(backoff.saturating_add(jitter))
}

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
    fn is_backend_strict_uuid(input: &str) -> bool {
        let value = input.trim();
        if value.eq_ignore_ascii_case("00000000-0000-0000-0000-000000000000")
            || value.eq_ignore_ascii_case("ffffffff-ffff-ffff-ffff-ffffffffffff")
        {
            return true;
        }

        let bytes = value.as_bytes();
        if bytes.len() != 36 {
            return false;
        }

        let is_hex = |b: u8| b.is_ascii_hexdigit();
        let is_ver = |b: u8| matches!(b, b'1'..=b'8');
        let is_variant = |b: u8| matches!(b, b'8' | b'9' | b'a' | b'b' | b'A' | b'B');

        for (idx, byte) in bytes.iter().enumerate() {
            match idx {
                8 | 13 | 18 | 23 => {
                    if *byte != b'-' {
                        return false;
                    }
                }
                14 => {
                    if !is_ver(*byte) {
                        return false;
                    }
                }
                19 => {
                    if !is_variant(*byte) {
                        return false;
                    }
                }
                _ => {
                    if !is_hex(*byte) {
                        return false;
                    }
                }
            }
        }
        true
    }

    fn log_response(status: reqwest::StatusCode, body: &str) {
        if status.is_success() {
            debug!("API response status: {}", status);
            return;
        }

        let mut preview = body.chars().take(MAX_LOG_BODY_CHARS).collect::<String>();
        if body.chars().count() > MAX_LOG_BODY_CHARS {
            preview.push_str("...");
        }
        debug!("API response error ({}): {}", status, preview);
    }

    fn snapshot_from_cursor_latest(value: SyncLatestSnapshotRef) -> SnapshotLatestResponse {
        SnapshotLatestResponse {
            snapshot_id: value.snapshot_id,
            schema_version: value.schema_version,
            covers_tables: Vec::new(),
            oplog_seq: value.oplog_seq,
            size_bytes: 0,
            checksum: String::new(),
            created_at: String::new(),
        }
    }

    fn choose_snapshot_from_latest_and_cursor(
        latest: SnapshotLatestResponse,
        cursor_latest: Option<SyncLatestSnapshotRef>,
    ) -> SnapshotLatestResponse {
        let latest_id = latest.snapshot_id.trim();
        let Some(cursor_latest) = cursor_latest else {
            return latest;
        };
        let cursor_id = cursor_latest.snapshot_id.trim();
        if cursor_id.is_empty() {
            return latest;
        }

        let latest_is_strict_uuid = Self::is_backend_strict_uuid(latest_id);
        let cursor_is_strict_uuid = Self::is_backend_strict_uuid(cursor_id);

        if !latest_is_strict_uuid && cursor_is_strict_uuid {
            debug!(
                "Using cursor latest snapshot id '{}' over non-UUID snapshots/latest id '{}'",
                cursor_id, latest_id
            );
            return Self::snapshot_from_cursor_latest(cursor_latest);
        }

        if cursor_latest.oplog_seq > latest.oplog_seq {
            debug!(
                "Using cursor latest snapshot id '{}' because oplog_seq {} > snapshots/latest {}",
                cursor_id, cursor_latest.oplog_seq, latest.oplog_seq
            );
            return Self::snapshot_from_cursor_latest(cursor_latest);
        }

        latest
    }

    fn snapshot_download_url(&self, snapshot_id: &str) -> Result<reqwest::Url> {
        let snapshot_id = snapshot_id.trim();
        if snapshot_id.is_empty() {
            return Err(DeviceSyncError::invalid_request(
                "snapshot_id is required for download",
            ));
        }

        let mut url = reqwest::Url::parse(&format!("{}/api/v1/sync/snapshots/", self.base_url))
            .map_err(|err| {
                DeviceSyncError::invalid_request(format!("Invalid base URL: {}", err))
            })?;
        {
            let mut segments = url.path_segments_mut().map_err(|_| {
                DeviceSyncError::invalid_request("Invalid base URL path for snapshot download")
            })?;
            segments.pop_if_empty();
            segments.push(snapshot_id);
        }
        Ok(url)
    }

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
        Self::log_response(status, &body);

        if !status.is_success() {
            if let Ok(error) = serde_json::from_str::<ApiErrorResponse>(&body) {
                let code = if error.code.is_empty() {
                    error.error
                } else {
                    error.code
                };
                return Err(DeviceSyncError::api_structured(
                    status.as_u16(),
                    code,
                    error.message,
                    error.details,
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

    /// Parse a binary response body while preserving API error handling.
    async fn parse_binary_response(response: reqwest::Response) -> Result<reqwest::Response> {
        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }

        let body = response.text().await?;
        Self::log_response(status, &body);
        if let Ok(error) = serde_json::from_str::<ApiErrorResponse>(&body) {
            let code = if error.code.is_empty() {
                error.error
            } else {
                error.code
            };
            return Err(DeviceSyncError::api_structured(
                status.as_u16(),
                code,
                error.message,
                error.details,
            ));
        }

        Err(DeviceSyncError::api(
            status.as_u16(),
            format!("Request failed: {}", body),
        ))
    }

    fn parse_required_header_i32(headers: &HeaderMap, name: &'static str) -> Result<i32> {
        headers
            .get(name)
            .ok_or_else(|| DeviceSyncError::invalid_request(format!("Missing header {}", name)))?
            .to_str()
            .map_err(|_| DeviceSyncError::invalid_request(format!("Invalid header {}", name)))?
            .parse::<i32>()
            .map_err(|_| DeviceSyncError::invalid_request(format!("Invalid header {}", name)))
    }

    fn parse_required_header_string(headers: &HeaderMap, name: &'static str) -> Result<String> {
        Ok(headers
            .get(name)
            .ok_or_else(|| DeviceSyncError::invalid_request(format!("Missing header {}", name)))?
            .to_str()
            .map_err(|_| DeviceSyncError::invalid_request(format!("Invalid header {}", name)))?
            .to_string())
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
    // Sync Events + Snapshots
    // ─────────────────────────────────────────────────────────────────────────

    /// Push local outbox events.
    ///
    /// POST /api/v1/sync/events/push
    pub async fn push_events(
        &self,
        token: &str,
        device_id: &str,
        req: SyncPushRequest,
    ) -> Result<SyncPushResponse> {
        let url = format!("{}/api/v1/sync/events/push", self.base_url);
        let response = self
            .client
            .post(&url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .json(&req)
            .send()
            .await?;
        Self::parse_response(response).await
    }

    /// Pull remote events after a cursor.
    ///
    /// GET /api/v1/sync/events/pull?since={cursor}&limit={n}
    pub async fn pull_events(
        &self,
        token: &str,
        device_id: &str,
        since: Option<i64>,
        limit: Option<i32>,
    ) -> Result<SyncPullResponse> {
        let url = format!("{}/api/v1/sync/events/pull", self.base_url);
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(value) = since {
            query.push(("since", value.to_string()));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }

        let mut request = self
            .client
            .get(&url)
            .headers(self.headers_with_device(token, Some(device_id))?);
        if !query.is_empty() {
            request = request.query(&query);
        }
        let response = request.send().await?;
        Self::parse_response(response).await
    }

    /// Get the reconcile-ready-state for this device.
    ///
    /// GET /api/v1/sync/events/reconcile-ready-state
    pub async fn get_reconcile_ready_state(
        &self,
        token: &str,
        device_id: &str,
    ) -> Result<ReconcileReadyStateResponse> {
        let url = format!("{}/api/v1/sync/events/reconcile-ready-state", self.base_url);
        let response = self
            .client
            .get(url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .send()
            .await?;
        Self::parse_response(response).await
    }

    /// Get lightweight current server cursor.
    ///
    /// GET /api/v1/sync/events/cursor
    pub async fn get_events_cursor(
        &self,
        token: &str,
        device_id: &str,
    ) -> Result<SyncCursorResponse> {
        let url = format!("{}/api/v1/sync/events/cursor", self.base_url);
        let response = self
            .client
            .get(url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .send()
            .await?;
        Self::parse_response(response).await
    }

    /// Get metadata for the latest available snapshot.
    ///
    /// GET /api/v1/sync/snapshots/latest
    pub async fn get_latest_snapshot(
        &self,
        token: &str,
        device_id: &str,
    ) -> Result<SnapshotLatestResponse> {
        let url = format!("{}/api/v1/sync/snapshots/latest", self.base_url);
        let response = self
            .client
            .get(url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .send()
            .await?;
        Self::parse_response(response).await
    }

    /// Resolve latest snapshot with server-bug fallback to /events/cursor.latest_snapshot.
    pub async fn get_latest_snapshot_with_cursor_fallback(
        &self,
        token: &str,
        device_id: &str,
    ) -> Result<Option<SnapshotLatestResponse>> {
        match self.get_latest_snapshot(token, device_id).await {
            Ok(snapshot) => {
                let snapshot_id = snapshot.snapshot_id.trim();
                if snapshot_id.is_empty() {
                    let cursor = self.get_events_cursor(token, device_id).await?;
                    return Ok(cursor
                        .latest_snapshot
                        .map(Self::snapshot_from_cursor_latest));
                }
                if Self::is_backend_strict_uuid(snapshot_id) {
                    return Ok(Some(snapshot));
                }
                match self.get_events_cursor(token, device_id).await {
                    Ok(cursor) => Ok(Some(Self::choose_snapshot_from_latest_and_cursor(
                        snapshot,
                        cursor.latest_snapshot,
                    ))),
                    Err(err) => {
                        debug!(
                            "Failed to resolve cursor fallback for non-UUID snapshots/latest id '{}': {}. Using snapshots/latest.",
                            snapshot_id, err
                        );
                        Ok(Some(snapshot))
                    }
                }
            }
            Err(err) if err.is_snapshot_id_validation_error() => {
                let cursor = self.get_events_cursor(token, device_id).await?;
                Ok(cursor
                    .latest_snapshot
                    .map(Self::snapshot_from_cursor_latest))
            }
            Err(err) => Err(err),
        }
    }

    /// Download encrypted snapshot blob and metadata headers.
    ///
    /// GET /api/v1/sync/snapshots/{snapshotId}
    pub async fn download_snapshot(
        &self,
        token: &str,
        device_id: &str,
        snapshot_id: &str,
    ) -> Result<(SnapshotDownloadHeaders, Vec<u8>)> {
        let url = self.snapshot_download_url(snapshot_id)?;
        let response = self
            .client
            .get(url)
            .headers(self.headers_with_device(token, Some(device_id))?)
            .send()
            .await?;
        let response = Self::parse_binary_response(response).await?;
        let headers = response.headers().clone();
        let body = response.bytes().await?.to_vec();

        let raw_tables = Self::parse_required_header_string(&headers, "x-snapshot-covers-tables")?;
        let snapshot_headers = SnapshotDownloadHeaders {
            schema_version: Self::parse_required_header_i32(&headers, "x-snapshot-schema-version")?,
            covers_tables: raw_tables
                .split(',')
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect(),
            checksum: Self::parse_required_header_string(&headers, "x-snapshot-checksum")?,
        };

        Ok((snapshot_headers, body))
    }

    /// Upload a snapshot blob.
    ///
    /// The client performs single-call idempotent upload with retry hardening:
    /// - validates size/checksum against payload bytes
    /// - reuses the same `X-Snapshot-Event-Id` across retries
    /// - retries transient/unknown-outcome failures with exponential backoff + jitter
    ///
    /// POST /api/v1/sync/snapshots/upload
    pub async fn upload_snapshot(
        &self,
        token: &str,
        device_id: &str,
        upload_headers: SnapshotUploadHeaders,
        payload: Vec<u8>,
    ) -> Result<SnapshotUploadResponse> {
        self.upload_snapshot_with_cancel_flag(token, device_id, upload_headers, payload, None)
            .await
    }

    /// Upload a snapshot blob with cooperative cancellation support.
    pub async fn upload_snapshot_with_cancel_flag(
        &self,
        token: &str,
        device_id: &str,
        mut upload_headers: SnapshotUploadHeaders,
        payload: Vec<u8>,
        cancel_flag: Option<&AtomicBool>,
    ) -> Result<SnapshotUploadResponse> {
        if payload.len() > i64::MAX as usize {
            return Err(DeviceSyncError::invalid_request(
                "Snapshot payload is too large for size header",
            ));
        }
        let payload_size = payload.len() as i64;
        if upload_headers.size_bytes != payload_size {
            return Err(DeviceSyncError::invalid_request(format!(
                "Snapshot size header mismatch: header={} payload={}",
                upload_headers.size_bytes, payload_size
            )));
        }
        if !is_valid_sha256_checksum(&upload_headers.checksum) {
            return Err(DeviceSyncError::invalid_request(
                "Invalid snapshot checksum format; expected sha256:<hex>",
            ));
        }
        let computed_checksum = compute_sha256_checksum(&payload);
        if !upload_headers
            .checksum
            .eq_ignore_ascii_case(&computed_checksum)
        {
            return Err(DeviceSyncError::invalid_request(
                "Snapshot checksum does not match payload bytes",
            ));
        }
        upload_headers.checksum = computed_checksum.to_ascii_lowercase();

        let stable_event_id = match upload_headers.event_id.take() {
            Some(value) => {
                Uuid::parse_str(&value)
                    .map_err(|_| DeviceSyncError::invalid_request("Invalid snapshot event ID"))?;
                value
            }
            None => Uuid::new_v4().to_string(),
        };
        upload_headers.event_id = Some(stable_event_id.clone());

        let dedupe_key = format!(
            "{}:{}",
            device_id,
            upload_headers
                .event_id
                .as_deref()
                .unwrap_or("missing_snapshot_event_id")
        );
        {
            let mut in_flight = snapshot_upload_in_flight().lock().await;
            if !in_flight.insert(dedupe_key.clone()) {
                return Err(DeviceSyncError::invalid_request(
                    "Snapshot upload already in progress for this snapshot event",
                ));
            }
        }

        let result = self
            .upload_snapshot_with_retry(token, device_id, &upload_headers, payload, cancel_flag)
            .await;

        let mut in_flight = snapshot_upload_in_flight().lock().await;
        in_flight.remove(&dedupe_key);
        result
    }

    async fn upload_snapshot_with_retry(
        &self,
        token: &str,
        device_id: &str,
        upload_headers: &SnapshotUploadHeaders,
        payload: Vec<u8>,
        cancel_flag: Option<&AtomicBool>,
    ) -> Result<SnapshotUploadResponse> {
        let url = format!("{}/api/v1/sync/snapshots/upload", self.base_url);
        let mut attempt = 0usize;

        loop {
            if cancel_flag
                .map(|flag| flag.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                return Err(DeviceSyncError::invalid_request(
                    "Snapshot upload cancelled",
                ));
            }

            attempt = attempt.saturating_add(1);
            let mut headers = self.headers_with_device(token, Some(device_id))?;
            headers.insert(
                CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            );
            if let Some(event_id) = upload_headers.event_id.as_deref() {
                headers.insert(
                    "x-snapshot-event-id",
                    HeaderValue::from_str(event_id).map_err(|_| {
                        DeviceSyncError::invalid_request("Invalid snapshot event ID")
                    })?,
                );
            }
            headers.insert(
                "x-snapshot-schema-version",
                HeaderValue::from_str(&upload_headers.schema_version.to_string()).map_err(
                    |_| DeviceSyncError::invalid_request("Invalid snapshot schema version"),
                )?,
            );
            headers.insert(
                "x-snapshot-covers-tables",
                HeaderValue::from_str(&upload_headers.covers_tables.join(",")).map_err(|_| {
                    DeviceSyncError::invalid_request("Invalid snapshot covers tables")
                })?,
            );
            headers.insert(
                "x-snapshot-size-bytes",
                HeaderValue::from_str(&upload_headers.size_bytes.to_string())
                    .map_err(|_| DeviceSyncError::invalid_request("Invalid snapshot size"))?,
            );
            headers.insert(
                CONTENT_LENGTH,
                HeaderValue::from_str(&upload_headers.size_bytes.to_string())
                    .map_err(|_| DeviceSyncError::invalid_request("Invalid snapshot size"))?,
            );
            headers.insert(
                "x-snapshot-checksum",
                HeaderValue::from_str(&upload_headers.checksum)
                    .map_err(|_| DeviceSyncError::invalid_request("Invalid snapshot checksum"))?,
            );
            headers.insert(
                "x-snapshot-metadata-payload",
                HeaderValue::from_str(&upload_headers.metadata_payload).map_err(|_| {
                    DeviceSyncError::invalid_request("Invalid snapshot metadata payload")
                })?,
            );
            headers.insert(
                "x-snapshot-payload-key-version",
                HeaderValue::from_str(&upload_headers.payload_key_version.to_string()).map_err(
                    |_| DeviceSyncError::invalid_request("Invalid snapshot payload key version"),
                )?,
            );
            if let Some(base_seq) = upload_headers.base_seq {
                headers.insert("x-snapshot-base-seq", HeaderValue::from(base_seq));
            }

            let send_result = self
                .client
                .post(&url)
                .headers(headers)
                .body(payload.clone())
                .send()
                .await;

            match send_result {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        return Self::parse_response(response).await;
                    }

                    let body = response.text().await?;
                    Self::log_response(status, &body);
                    let error = if let Ok(api_error) =
                        serde_json::from_str::<ApiErrorResponse>(&body)
                    {
                        let code = if api_error.code.is_empty() {
                            api_error.error
                        } else {
                            api_error.code
                        };
                        DeviceSyncError::api_structured(
                            status.as_u16(),
                            code,
                            api_error.message,
                            api_error.details,
                        )
                    } else {
                        DeviceSyncError::api(status.as_u16(), format!("Request failed: {}", body))
                    };

                    if is_retryable_snapshot_status(status.as_u16())
                        && attempt < SNAPSHOT_UPLOAD_MAX_ATTEMPTS
                    {
                        let backoff = snapshot_backoff_with_jitter(attempt);
                        debug!(
                            "Snapshot upload retry attempt {}/{} after HTTP {} (event_id={})",
                            attempt + 1,
                            SNAPSHOT_UPLOAD_MAX_ATTEMPTS,
                            status.as_u16(),
                            upload_headers.event_id.as_deref().unwrap_or("none")
                        );
                        sleep(backoff).await;
                        continue;
                    }
                    return Err(error);
                }
                Err(err) => {
                    if is_retryable_transport_error(&err) && attempt < SNAPSHOT_UPLOAD_MAX_ATTEMPTS
                    {
                        let backoff = snapshot_backoff_with_jitter(attempt);
                        debug!(
                            "Snapshot upload retry attempt {}/{} after transport error (event_id={}): {}",
                            attempt + 1,
                            SNAPSHOT_UPLOAD_MAX_ATTEMPTS,
                            upload_headers.event_id.as_deref().unwrap_or("none"),
                            err
                        );
                        sleep(backoff).await;
                        continue;
                    }
                    return Err(DeviceSyncError::Http(err));
                }
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, VecDeque};
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::Mutex as TokioMutex;

    fn latest_snapshot(snapshot_id: &str, oplog_seq: i64) -> SnapshotLatestResponse {
        SnapshotLatestResponse {
            snapshot_id: snapshot_id.to_string(),
            schema_version: 1,
            covers_tables: Vec::new(),
            oplog_seq,
            size_bytes: 0,
            checksum: String::new(),
            created_at: String::new(),
        }
    }

    fn cursor_snapshot(snapshot_id: &str, oplog_seq: i64) -> SyncLatestSnapshotRef {
        SyncLatestSnapshotRef {
            snapshot_id: snapshot_id.to_string(),
            schema_version: 1,
            oplog_seq,
        }
    }

    #[derive(Debug, Clone)]
    struct CapturedUploadRequest {
        event_id: Option<String>,
        content_length: Option<String>,
        snapshot_size_bytes: Option<String>,
    }

    #[derive(Debug, Clone)]
    enum MockUploadOutcome {
        DropConnection,
        Respond {
            status: u16,
            body: String,
            delay_ms: u64,
        },
    }

    fn success_upload_body(snapshot_id: &str) -> String {
        format!(
            r#"{{"snapshotId":"{}","r2Key":"snapshots/test/{}","oplogSeq":123,"createdAt":"2026-01-01T00:00:00.000Z"}}"#,
            snapshot_id, snapshot_id
        )
    }

    fn api_error_body(code: &str, message: &str) -> String {
        format!(
            r#"{{"error":"error","code":"{}","message":"{}"}}"#,
            code, message
        )
    }

    fn build_upload_headers(event_id: Option<String>, payload: &[u8]) -> SnapshotUploadHeaders {
        SnapshotUploadHeaders {
            event_id,
            schema_version: 1,
            covers_tables: vec!["accounts".to_string(), "assets".to_string()],
            size_bytes: payload.len() as i64,
            checksum: compute_sha256_checksum(payload),
            metadata_payload: "meta".to_string(),
            payload_key_version: 1,
            base_seq: None,
        }
    }

    fn header_end_offset(buffer: &[u8]) -> Option<usize> {
        buffer.windows(4).position(|window| window == b"\r\n\r\n")
    }

    async fn read_http_request(
        stream: &mut tokio::net::TcpStream,
    ) -> Option<(HashMap<String, String>, usize)> {
        let mut buffer = Vec::new();
        loop {
            let mut chunk = [0_u8; 2048];
            let read = stream.read(&mut chunk).await.ok()?;
            if read == 0 {
                return None;
            }
            buffer.extend_from_slice(&chunk[..read]);
            if header_end_offset(&buffer).is_some() {
                break;
            }
        }

        let header_end = header_end_offset(&buffer)?;
        let head = String::from_utf8_lossy(&buffer[..header_end]).to_string();
        let mut lines = head.lines();
        let _request_line = lines.next()?.to_string();

        let mut headers = HashMap::new();
        for line in lines {
            if let Some((name, value)) = line.split_once(':') {
                headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
            }
        }

        let content_length = headers
            .get("content-length")
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(0);

        let mut body_read = buffer.len().saturating_sub(header_end + 4);
        while body_read < content_length {
            let mut chunk = [0_u8; 2048];
            let read = stream.read(&mut chunk).await.ok()?;
            if read == 0 {
                break;
            }
            body_read = body_read.saturating_add(read);
        }

        Some((headers, content_length))
    }

    fn status_text(status: u16) -> &'static str {
        match status {
            200 => "OK",
            201 => "Created",
            400 => "Bad Request",
            408 => "Request Timeout",
            429 => "Too Many Requests",
            500 => "Internal Server Error",
            _ => "Error",
        }
    }

    async fn write_http_response(
        stream: &mut tokio::net::TcpStream,
        status: u16,
        body: &str,
    ) -> std::io::Result<()> {
        let response = format!(
            "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            status,
            status_text(status),
            body.len(),
            body
        );
        stream.write_all(response.as_bytes()).await?;
        stream.flush().await
    }

    async fn start_mock_upload_server(
        outcomes: Vec<MockUploadOutcome>,
    ) -> (
        String,
        Arc<TokioMutex<Vec<CapturedUploadRequest>>>,
        tokio::task::JoinHandle<()>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test listener");
        let addr = listener.local_addr().expect("listener addr");
        let captured = Arc::new(TokioMutex::new(Vec::<CapturedUploadRequest>::new()));
        let scripted = Arc::new(TokioMutex::new(VecDeque::from(outcomes)));
        let captured_clone = Arc::clone(&captured);
        let scripted_clone = Arc::clone(&scripted);

        let handle = tokio::spawn(async move {
            loop {
                let (mut stream, _) = match listener.accept().await {
                    Ok(value) => value,
                    Err(_) => break,
                };
                let captured_inner = Arc::clone(&captured_clone);
                let scripted_inner = Arc::clone(&scripted_clone);
                tokio::spawn(async move {
                    let Some((headers, _content_length)) = read_http_request(&mut stream).await
                    else {
                        return;
                    };
                    let event_id = headers.get("x-snapshot-event-id").cloned();
                    let content_length = headers.get("content-length").cloned();
                    let snapshot_size_bytes = headers.get("x-snapshot-size-bytes").cloned();
                    captured_inner.lock().await.push(CapturedUploadRequest {
                        event_id,
                        content_length,
                        snapshot_size_bytes,
                    });

                    let outcome = scripted_inner.lock().await.pop_front().unwrap_or(
                        MockUploadOutcome::Respond {
                            status: 500,
                            body: api_error_body("INTERNAL", "unexpected request"),
                            delay_ms: 0,
                        },
                    );

                    match outcome {
                        MockUploadOutcome::DropConnection => {}
                        MockUploadOutcome::Respond {
                            status,
                            body,
                            delay_ms,
                        } => {
                            if delay_ms > 0 {
                                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                            }
                            let _ = write_http_response(&mut stream, status, &body).await;
                        }
                    }
                });
            }
        });

        (format!("http://{}", addr), captured, handle)
    }

    #[test]
    fn choose_snapshot_prefers_cursor_when_latest_id_is_non_uuid_and_cursor_is_uuid() {
        let latest = latest_snapshot("snap-legacy-id", 100);
        let cursor = cursor_snapshot("019bb9fe-f707-71e9-a40d-733575f4f246", 90);

        let selected =
            DeviceSyncClient::choose_snapshot_from_latest_and_cursor(latest, Some(cursor));
        assert_eq!(selected.snapshot_id, "019bb9fe-f707-71e9-a40d-733575f4f246");
    }

    #[test]
    fn choose_snapshot_prefers_higher_oplog_seq_from_cursor() {
        let latest = latest_snapshot("019bb9fe-f707-71e9-a40d-733575f4f246", 100);
        let cursor = cursor_snapshot("019bb9fe-f707-71e9-a40d-733575f4f247", 120);

        let selected =
            DeviceSyncClient::choose_snapshot_from_latest_and_cursor(latest, Some(cursor));
        assert_eq!(selected.snapshot_id, "019bb9fe-f707-71e9-a40d-733575f4f247");
    }

    #[test]
    fn choose_snapshot_keeps_latest_when_cursor_missing() {
        let latest = latest_snapshot("019bb9fe-f707-71e9-a40d-733575f4f246", 100);

        let selected = DeviceSyncClient::choose_snapshot_from_latest_and_cursor(latest, None);
        assert_eq!(selected.snapshot_id, "019bb9fe-f707-71e9-a40d-733575f4f246");
    }

    #[test]
    fn snapshot_download_url_encodes_snapshot_id_path_segment() {
        let client = DeviceSyncClient::new("https://sync.example.com");
        let url = client
            .snapshot_download_url("snapshot/segment with spaces")
            .expect("url");

        assert_eq!(
            url.as_str(),
            "https://sync.example.com/api/v1/sync/snapshots/snapshot%2Fsegment%20with%20spaces"
        );
    }

    #[tokio::test]
    async fn snapshot_upload_retry_reuses_same_generated_event_id() {
        let (base_url, captured, server) = start_mock_upload_server(vec![
            MockUploadOutcome::Respond {
                status: 500,
                body: api_error_body("INTERNAL", "retry please"),
                delay_ms: 0,
            },
            MockUploadOutcome::Respond {
                status: 201,
                body: success_upload_body("snap-1"),
                delay_ms: 0,
            },
        ])
        .await;

        let client = DeviceSyncClient::new(&base_url);
        let payload = b"snapshot-payload".to_vec();
        let result = client
            .upload_snapshot(
                "token",
                "019bb9fe-f707-71e9-a40d-733575f4f246",
                build_upload_headers(None, &payload),
                payload,
            )
            .await
            .expect("upload success");

        assert_eq!(result.snapshot_id, "snap-1");
        let requests = captured.lock().await.clone();
        assert_eq!(requests.len(), 2);
        let first_id = requests[0].event_id.clone().expect("first event id");
        let second_id = requests[1].event_id.clone().expect("second event id");
        assert_eq!(first_id, second_id);
        assert!(Uuid::parse_str(&first_id).is_ok());
        assert_eq!(requests[0].content_length, requests[0].snapshot_size_bytes);
        assert_eq!(requests[1].content_length, requests[1].snapshot_size_bytes);

        server.abort();
    }

    #[tokio::test]
    async fn snapshot_upload_retries_unknown_outcome_with_same_event_id() {
        let stable_event_id = Uuid::new_v4().to_string();
        let (base_url, captured, server) = start_mock_upload_server(vec![
            MockUploadOutcome::DropConnection,
            MockUploadOutcome::Respond {
                status: 201,
                body: success_upload_body("snap-2"),
                delay_ms: 0,
            },
        ])
        .await;

        let client = DeviceSyncClient::new(&base_url);
        let payload = b"snapshot-payload-unknown".to_vec();
        let result = client
            .upload_snapshot(
                "token",
                "019bb9fe-f707-71e9-a40d-733575f4f246",
                build_upload_headers(Some(stable_event_id.clone()), &payload),
                payload,
            )
            .await
            .expect("upload success after retry");

        assert_eq!(result.snapshot_id, "snap-2");
        let requests = captured.lock().await.clone();
        assert_eq!(requests.len(), 2);
        assert_eq!(
            requests[0].event_id.as_deref(),
            Some(stable_event_id.as_str())
        );
        assert_eq!(
            requests[1].event_id.as_deref(),
            Some(stable_event_id.as_str())
        );

        server.abort();
    }

    #[tokio::test]
    async fn snapshot_upload_accepts_idempotent_200_response() {
        let (base_url, _captured, server) =
            start_mock_upload_server(vec![MockUploadOutcome::Respond {
                status: 200,
                body: success_upload_body("snap-idempotent"),
                delay_ms: 0,
            }])
            .await;

        let client = DeviceSyncClient::new(&base_url);
        let payload = b"snapshot-payload-idempotent".to_vec();
        let result = client
            .upload_snapshot(
                "token",
                "019bb9fe-f707-71e9-a40d-733575f4f246",
                build_upload_headers(None, &payload),
                payload,
            )
            .await
            .expect("idempotent 200 success");

        assert_eq!(result.snapshot_id, "snap-idempotent");
        server.abort();
    }

    #[tokio::test]
    async fn snapshot_upload_blocks_duplicate_concurrent_payload_uploads() {
        let (base_url, captured, server) =
            start_mock_upload_server(vec![MockUploadOutcome::Respond {
                status: 201,
                body: success_upload_body("snap-concurrent"),
                delay_ms: 450,
            }])
            .await;

        let client = DeviceSyncClient::new(&base_url);
        let payload = b"snapshot-concurrency-payload".to_vec();
        let stable_event_id = "019bb9fe-f707-71e9-a40d-733575f4f246".to_string();
        let first_headers = build_upload_headers(Some(stable_event_id.clone()), &payload);
        let second_headers = build_upload_headers(Some(stable_event_id), &payload);

        let client_for_first = client.clone();
        let first_payload = payload.clone();
        let first = tokio::spawn(async move {
            client_for_first
                .upload_snapshot(
                    "token",
                    "019bb9fe-f707-71e9-a40d-733575f4f246",
                    first_headers,
                    first_payload,
                )
                .await
        });

        tokio::time::sleep(Duration::from_millis(80)).await;
        let second = client
            .upload_snapshot(
                "token",
                "019bb9fe-f707-71e9-a40d-733575f4f246",
                second_headers,
                payload,
            )
            .await;

        match second {
            Err(DeviceSyncError::InvalidRequest(message)) => {
                assert!(message.contains("already in progress"));
            }
            other => panic!("expected duplicate-in-flight guard error, got {:?}", other),
        }

        let first_result = first
            .await
            .expect("first task join")
            .expect("first upload ok");
        assert_eq!(first_result.snapshot_id, "snap-concurrent");
        let requests = captured.lock().await.clone();
        assert_eq!(requests.len(), 1);

        server.abort();
    }
}
