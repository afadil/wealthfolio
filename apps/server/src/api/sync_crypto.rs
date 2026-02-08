//! Sync Crypto API endpoints for the web server.
//!
//! This module provides REST endpoints that mirror the Tauri sync crypto commands,
//! using the shared wealthfolio-device-sync crate for cryptographic operations.

use std::sync::Arc;

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::main_lib::AppState;
use wealthfolio_device_sync::crypto::{self, EphemeralKeyPair};

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeriveDekRequest {
    pub root_key: String,
    pub version: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeSharedSecretRequest {
    pub our_secret: String,
    pub their_public: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeriveSessionKeyRequest {
    pub shared_secret: String,
    pub context: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptRequest {
    pub key: String,
    pub plaintext: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptRequest {
    pub key: String,
    pub ciphertext: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashPairingCodeRequest {
    pub code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeSasRequest {
    pub shared_secret: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StringResponse {
    pub value: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

async fn generate_root_key(State(_state): State<Arc<AppState>>) -> ApiResult<Json<StringResponse>> {
    let value = crypto::generate_root_key();
    Ok(Json(StringResponse { value }))
}

async fn derive_dek(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<DeriveDekRequest>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::derive_dek(&body.root_key, body.version).map_err(ApiError::BadRequest)?;
    Ok(Json(StringResponse { value }))
}

async fn generate_keypair(
    State(_state): State<Arc<AppState>>,
) -> ApiResult<Json<EphemeralKeyPair>> {
    let keypair = crypto::generate_ephemeral_keypair();
    Ok(Json(keypair))
}

async fn compute_shared_secret(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<ComputeSharedSecretRequest>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::compute_shared_secret(&body.our_secret, &body.their_public)
        .map_err(ApiError::BadRequest)?;
    Ok(Json(StringResponse { value }))
}

async fn derive_session_key(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<DeriveSessionKeyRequest>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::derive_session_key(&body.shared_secret, &body.context)
        .map_err(ApiError::BadRequest)?;
    Ok(Json(StringResponse { value }))
}

async fn encrypt(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<EncryptRequest>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::encrypt(&body.key, &body.plaintext).map_err(ApiError::BadRequest)?;
    Ok(Json(StringResponse { value }))
}

async fn decrypt(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<DecryptRequest>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::decrypt(&body.key, &body.ciphertext).map_err(ApiError::BadRequest)?;
    Ok(Json(StringResponse { value }))
}

async fn generate_pairing_code(
    State(_state): State<Arc<AppState>>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::generate_pairing_code();
    Ok(Json(StringResponse { value }))
}

async fn hash_pairing_code(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<HashPairingCodeRequest>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::hash_pairing_code(&body.code);
    Ok(Json(StringResponse { value }))
}

async fn compute_sas(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<ComputeSasRequest>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::compute_sas(&body.shared_secret).map_err(ApiError::BadRequest)?;
    Ok(Json(StringResponse { value }))
}

async fn generate_device_id(
    State(_state): State<Arc<AppState>>,
) -> ApiResult<Json<StringResponse>> {
    let value = crypto::generate_device_id();
    Ok(Json(StringResponse { value }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/sync/crypto/generate-root-key", post(generate_root_key))
        .route("/sync/crypto/derive-dek", post(derive_dek))
        .route("/sync/crypto/generate-keypair", post(generate_keypair))
        .route(
            "/sync/crypto/compute-shared-secret",
            post(compute_shared_secret),
        )
        .route("/sync/crypto/derive-session-key", post(derive_session_key))
        .route("/sync/crypto/encrypt", post(encrypt))
        .route("/sync/crypto/decrypt", post(decrypt))
        .route(
            "/sync/crypto/generate-pairing-code",
            post(generate_pairing_code),
        )
        .route("/sync/crypto/hash-pairing-code", post(hash_pairing_code))
        .route("/sync/crypto/compute-sas", post(compute_sas))
        .route("/sync/crypto/generate-device-id", post(generate_device_id))
}
