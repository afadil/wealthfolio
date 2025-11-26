use crate::error::{ApiError, ApiResult};
use axum::{
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;

use crate::main_lib::AppState;

fn sync_not_supported<T>() -> ApiResult<T> {
    Err(ApiError::NotImplemented(
        "Wealthfolio Sync is not available in web mode.".into(),
    ))
}

async fn get_sync_status_web() -> ApiResult<Json<serde_json::Value>> {
    sync_not_supported()
}

async fn generate_pairing_payload_web() -> ApiResult<Json<String>> {
    sync_not_supported()
}

#[derive(serde::Deserialize)]
struct SyncPayloadBody {
    #[allow(dead_code)]
    payload: String,
}

async fn pair_and_sync_web(Json(_body): Json<SyncPayloadBody>) -> ApiResult<Json<String>> {
    sync_not_supported()
}

async fn force_full_sync_with_peer_web(
    Json(_body): Json<SyncPayloadBody>,
) -> ApiResult<Json<String>> {
    sync_not_supported()
}

#[derive(serde::Deserialize)]
struct SyncNowBody {
    #[allow(dead_code)]
    payload: SyncNowArgsBody,
}

#[derive(serde::Deserialize)]
struct SyncNowArgsBody {
    #[serde(rename = "peerId")]
    #[allow(dead_code)]
    peer_id: String,
}

async fn sync_now_web(Json(_body): Json<SyncNowBody>) -> ApiResult<StatusCode> {
    sync_not_supported()
}

async fn initialize_sync_for_existing_data_web() -> ApiResult<Json<String>> {
    sync_not_supported()
}

#[derive(serde::Deserialize)]
struct ProbeBody {
    #[allow(dead_code)]
    host: String,
    #[allow(dead_code)]
    port: u16,
}

async fn probe_local_network_access_web(Json(_body): Json<ProbeBody>) -> ApiResult<StatusCode> {
    sync_not_supported()
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/sync/status", get(get_sync_status_web))
        .route(
            "/sync/generate-pairing-payload",
            post(generate_pairing_payload_web),
        )
        .route("/sync/pair-and-sync", post(pair_and_sync_web))
        .route("/sync/force-full", post(force_full_sync_with_peer_web))
        .route("/sync/sync-now", post(sync_now_web))
        .route(
            "/sync/initialize-existing",
            post(initialize_sync_for_existing_data_web),
        )
        .route("/sync/probe", post(probe_local_network_access_web))
}
