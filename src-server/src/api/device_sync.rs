//! Device sync API endpoints for the web server.
//!
//! This module provides REST endpoints that mirror the Tauri device sync commands,
//! using the shared wealthfolio-device-sync crate for cloud API communication.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use crate::error::{ApiError, ApiResult};
use crate::main_lib::AppState;
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

/// Get the access token from secret store.
fn get_access_token(state: &AppState) -> ApiResult<String> {
    state
        .secret_store
        .get_secret(CLOUD_ACCESS_TOKEN_KEY)
        .map_err(|e| ApiError::Internal(format!("Failed to get access token: {}", e)))?
        .ok_or_else(|| {
            ApiError::Unauthorized("No access token configured. Please sign in first.".to_string())
        })
}

/// Get the device ID from secret store.
fn get_device_id(state: &AppState) -> Option<String> {
    match state.secret_store.get_secret(DEVICE_ID_KEY) {
        Ok(Some(id)) => {
            debug!("[DeviceSync] Using device ID from store: {}", id);
            Some(id)
        }
        Ok(None) => {
            debug!("[DeviceSync] No device ID in store");
            None
        }
        Err(e) => {
            tracing::warn!("[DeviceSync] Failed to read device ID: {}", e);
            None
        }
    }
}

/// Create a device sync client.
fn create_client() -> DeviceSyncClient {
    DeviceSyncClient::new(&cloud_api_base_url())
}

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDeviceIdRequest {
    pub device_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdResponse {
    pub device_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameDeviceRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePairingBody {
    pub code_hash: String,
    pub ephemeral_public_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPairingBody {
    pub code: String,
    pub ephemeral_public_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageBody {
    pub to_device_id: String,
    pub payload_type: String,
    pub payload: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkTrustedBody {
    pub key_version: i32,
}

// ─────────────────────────────────────────────────────────────────────────────
// Device ID Management
// ─────────────────────────────────────────────────────────────────────────────

async fn get_device_id_endpoint(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<DeviceIdResponse>> {
    let device_id = state
        .secret_store
        .get_secret(DEVICE_ID_KEY)
        .map_err(|e| ApiError::Internal(format!("Failed to get device ID: {}", e)))?;

    Ok(Json(DeviceIdResponse { device_id }))
}

async fn set_device_id_endpoint(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SetDeviceIdRequest>,
) -> ApiResult<Json<()>> {
    state
        .secret_store
        .set_secret(DEVICE_ID_KEY, &body.device_id)
        .map_err(|e| ApiError::Internal(format!("Failed to store device ID: {}", e)))?;

    Ok(Json(()))
}

async fn clear_device_id_endpoint(State(state): State<Arc<AppState>>) -> ApiResult<Json<()>> {
    state
        .secret_store
        .delete_secret(DEVICE_ID_KEY)
        .map_err(|e| ApiError::Internal(format!("Failed to delete device ID: {}", e)))?;

    Ok(Json(()))
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Management
// ─────────────────────────────────────────────────────────────────────────────

async fn register_device(
    State(state): State<Arc<AppState>>,
    Json(device_info): Json<DeviceInfo>,
) -> ApiResult<Json<DeviceRegistrationResponse>> {
    info!("[DeviceSync] Registering device: {:?}", device_info);

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state);
    let client = create_client();

    let result = client
        .register_device(&token, device_id.as_deref(), device_info)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    // Store the device ID
    info!(
        "[DeviceSync] Storing device ID: {}",
        result.device_id
    );
    state
        .secret_store
        .set_secret(DEVICE_ID_KEY, &result.device_id)
        .map_err(|e| ApiError::Internal(format!("Failed to store device ID: {}", e)))?;

    info!(
        "[DeviceSync] Device registered successfully: {}",
        result.device_id
    );
    Ok(Json(result))
}

async fn get_current_device(State(state): State<Arc<AppState>>) -> ApiResult<Json<Device>> {
    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let device = create_client()
        .get_current_device(&token, &device_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(device))
}

async fn list_devices(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Device>>> {
    info!("[DeviceSync] Listing devices...");

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let devices = create_client()
        .list_devices(&token, &device_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    info!("[DeviceSync] Found {} devices", devices.len());
    Ok(Json(devices))
}

async fn rename_device_endpoint(
    State(state): State<Arc<AppState>>,
    Path(target_device_id): Path<String>,
    Json(body): Json<RenameDeviceRequest>,
) -> ApiResult<Json<()>> {
    info!("Renaming device {} to: {}", target_device_id, body.name);

    let token = get_access_token(&state)?;
    let my_device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    create_client()
        .rename_device(&token, &my_device_id, &target_device_id, &body.name)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(()))
}

async fn revoke_device_endpoint(
    State(state): State<Arc<AppState>>,
    Path(target_device_id): Path<String>,
) -> ApiResult<Json<()>> {
    info!("Revoking device: {}", target_device_id);

    let token = get_access_token(&state)?;
    let my_device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    create_client()
        .revoke_device(&token, &my_device_id, &target_device_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(()))
}

async fn mark_device_trusted(
    State(state): State<Arc<AppState>>,
    Path(target_device_id): Path<String>,
    Json(body): Json<MarkTrustedBody>,
) -> ApiResult<Json<()>> {
    info!(
        "Marking device {} as trusted (key version {})",
        target_device_id, body.key_version
    );

    let token = get_access_token(&state)?;
    let my_device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    create_client()
        .mark_trusted(
            &token,
            &my_device_id,
            MarkTrustedRequest {
                device_id: target_device_id,
                key_version: body.key_version,
            },
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(()))
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Status & E2EE
// ─────────────────────────────────────────────────────────────────────────────

async fn get_sync_status(State(state): State<Arc<AppState>>) -> ApiResult<Json<SyncStatus>> {
    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let status = create_client()
        .get_sync_status(&token, &device_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(status))
}

async fn enable_e2ee(State(state): State<Arc<AppState>>) -> ApiResult<Json<EnableE2eeResponse>> {
    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let result = create_client()
        .enable_e2ee(&token, &device_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(result))
}

async fn reset_sync(State(state): State<Arc<AppState>>) -> ApiResult<Json<EnableE2eeResponse>> {
    info!("[DeviceSync] Resetting sync...");

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let result = create_client()
        .reset_sync(&token, &device_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(result))
}

// ─────────────────────────────────────────────────────────────────────────────
// Pairing
// ─────────────────────────────────────────────────────────────────────────────

async fn create_pairing(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreatePairingBody>,
) -> ApiResult<Json<CreatePairingResponse>> {
    debug!("Creating pairing session...");

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let result = create_client()
        .create_pairing(
            &token,
            &device_id,
            CreatePairingRequest {
                code_hash: body.code_hash,
                ephemeral_public_key: body.ephemeral_public_key,
            },
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(result))
}

async fn claim_pairing(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ClaimPairingBody>,
) -> ApiResult<Json<ClaimPairingResponse>> {
    debug!("Claiming pairing session...");

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let result = create_client()
        .claim_pairing(
            &token,
            &device_id,
            ClaimPairingRequest {
                code: body.code,
                ephemeral_public_key: body.ephemeral_public_key,
            },
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(result))
}

async fn approve_pairing(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> ApiResult<Json<()>> {
    debug!("Approving pairing session: {}", session_id);

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    create_client()
        .approve_pairing(&token, &device_id, &session_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(()))
}

async fn cancel_pairing(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> ApiResult<Json<()>> {
    debug!("Canceling pairing session: {}", session_id);

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    create_client()
        .cancel_pairing(&token, &device_id, &session_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(()))
}

async fn get_pairing_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> ApiResult<Json<GetSessionResponse>> {
    debug!("Getting pairing session: {}", session_id);

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let result = create_client()
        .get_session(&token, &device_id, &session_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(result))
}

async fn poll_pairing_messages(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> ApiResult<Json<PollMessagesResponse>> {
    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    let result = create_client()
        .poll_messages(&token, &device_id, &session_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(result))
}

async fn send_pairing_message(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(body): Json<SendMessageBody>,
) -> ApiResult<Json<()>> {
    debug!("Sending pairing message to: {}", body.to_device_id);

    let token = get_access_token(&state)?;
    let device_id = get_device_id(&state)
        .ok_or_else(|| ApiError::BadRequest("No device ID configured".to_string()))?;

    create_client()
        .send_message(
            &token,
            &device_id,
            SendMessageRequest {
                session_id,
                to_device_id: body.to_device_id,
                payload_type: body.payload_type,
                payload: body.payload,
            },
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(()))
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // Device ID management
        .route("/sync/device/id", get(get_device_id_endpoint))
        .route("/sync/device/id", post(set_device_id_endpoint))
        .route("/sync/device/id", delete(clear_device_id_endpoint))
        // Device management
        .route("/sync/device/register", post(register_device))
        .route("/sync/device/current", get(get_current_device))
        .route("/sync/devices", get(list_devices))
        .route("/sync/device/{device_id}", patch(rename_device_endpoint))
        .route("/sync/device/{device_id}", delete(revoke_device_endpoint))
        .route("/sync/device/{device_id}/trust", post(mark_device_trusted))
        // Sync status & E2EE
        .route("/sync/status", get(get_sync_status))
        .route("/sync/e2ee/enable", post(enable_e2ee))
        .route("/sync/e2ee/reset", post(reset_sync))
        // Pairing
        .route("/sync/pairing/create", post(create_pairing))
        .route("/sync/pairing/claim", post(claim_pairing))
        .route("/sync/pairing/{session_id}", get(get_pairing_session))
        .route("/sync/pairing/{session_id}/approve", post(approve_pairing))
        .route("/sync/pairing/{session_id}/cancel", post(cancel_pairing))
        .route(
            "/sync/pairing/{session_id}/messages",
            get(poll_pairing_messages),
        )
        .route(
            "/sync/pairing/{session_id}/messages",
            post(send_pairing_message),
        )
}
