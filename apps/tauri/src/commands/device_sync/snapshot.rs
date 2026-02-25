//! Snapshot generation, upload, and bootstrap flows.

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use chrono::Utc;
use log::{debug, info};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::context::ServiceContext;
use crate::events::{emit_portfolio_trigger_recalculate, PortfolioRequestPayload};
use wealthfolio_core::quotes::MarketSyncMode;
use wealthfolio_core::sync::APP_SYNC_TABLES;
use wealthfolio_device_sync::SyncState;

use super::{
    create_client, encrypt_sync_payload, get_access_token, get_sync_identity_from_store,
    is_sqlite_image, persist_device_config_from_identity, sha256_checksum, SyncBootstrapResult,
    SyncIdentity, SyncSnapshotUploadResult,
};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotUploadProgressEvent {
    stage: String,
    progress: u8,
    message: String,
}

const DEVICE_SYNC_SNAPSHOT_UPLOAD_PROGRESS_EVENT: &str = "device-sync:snapshot-upload-progress";

fn emit_snapshot_upload_progress(
    handle: Option<&AppHandle>,
    stage: &str,
    progress: u8,
    message: &str,
) {
    if let Some(handle) = handle {
        let payload = SnapshotUploadProgressEvent {
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
        };
        let _ = handle.emit(DEVICE_SYNC_SNAPSHOT_UPLOAD_PROGRESS_EVENT, payload);
    }
}

fn snapshot_upload_cancelled_result(message: &str) -> SyncSnapshotUploadResult {
    SyncSnapshotUploadResult {
        status: "cancelled".to_string(),
        snapshot_id: None,
        oplog_seq: None,
        message: message.to_string(),
    }
}

fn decode_snapshot_sqlite_payload(
    blob: Vec<u8>,
    identity: &SyncIdentity,
) -> Result<Vec<u8>, String> {
    let root_key = identity
        .root_key
        .as_deref()
        .ok_or("Missing root_key in sync identity")?;
    let key_version = identity
        .key_version
        .ok_or("Missing key_version in sync identity")?;
    if key_version <= 0 {
        return Err("Invalid key version in sync identity".to_string());
    }

    let blob_text = String::from_utf8(blob)
        .map_err(|_| "Snapshot payload is not valid UTF-8 (expected encrypted ciphertext)")?;

    let dek = wealthfolio_device_sync::crypto::derive_dek(root_key, key_version as u32)
        .map_err(|e| format!("Failed to derive snapshot DEK: {}", e))?;
    let decrypted = wealthfolio_device_sync::crypto::decrypt(&dek, blob_text.trim())
        .map_err(|e| format!("Failed to decrypt snapshot payload: {}", e))?;

    let sqlite_bytes = BASE64_STANDARD
        .decode(decrypted.trim())
        .map_err(|e| format!("Failed to base64-decode decrypted snapshot: {}", e))?;

    if !is_sqlite_image(&sqlite_bytes) {
        return Err("Decrypted snapshot is not a valid SQLite image".to_string());
    }

    Ok(sqlite_bytes)
}

/// Bootstraps local sync tables from the latest snapshot when required.
pub async fn sync_bootstrap_snapshot_if_needed(
    handle: AppHandle,
    context: &Arc<ServiceContext>,
) -> Result<SyncBootstrapResult, String> {
    let identity = get_sync_identity_from_store()
        .ok_or_else(|| "No sync identity configured. Please enable sync first.".to_string())?;
    let device_id = identity
        .device_id
        .clone()
        .ok_or_else(|| "No device ID configured".to_string())?;
    let token = get_access_token()?;

    let sync_state = context
        .device_enroll_service()
        .get_sync_state()
        .await
        .map_err(|e| e.message)?;
    if sync_state.state != SyncState::Ready {
        return Ok(SyncBootstrapResult {
            status: "skipped".to_string(),
            message: "Device is not in READY state".to_string(),
            snapshot_id: None,
            cursor: None,
        });
    }
    persist_device_config_from_identity(context.as_ref(), &identity, "trusted").await;

    let sync_repo = context.app_sync_repository();
    if !sync_repo
        .needs_bootstrap(&device_id)
        .map_err(|e| e.to_string())?
    {
        return Ok(SyncBootstrapResult {
            status: "skipped".to_string(),
            message: "Snapshot bootstrap already completed".to_string(),
            snapshot_id: None,
            cursor: Some(sync_repo.get_cursor().map_err(|e| e.to_string())?),
        });
    }

    let client = create_client()?;
    debug!(
        "[DeviceSync] Requesting latest snapshot metadata for device {}",
        device_id
    );
    let latest = match client
        .get_latest_snapshot_with_cursor_fallback(&token, &device_id)
        .await
    {
        Ok(value) => value,
        Err(err) => {
            if err.status_code() == Some(404) {
                // No snapshot exists — this is the first device. Mark bootstrap
                // complete so we don't keep retrying.
                debug!("[DeviceSync] No snapshot found (404) — first device, skipping bootstrap");
                sync_repo
                    .mark_bootstrap_complete(device_id, identity.key_version)
                    .await
                    .map_err(|e| e.to_string())?;
                return Ok(SyncBootstrapResult {
                    status: "skipped".to_string(),
                    message: "First device — no snapshot needed".to_string(),
                    snapshot_id: None,
                    cursor: Some(sync_repo.get_cursor().map_err(|e| e.to_string())?),
                });
            }
            return Err(err.to_string());
        }
    };

    let latest = match latest {
        Some(value) => value,
        None => {
            // No snapshot available yet — mark bootstrap complete.
            debug!("[DeviceSync] No snapshot available — first device, skipping bootstrap");
            sync_repo
                .mark_bootstrap_complete(device_id, identity.key_version)
                .await
                .map_err(|e| e.to_string())?;
            return Ok(SyncBootstrapResult {
                status: "skipped".to_string(),
                message: "First device — no snapshot needed".to_string(),
                snapshot_id: None,
                cursor: Some(sync_repo.get_cursor().map_err(|e| e.to_string())?),
            });
        }
    };

    debug!(
        "[DeviceSync] Latest snapshot metadata: id='{}' schema={} oplog_seq={} size={}",
        latest.snapshot_id, latest.schema_version, latest.oplog_seq, latest.size_bytes
    );

    const LOCAL_SCHEMA_VERSION: i32 = 1;
    if latest.schema_version > LOCAL_SCHEMA_VERSION {
        return Err(format!(
            "Snapshot schema version {} is newer than local version {}. Please update the app.",
            latest.schema_version, LOCAL_SCHEMA_VERSION
        ));
    }

    let snapshot_id = latest.snapshot_id.trim().to_string();
    if snapshot_id.is_empty() {
        return Err(
            "Latest snapshot metadata had empty snapshot_id. No valid snapshot available."
                .to_string(),
        );
    }
    let snapshot_oplog_seq = latest.oplog_seq;
    let latest_checksum = if latest.checksum.trim().is_empty() {
        None
    } else {
        Some(latest.checksum)
    };
    let latest_tables = if latest.covers_tables.is_empty() {
        APP_SYNC_TABLES.iter().map(|v| v.to_string()).collect()
    } else {
        latest.covers_tables
    };

    let (headers, blob) = match client
        .download_snapshot(&token, &device_id, &snapshot_id)
        .await
    {
        Ok(value) => value,
        Err(err) => {
            if err.status_code() == Some(404) {
                return Err(format!(
                    "Snapshot {} is no longer available. No valid snapshot to download.",
                    snapshot_id
                ));
            }
            return Err(err.to_string());
        }
    };
    debug!(
        "[DeviceSync] Snapshot download response headers: schema_version={} tables={} checksum={} blob_size={}",
        headers.schema_version,
        headers.covers_tables.join(","),
        headers.checksum,
        blob.len()
    );

    let actual_checksum = sha256_checksum(&blob);
    if headers.checksum != actual_checksum {
        return Err(format!(
            "Snapshot checksum mismatch (download header): expected={}, got={}",
            headers.checksum, actual_checksum
        ));
    }
    if let Some(expected_checksum) = latest_checksum.as_ref() {
        if expected_checksum != &actual_checksum {
            return Err(format!(
                "Snapshot checksum mismatch (latest metadata): expected={}, got={}",
                expected_checksum, actual_checksum
            ));
        }
    }

    let sqlite_image = decode_snapshot_sqlite_payload(blob, &identity)?;
    let temp_snapshot_path =
        std::env::temp_dir().join(format!("wf_snapshot_{}.db", Uuid::new_v4()));
    std::fs::write(&temp_snapshot_path, sqlite_image)
        .map_err(|e| format!("Failed to persist snapshot image: {}", e))?;
    let snapshot_path_str = temp_snapshot_path.to_string_lossy().to_string();

    let mut tables_to_restore: Vec<String> = latest_tables
        .iter()
        .filter(|table| APP_SYNC_TABLES.contains(&table.as_str()))
        .map(|table| table.to_string())
        .collect();
    if tables_to_restore.is_empty() {
        tables_to_restore = APP_SYNC_TABLES
            .iter()
            .map(|table| table.to_string())
            .collect();
    }

    let restore_result = sync_repo
        .restore_snapshot_tables_from_file(
            snapshot_path_str,
            tables_to_restore,
            snapshot_oplog_seq,
            device_id,
            identity.key_version,
        )
        .await;
    let _ = std::fs::remove_file(&temp_snapshot_path);
    restore_result.map_err(|e| e.to_string())?;

    let payload = PortfolioRequestPayload::builder()
        .account_ids(None)
        .market_sync_mode(MarketSyncMode::Incremental { asset_ids: None })
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(SyncBootstrapResult {
        status: "applied".to_string(),
        message: "Snapshot bootstrap completed".to_string(),
        snapshot_id: Some(snapshot_id),
        cursor: Some(snapshot_oplog_seq),
    })
}

pub async fn generate_snapshot_now_internal(
    handle: Option<&AppHandle>,
    context: Arc<ServiceContext>,
) -> Result<SyncSnapshotUploadResult, String> {
    context
        .device_sync_runtime()
        .snapshot_upload_cancelled
        .store(false, Ordering::Relaxed);
    emit_snapshot_upload_progress(handle, "start", 5, "Preparing snapshot export");

    let identity = get_sync_identity_from_store()
        .ok_or_else(|| "No sync identity configured. Please enable sync first.".to_string())?;
    let device_id = identity
        .device_id
        .clone()
        .ok_or_else(|| "No device ID configured".to_string())?;
    let key_version = identity.key_version.unwrap_or(1).max(1);
    let token = get_access_token()?;

    let sync_state = create_client()?
        .get_device(&token, &device_id)
        .await
        .map_err(|e| e.to_string())?;
    debug!(
        "[DeviceSync] Snapshot upload eligibility: device_id={} trust_state={:?}",
        device_id, sync_state.trust_state
    );
    if sync_state.trust_state != wealthfolio_device_sync::TrustState::Trusted {
        return Ok(SyncSnapshotUploadResult {
            status: "skipped".to_string(),
            snapshot_id: None,
            oplog_seq: None,
            message: "Current device is not trusted".to_string(),
        });
    }
    if context
        .device_sync_runtime()
        .snapshot_upload_cancelled
        .load(Ordering::Relaxed)
    {
        emit_snapshot_upload_progress(handle, "cancelled", 0, "Snapshot upload cancelled");
        return Ok(snapshot_upload_cancelled_result(
            "Snapshot upload cancelled before export",
        ));
    }

    let sqlite_bytes = context
        .app_sync_repository()
        .export_snapshot_sqlite_image(APP_SYNC_TABLES.iter().map(|v| v.to_string()).collect())
        .await
        .map_err(|e| format!("Failed to export snapshot SQLite image: {}", e))?;
    emit_snapshot_upload_progress(handle, "exported", 35, "Snapshot exported");
    if context
        .device_sync_runtime()
        .snapshot_upload_cancelled
        .load(Ordering::Relaxed)
    {
        emit_snapshot_upload_progress(handle, "cancelled", 0, "Snapshot upload cancelled");
        return Ok(snapshot_upload_cancelled_result(
            "Snapshot upload cancelled after export",
        ));
    }

    // Base64-encode the raw SQLite bytes before encryption because the crypto
    // module operates on UTF-8 strings (encrypt/decrypt take &str). Binary-mode
    // encryption would avoid this overhead but isn't supported by the current API.
    let encoded_snapshot = BASE64_STANDARD.encode(sqlite_bytes);
    let encrypted_snapshot_payload =
        encrypt_sync_payload(&encoded_snapshot, &identity, key_version)?;
    let payload = encrypted_snapshot_payload.into_bytes();
    let checksum = sha256_checksum(&payload);
    let metadata_payload = encrypt_sync_payload(
        &serde_json::json!({
            "schemaVersion": 1,
            "coversTables": APP_SYNC_TABLES,
            "generatedAt": Utc::now().to_rfc3339(),
        })
        .to_string(),
        &identity,
        key_version,
    )?;

    let base_seq = context.app_sync_repository().get_cursor().ok();
    let upload_headers = wealthfolio_device_sync::SnapshotUploadHeaders {
        event_id: Some(Uuid::now_v7().to_string()),
        schema_version: 1,
        covers_tables: APP_SYNC_TABLES.iter().map(|v| v.to_string()).collect(),
        size_bytes: payload.len() as i64,
        checksum,
        metadata_payload,
        payload_key_version: key_version,
        base_seq,
    };
    let checksum_prefix = upload_headers
        .checksum
        .strip_prefix("sha256:")
        .unwrap_or(upload_headers.checksum.as_str());
    let checksum_prefix = &checksum_prefix[..checksum_prefix.len().min(12)];
    emit_snapshot_upload_progress(handle, "uploading", 70, "Uploading snapshot");
    info!(
        "[DeviceSync] Snapshot upload start device_id={} size_bytes={} key_version={} checksum=sha256:{}",
        device_id,
        upload_headers.size_bytes,
        upload_headers.payload_key_version,
        checksum_prefix
    );

    let runtime = context.device_sync_runtime();
    let upload_result = create_client()?
        .upload_snapshot_with_cancel_flag(
            &token,
            &device_id,
            upload_headers,
            payload,
            Some(&runtime.snapshot_upload_cancelled),
        )
        .await;
    let response = match upload_result {
        Ok(value) => value,
        Err(err) => {
            let message = err.to_string();
            if message.to_ascii_lowercase().contains("cancelled") {
                emit_snapshot_upload_progress(
                    handle,
                    "cancelled",
                    0,
                    "Snapshot upload cancelled during transfer",
                );
                return Ok(snapshot_upload_cancelled_result(
                    "Snapshot upload cancelled during transfer",
                ));
            }
            return Err(message);
        }
    };
    info!(
        "[DeviceSync] Snapshot upload success snapshot_id={} oplog_seq={} r2_key={}",
        response.snapshot_id, response.oplog_seq, response.r2_key
    );
    emit_snapshot_upload_progress(handle, "complete", 100, "Snapshot upload complete");

    Ok(SyncSnapshotUploadResult {
        status: "uploaded".to_string(),
        snapshot_id: Some(response.snapshot_id),
        oplog_seq: Some(response.oplog_seq),
        message: "Snapshot uploaded".to_string(),
    })
}
