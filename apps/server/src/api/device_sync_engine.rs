use std::sync::atomic::Ordering;
use std::sync::Arc;

use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use chrono::Utc;
use uuid::Uuid;

use crate::main_lib::AppState;
use wealthfolio_core::events::DomainEvent;
use wealthfolio_core::sync::APP_SYNC_TABLES;
use wealthfolio_device_sync::engine::{
    self, CredentialStore, OutboxStore, ReadyReconcileStore, ReplayEvent, ReplayStore,
    SyncIdentity, SyncTransport, TransportError,
};
use wealthfolio_device_sync::{
    DeviceSyncClient, ReconcileReadyStateResponse, SyncPullResponse, SyncPushRequest,
    SyncPushResponse, SyncState,
};

fn transport_err_from_sync(e: wealthfolio_device_sync::DeviceSyncError) -> TransportError {
    TransportError {
        message: e.to_string(),
        retry_class: e.retry_class(),
        error_code: e.error_code().map(|s| s.to_string()),
        details: match &e {
            wealthfolio_device_sync::DeviceSyncError::Api { details, .. } => details.clone(),
            _ => None,
        },
    }
}
use wealthfolio_storage_sqlite::sync::{SqliteSyncEngineDbPorts, SyncTableRowCount};

const SYNC_IDENTITY_KEY: &str = "sync_identity";

#[derive(Debug, Clone)]
pub struct SyncEngineStatusResult {
    pub cursor: i64,
    pub last_push_at: Option<String>,
    pub last_pull_at: Option<String>,
    pub last_error: Option<String>,
    pub consecutive_failures: i32,
    pub next_retry_at: Option<String>,
    pub last_cycle_status: Option<String>,
    pub last_cycle_duration_ms: Option<i64>,
    pub background_running: bool,
    pub bootstrap_required: bool,
}

#[derive(Debug, Clone)]
pub struct SyncBootstrapOverwriteCheckTableResult {
    pub table: String,
    pub rows: i64,
}

#[derive(Debug, Clone)]
pub struct SyncBootstrapOverwriteCheckResult {
    pub bootstrap_required: bool,
    pub has_local_data: bool,
    pub local_rows: i64,
    pub non_empty_tables: Vec<SyncBootstrapOverwriteCheckTableResult>,
}

#[derive(Debug, Clone)]
pub struct SyncBootstrapResult {
    pub status: String,
    pub message: String,
    pub snapshot_id: Option<String>,
    pub cursor: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct SyncSnapshotUploadResult {
    pub status: String,
    pub snapshot_id: Option<String>,
    pub oplog_seq: Option<i64>,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct SyncReconcileReadyStateResult {
    pub status: String,
    pub message: String,
    pub bootstrap_action: String,
    pub bootstrap_status: String,
    pub bootstrap_message: Option<String>,
    pub bootstrap_snapshot_id: Option<String>,
    pub cycle_status: Option<String>,
    pub cycle_needs_bootstrap: bool,
    pub retry_attempted: bool,
    pub retry_cycle_status: Option<String>,
    pub background_status: String,
}

impl From<engine::SyncReadyReconcileResult> for SyncReconcileReadyStateResult {
    fn from(value: engine::SyncReadyReconcileResult) -> Self {
        Self {
            status: value.status,
            message: value.message,
            bootstrap_action: value.bootstrap_action,
            bootstrap_status: value.bootstrap_status,
            bootstrap_message: value.bootstrap_message,
            bootstrap_snapshot_id: value.bootstrap_snapshot_id,
            cycle_status: value.cycle_status,
            cycle_needs_bootstrap: value.cycle_needs_bootstrap,
            retry_attempted: value.retry_attempted,
            retry_cycle_status: value.retry_cycle_status,
            background_status: value.background_status,
        }
    }
}

fn cloud_api_base_url() -> String {
    crate::features::cloud_api_base_url().unwrap_or_default()
}

fn ensure_device_sync_enabled() -> Result<(), String> {
    if crate::features::device_sync_enabled() {
        Ok(())
    } else {
        Err("Device sync feature is disabled in this build.".to_string())
    }
}

fn create_client() -> DeviceSyncClient {
    DeviceSyncClient::new(&cloud_api_base_url())
}

fn get_sync_identity_from_store(state: &AppState) -> Option<SyncIdentity> {
    let raw = state
        .secret_store
        .get_secret(SYNC_IDENTITY_KEY)
        .ok()
        .flatten()?;
    let identity: wealthfolio_device_sync::SyncIdentity = serde_json::from_str(&raw).ok()?;
    Some(SyncIdentity {
        device_id: identity.device_id,
        root_key: identity.root_key,
        key_version: identity.key_version,
    })
}

async fn persist_device_config_from_identity(
    state: &AppState,
    identity: &SyncIdentity,
    trust_state: &str,
) {
    if let Some(device_id) = &identity.device_id {
        let _ = state
            .app_sync_repository
            .upsert_device_config(
                device_id.clone(),
                identity.key_version,
                trust_state.to_string(),
            )
            .await;
    }
}

fn encrypt_sync_payload(
    plaintext_payload: &str,
    identity: &SyncIdentity,
    payload_key_version: i32,
) -> Result<String, String> {
    let root_key = identity
        .root_key
        .as_ref()
        .ok_or_else(|| "Sync root key is not configured".to_string())?;
    let key_version = payload_key_version.max(1) as u32;
    let dek = wealthfolio_device_sync::crypto::derive_dek(root_key, key_version)
        .map_err(|e| format!("Failed to derive event DEK: {}", e))?;
    wealthfolio_device_sync::crypto::encrypt(&dek, plaintext_payload)
        .map_err(|e| format!("Failed to encrypt sync payload: {}", e))
}

fn decrypt_sync_payload(
    encrypted_payload: &str,
    identity: &SyncIdentity,
    payload_key_version: i32,
) -> Result<String, String> {
    let root_key = identity
        .root_key
        .as_ref()
        .ok_or_else(|| "Sync root key is not configured".to_string())?;
    let key_version = payload_key_version.max(1) as u32;
    let dek = wealthfolio_device_sync::crypto::derive_dek(root_key, key_version)
        .map_err(|e| format!("Failed to derive event DEK: {}", e))?;
    wealthfolio_device_sync::crypto::decrypt(&dek, encrypted_payload)
        .map_err(|e| format!("Failed to decrypt sync payload: {}", e))
}

fn is_sqlite_image(bytes: &[u8]) -> bool {
    bytes.starts_with(b"SQLite format 3\0")
}

fn sha256_checksum(bytes: &[u8]) -> String {
    wealthfolio_device_sync::crypto::sha256_checksum(bytes)
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

struct ServerEnginePorts {
    state: Arc<AppState>,
    db: SqliteSyncEngineDbPorts,
}

impl ServerEnginePorts {
    fn new(state: Arc<AppState>) -> Self {
        let db = SqliteSyncEngineDbPorts::new(Arc::clone(&state.app_sync_repository));
        Self { state, db }
    }
}

#[async_trait]
impl OutboxStore for ServerEnginePorts {
    async fn list_pending_outbox(
        &self,
        limit: i64,
    ) -> Result<Vec<wealthfolio_core::sync::SyncOutboxEvent>, String> {
        self.db.list_pending_outbox(limit).await
    }

    async fn mark_outbox_dead(
        &self,
        event_ids: Vec<String>,
        error_message: Option<String>,
        error_code: Option<String>,
    ) -> Result<(), String> {
        self.db
            .mark_outbox_dead(event_ids, error_message, error_code)
            .await
    }

    async fn mark_outbox_sent(&self, event_ids: Vec<String>) -> Result<(), String> {
        self.db.mark_outbox_sent(event_ids).await
    }

    async fn schedule_outbox_retry(
        &self,
        event_ids: Vec<String>,
        delay_seconds: i64,
        error_message: Option<String>,
        error_code: Option<String>,
    ) -> Result<(), String> {
        self.db
            .schedule_outbox_retry(event_ids, delay_seconds, error_message, error_code)
            .await
    }

    async fn mark_push_completed(&self) -> Result<(), String> {
        self.db.mark_push_completed().await
    }

    async fn has_pending_outbox(&self) -> Result<bool, String> {
        self.db.has_pending_outbox().await
    }
}

#[async_trait]
impl ReplayStore for ServerEnginePorts {
    async fn acquire_cycle_lock(&self) -> Result<i64, String> {
        self.db.acquire_cycle_lock().await
    }

    async fn verify_cycle_lock(&self, lock_version: i64) -> Result<bool, String> {
        self.db.verify_cycle_lock(lock_version).await
    }

    async fn get_cursor(&self) -> Result<i64, String> {
        self.db.get_cursor().await
    }

    async fn set_cursor(&self, cursor: i64) -> Result<(), String> {
        self.db.set_cursor(cursor).await
    }

    async fn apply_remote_events_lww_batch(
        &self,
        events: Vec<ReplayEvent>,
    ) -> Result<usize, String> {
        self.db.apply_remote_events_lww_batch(events).await
    }

    async fn apply_remote_event_lww(&self, event: ReplayEvent) -> Result<bool, String> {
        self.db.apply_remote_event_lww(event).await
    }

    async fn mark_pull_completed(&self) -> Result<(), String> {
        self.db.mark_pull_completed().await
    }

    async fn mark_cycle_outcome(
        &self,
        status: String,
        duration_ms: i64,
        next_retry_at: Option<String>,
    ) -> Result<(), String> {
        self.db
            .mark_cycle_outcome(status, duration_ms, next_retry_at)
            .await
    }

    async fn mark_engine_error(&self, message: String) -> Result<(), String> {
        self.db.mark_engine_error(message).await
    }

    async fn prune_applied_events_up_to_seq(&self, seq: i64) -> Result<(), String> {
        self.db.prune_applied_events_up_to_seq(seq).await
    }

    async fn get_engine_status(&self) -> Result<wealthfolio_core::sync::SyncEngineStatus, String> {
        self.db.get_engine_status().await
    }

    async fn on_pull_complete(&self, pulled_count: usize) -> Result<(), String> {
        if pulled_count > 0 {
            self.state
                .domain_event_sink
                .emit(DomainEvent::device_sync_pull_complete());
        }
        Ok(())
    }
}

#[async_trait]
impl SyncTransport for ServerEnginePorts {
    async fn get_events_cursor(
        &self,
        token: &str,
        device_id: &str,
    ) -> Result<wealthfolio_device_sync::SyncCursorResponse, TransportError> {
        create_client()
            .get_events_cursor(token, device_id)
            .await
            .map_err(transport_err_from_sync)
    }

    async fn push_events(
        &self,
        token: &str,
        device_id: &str,
        request: SyncPushRequest,
    ) -> Result<SyncPushResponse, TransportError> {
        create_client()
            .push_events(token, device_id, request)
            .await
            .map_err(transport_err_from_sync)
    }

    async fn pull_events(
        &self,
        token: &str,
        device_id: &str,
        from_cursor: Option<i64>,
        limit: Option<i64>,
    ) -> Result<SyncPullResponse, TransportError> {
        create_client()
            .pull_events(
                token,
                device_id,
                from_cursor,
                limit.map(|value| value as i32),
            )
            .await
            .map_err(transport_err_from_sync)
    }

    async fn get_reconcile_ready_state(
        &self,
        token: &str,
        device_id: &str,
    ) -> Result<ReconcileReadyStateResponse, TransportError> {
        create_client()
            .get_reconcile_ready_state(token, device_id)
            .await
            .map_err(transport_err_from_sync)
    }
}

#[async_trait]
impl CredentialStore for ServerEnginePorts {
    fn get_sync_identity(&self) -> Option<SyncIdentity> {
        get_sync_identity_from_store(&self.state)
    }

    fn get_access_token(&self) -> Result<String, String> {
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current()
                .block_on(crate::api::connect::mint_access_token(&self.state))
                .map_err(|e| e.to_string())
        })
    }

    async fn get_sync_state(&self) -> Result<SyncState, String> {
        self.state
            .device_enroll_service
            .get_sync_state()
            .await
            .map(|value| value.state)
            .map_err(|err| err.message)
    }

    async fn persist_device_config(&self, identity: &SyncIdentity, trust_state: &str) {
        persist_device_config_from_identity(&self.state, identity, trust_state).await;
    }

    fn encrypt_sync_payload(
        &self,
        plaintext_payload: &str,
        identity: &SyncIdentity,
        payload_key_version: i32,
    ) -> Result<String, String> {
        encrypt_sync_payload(plaintext_payload, identity, payload_key_version)
    }

    fn decrypt_sync_payload(
        &self,
        encrypted_payload: &str,
        identity: &SyncIdentity,
        payload_key_version: i32,
    ) -> Result<String, String> {
        decrypt_sync_payload(encrypted_payload, identity, payload_key_version)
    }
}

pub async fn get_engine_status(state: &Arc<AppState>) -> Result<SyncEngineStatusResult, String> {
    ensure_device_sync_enabled()?;
    let status = state
        .app_sync_repository
        .get_engine_status()
        .map_err(|e| e.to_string())?;
    let bootstrap_required = match get_sync_identity_from_store(state).and_then(|i| i.device_id) {
        Some(device_id) => state
            .app_sync_repository
            .needs_bootstrap(&device_id)
            .map_err(|e| e.to_string())?,
        None => true,
    };
    let background_running = state.device_sync_runtime.is_background_running().await;

    Ok(SyncEngineStatusResult {
        cursor: status.cursor,
        last_push_at: status.last_push_at,
        last_pull_at: status.last_pull_at,
        last_error: status.last_error,
        consecutive_failures: status.consecutive_failures,
        next_retry_at: status.next_retry_at,
        last_cycle_status: status.last_cycle_status,
        last_cycle_duration_ms: status.last_cycle_duration_ms,
        background_running,
        bootstrap_required,
    })
}

pub async fn get_bootstrap_overwrite_check(
    state: &Arc<AppState>,
) -> Result<SyncBootstrapOverwriteCheckResult, String> {
    ensure_device_sync_enabled()?;
    let bootstrap_required = match get_sync_identity_from_store(state).and_then(|i| i.device_id) {
        Some(device_id) => state
            .app_sync_repository
            .needs_bootstrap(&device_id)
            .map_err(|e| e.to_string())?,
        None => true,
    };
    if !bootstrap_required {
        return Ok(SyncBootstrapOverwriteCheckResult {
            bootstrap_required,
            has_local_data: false,
            local_rows: 0,
            non_empty_tables: Vec::new(),
        });
    }
    let summary = state
        .app_sync_repository
        .get_local_sync_data_summary()
        .map_err(|e| e.to_string())?;

    Ok(SyncBootstrapOverwriteCheckResult {
        bootstrap_required,
        has_local_data: summary.total_rows > 0,
        local_rows: summary.total_rows,
        non_empty_tables: summary
            .non_empty_tables
            .into_iter()
            .map(
                |SyncTableRowCount { table, rows }| SyncBootstrapOverwriteCheckTableResult {
                    table,
                    rows,
                },
            )
            .collect(),
    })
}

pub async fn run_sync_cycle(state: Arc<AppState>) -> Result<engine::SyncCycleResult, String> {
    ensure_device_sync_enabled()?;
    let ports = ServerEnginePorts::new(Arc::clone(&state));
    let result = state.device_sync_runtime.run_cycle(&ports).await?;

    // Note: on_pull_complete is now called by the engine itself via ReplayStore trait

    Ok(result)
}

struct ServerReadyReconcileRunner {
    state: Arc<AppState>,
}

#[async_trait]
impl ReadyReconcileStore for ServerReadyReconcileRunner {
    async fn get_sync_state(&self) -> Result<SyncState, String> {
        self.state
            .device_enroll_service
            .get_sync_state()
            .await
            .map(|value| value.state)
            .map_err(|err| err.message)
    }

    async fn bootstrap_snapshot_if_needed(&self) -> Result<engine::SyncBootstrapResult, String> {
        let result = sync_bootstrap_snapshot_if_needed(Arc::clone(&self.state)).await?;
        Ok(engine::SyncBootstrapResult {
            status: result.status,
            message: result.message,
            snapshot_id: result.snapshot_id,
        })
    }

    async fn run_sync_cycle(&self) -> Result<engine::SyncCycleResult, String> {
        run_sync_cycle(Arc::clone(&self.state)).await
    }

    async fn ensure_background_started(&self) -> Result<bool, String> {
        ensure_background_engine_started(Arc::clone(&self.state)).await?;
        Ok(self.state.device_sync_runtime.is_background_running().await)
    }
}

pub async fn reconcile_ready_state(
    state: Arc<AppState>,
) -> Result<SyncReconcileReadyStateResult, String> {
    ensure_device_sync_enabled()?;
    let runner = ServerReadyReconcileRunner { state };
    let result = engine::run_ready_reconcile_state(&runner).await;
    Ok(result.into())
}

pub async fn ensure_background_engine_started(state: Arc<AppState>) -> Result<(), String> {
    ensure_device_sync_enabled()?;
    if get_sync_identity_from_store(&state).is_none() {
        return Ok(());
    }
    let ports = Arc::new(ServerEnginePorts::new(Arc::clone(&state)));
    state
        .device_sync_runtime
        .ensure_background_started(ports)
        .await;
    Ok(())
}

pub async fn ensure_background_engine_stopped(state: Arc<AppState>) -> Result<(), String> {
    ensure_device_sync_enabled()?;
    state.device_sync_runtime.ensure_background_stopped().await;
    Ok(())
}

fn snapshot_upload_cancelled_result(message: &str) -> SyncSnapshotUploadResult {
    SyncSnapshotUploadResult {
        status: "cancelled".to_string(),
        snapshot_id: None,
        oplog_seq: None,
        message: message.to_string(),
    }
}

pub async fn sync_bootstrap_snapshot_if_needed(
    state: Arc<AppState>,
) -> Result<SyncBootstrapResult, String> {
    ensure_device_sync_enabled()?;
    let identity = get_sync_identity_from_store(&state)
        .ok_or_else(|| "No sync identity configured. Please enable sync first.".to_string())?;
    let device_id = identity
        .device_id
        .clone()
        .ok_or_else(|| "No device ID configured".to_string())?;
    let token = crate::api::connect::mint_access_token(&state)
        .await
        .map_err(|e| e.to_string())?;

    let sync_state = state
        .device_enroll_service
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
    persist_device_config_from_identity(&state, &identity, "trusted").await;

    let sync_repo = Arc::clone(&state.app_sync_repository);
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

    let latest = match create_client()
        .get_latest_snapshot_with_cursor_fallback(&token, &device_id)
        .await
    {
        Ok(value) => value,
        Err(err) => {
            if err.status_code() == Some(404) {
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

    let (headers, blob) = match create_client()
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
        std::env::temp_dir().join(format!("wf_snapshot_server_{}.db", Uuid::new_v4()));
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

    Ok(SyncBootstrapResult {
        status: "applied".to_string(),
        message: "Snapshot bootstrap completed".to_string(),
        snapshot_id: Some(snapshot_id),
        cursor: Some(snapshot_oplog_seq),
    })
}

pub async fn generate_snapshot_now(
    state: Arc<AppState>,
) -> Result<SyncSnapshotUploadResult, String> {
    ensure_device_sync_enabled()?;
    state
        .device_sync_runtime
        .snapshot_upload_cancelled
        .store(false, Ordering::Relaxed);

    let identity = get_sync_identity_from_store(&state)
        .ok_or_else(|| "No sync identity configured. Please enable sync first.".to_string())?;
    let device_id = identity
        .device_id
        .clone()
        .ok_or_else(|| "No device ID configured".to_string())?;
    let key_version = identity.key_version.unwrap_or(1).max(1);
    let token = crate::api::connect::mint_access_token(&state)
        .await
        .map_err(|e| e.to_string())?;

    let sync_state = create_client()
        .get_device(&token, &device_id)
        .await
        .map_err(|e| e.to_string())?;
    if sync_state.trust_state != wealthfolio_device_sync::TrustState::Trusted {
        return Ok(SyncSnapshotUploadResult {
            status: "skipped".to_string(),
            snapshot_id: None,
            oplog_seq: None,
            message: "Current device is not trusted".to_string(),
        });
    }
    if state
        .device_sync_runtime
        .snapshot_upload_cancelled
        .load(Ordering::Relaxed)
    {
        return Ok(snapshot_upload_cancelled_result(
            "Snapshot upload cancelled before export",
        ));
    }

    let sqlite_bytes = state
        .app_sync_repository
        .export_snapshot_sqlite_image(APP_SYNC_TABLES.iter().map(|v| v.to_string()).collect())
        .await
        .map_err(|e| format!("Failed to export snapshot SQLite image: {}", e))?;
    if state
        .device_sync_runtime
        .snapshot_upload_cancelled
        .load(Ordering::Relaxed)
    {
        return Ok(snapshot_upload_cancelled_result(
            "Snapshot upload cancelled after export",
        ));
    }

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

    let base_seq = state.app_sync_repository.get_cursor().ok();
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

    let response = create_client()
        .upload_snapshot_with_cancel_flag(
            &token,
            &device_id,
            upload_headers,
            payload,
            Some(&state.device_sync_runtime.snapshot_upload_cancelled),
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(SyncSnapshotUploadResult {
        status: "uploaded".to_string(),
        snapshot_id: Some(response.snapshot_id),
        oplog_seq: Some(response.oplog_seq),
        message: "Snapshot uploaded".to_string(),
    })
}

pub async fn cancel_snapshot_upload(state: Arc<AppState>) {
    if !crate::features::device_sync_enabled() {
        return;
    }
    state
        .device_sync_runtime
        .snapshot_upload_cancelled
        .store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconcile_result_conversion_preserves_fields() {
        let source = engine::SyncReadyReconcileResult {
            status: "ok".to_string(),
            message: "done".to_string(),
            bootstrap_action: "none".to_string(),
            bootstrap_status: "applied".to_string(),
            bootstrap_message: Some("bootstrap ok".to_string()),
            bootstrap_snapshot_id: Some("snap-1".to_string()),
            cycle_status: Some("ok".to_string()),
            cycle_needs_bootstrap: false,
            retry_attempted: true,
            retry_cycle_status: Some("ok".to_string()),
            background_status: "started".to_string(),
        };

        let converted: SyncReconcileReadyStateResult = source.clone().into();
        assert_eq!(converted.status, source.status);
        assert_eq!(converted.message, source.message);
        assert_eq!(converted.bootstrap_status, source.bootstrap_status);
        assert_eq!(converted.bootstrap_message, source.bootstrap_message);
        assert_eq!(
            converted.bootstrap_snapshot_id,
            source.bootstrap_snapshot_id
        );
        assert_eq!(converted.cycle_status, source.cycle_status);
        assert_eq!(
            converted.cycle_needs_bootstrap,
            source.cycle_needs_bootstrap
        );
        assert_eq!(converted.retry_attempted, source.retry_attempted);
        assert_eq!(converted.retry_cycle_status, source.retry_cycle_status);
        assert_eq!(converted.background_status, source.background_status);
    }
}
