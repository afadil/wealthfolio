use chrono::Utc;
use log::{debug, info, warn};
use std::sync::Arc;
use uuid::Uuid;
use wealthfolio_core::sync::{SyncEntity, SyncOperation};

use crate::{ApiRetryClass, SyncPushEventRequest, SyncPushRequest, SyncState};

pub mod ports;
mod runtime;

pub use ports::{
    CredentialStore, OutboxStore, ReadyReconcileStore, ReplayEvent, ReplayStore,
    SyncBootstrapResult, SyncCycleResult, SyncIdentity, SyncReadyReconcileResult, SyncTransport,
    TransportError,
};
pub use runtime::DeviceSyncRuntimeState;

/// Foreground pull cadence in seconds.
pub const DEVICE_SYNC_FOREGROUND_INTERVAL_SECS: u64 = 45;
/// Maximum jitter (seconds) added to periodic cycle intervals.
pub const DEVICE_SYNC_INTERVAL_JITTER_SECS: u64 = 5;

/// Exponential backoff in seconds with cap.
pub fn backoff_seconds(consecutive_failures: i32) -> i64 {
    const MAX_EXPONENT: i32 = 8;
    const BASE_DELAY_SECONDS: i64 = 5;

    let capped = i64::from(consecutive_failures.clamp(0, MAX_EXPONENT));
    2_i64.pow(capped as u32) * BASE_DELAY_SECONDS
}

fn remote_entity_id_is_valid(entity_id: &str) -> bool {
    Uuid::parse_str(entity_id).is_ok()
}

fn sync_entity_name(entity: &SyncEntity) -> &'static str {
    match entity {
        SyncEntity::Account => "account",
        SyncEntity::Asset => "asset",
        SyncEntity::Quote => "quote",
        SyncEntity::AssetTaxonomyAssignment => "asset_taxonomy_assignment",
        SyncEntity::Activity => "activity",
        SyncEntity::ActivityImportProfile => "activity_import_profile",
        SyncEntity::Goal => "goal",
        SyncEntity::GoalsAllocation => "goals_allocation",
        SyncEntity::AiThread => "ai_thread",
        SyncEntity::AiMessage => "ai_message",
        SyncEntity::AiThreadTag => "ai_thread_tag",
        SyncEntity::ContributionLimit => "contribution_limit",
        SyncEntity::Platform => "platform",
        SyncEntity::Snapshot => "snapshot",
    }
}

fn sync_operation_name(op: &SyncOperation) -> &'static str {
    match op {
        SyncOperation::Create => "create",
        SyncOperation::Update => "update",
        SyncOperation::Delete => "delete",
    }
}

fn retry_class_code(class: ApiRetryClass) -> &'static str {
    match class {
        ApiRetryClass::Retryable => "retryable",
        ApiRetryClass::Permanent => "permanent",
        ApiRetryClass::ReauthRequired => "reauth_required",
    }
}

fn parse_event_operation(event_type: &str) -> Option<SyncOperation> {
    let mut parts = event_type.split('.');
    let _entity = parts.next()?;
    match parts.next()? {
        "create" => Some(SyncOperation::Create),
        "update" => Some(SyncOperation::Update),
        "delete" => Some(SyncOperation::Delete),
        _ => None,
    }
}

fn millis_until_rfc3339(target: &str) -> Option<u64> {
    let target = chrono::DateTime::parse_from_rfc3339(target).ok()?;
    let now = chrono::Utc::now();
    let diff = target.with_timezone(&chrono::Utc) - now;
    if diff <= chrono::Duration::zero() {
        return Some(0);
    }
    Some(diff.num_milliseconds() as u64)
}

fn extract_bootstrap_hints(details: &Option<serde_json::Value>) -> (Option<String>, Option<i64>) {
    let Some(details) = details.as_ref() else {
        return (None, None);
    };
    let snap_id = details
        .get("latestSnapshotId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let snap_seq = details.get("latestSnapshotSeq").and_then(|v| v.as_i64());
    (snap_id, snap_seq)
}

struct CycleContext<'a, R: ReplayStore + ?Sized> {
    replay_store: &'a R,
    started_at: std::time::Instant,
    lock_version: i64,
    local_cursor: i64,
    pushed_count: usize,
    pulled_count: usize,
}

impl<'a, R: ReplayStore + ?Sized> CycleContext<'a, R> {
    async fn fail(
        &self,
        status: &str,
        message: String,
        retry_secs: Option<i64>,
    ) -> Result<SyncCycleResult, String> {
        self.replay_store
            .mark_engine_error(message)
            .await
            .map_err(|e| e.to_string())?;
        let retry_at = retry_secs.map(|s| (Utc::now() + chrono::Duration::seconds(s)).to_rfc3339());
        self.replay_store
            .mark_cycle_outcome(
                status.to_string(),
                self.started_at.elapsed().as_millis() as i64,
                retry_at,
            )
            .await
            .map_err(|e| e.to_string())?;
        Ok(SyncCycleResult {
            status: status.to_string(),
            lock_version: self.lock_version,
            pushed_count: self.pushed_count,
            pulled_count: self.pulled_count,
            cursor: self.local_cursor,
            needs_bootstrap: status == "stale_cursor",
            bootstrap_snapshot_id: None,
            bootstrap_snapshot_seq: None,
        })
    }
}

pub async fn run_sync_cycle<P>(ports: &P) -> Result<SyncCycleResult, String>
where
    P: OutboxStore + ReplayStore + SyncTransport + CredentialStore + Send + Sync,
{
    let cycle_started_at = std::time::Instant::now();

    let mut ctx = CycleContext {
        replay_store: ports,
        started_at: cycle_started_at,
        lock_version: 0,
        local_cursor: ports.get_cursor().await.unwrap_or(0),
        pushed_count: 0,
        pulled_count: 0,
    };

    let identity = match ports.get_sync_identity() {
        Some(value) => value,
        None => {
            return ctx
                .fail(
                    "config_error",
                    "No sync identity configured. Please enable sync first.".to_string(),
                    None,
                )
                .await;
        }
    };
    let device_id = match identity.device_id.clone() {
        Some(value) => value,
        None => {
            return ctx
                .fail("config_error", "No device ID configured".to_string(), None)
                .await;
        }
    };

    let runtime_state = match ports.get_sync_state().await {
        Ok(value) => value,
        Err(err) => {
            return ctx
                .fail(
                    "state_error",
                    format!("Failed to read sync state: {}", err),
                    Some(15),
                )
                .await;
        }
    };
    if runtime_state != SyncState::Ready {
        ports.persist_device_config(&identity, "untrusted").await;
        ports
            .mark_cycle_outcome(
                "not_ready".to_string(),
                cycle_started_at.elapsed().as_millis() as i64,
                None,
            )
            .await
            .map_err(|e| e.to_string())?;
        return Ok(SyncCycleResult {
            status: "not_ready".to_string(),
            lock_version: 0,
            pushed_count: 0,
            pulled_count: 0,
            cursor: ctx.local_cursor,
            needs_bootstrap: false,
            bootstrap_snapshot_id: None,
            bootstrap_snapshot_seq: None,
        });
    }

    ports.persist_device_config(&identity, "trusted").await;
    let token = match ports.get_access_token() {
        Ok(value) => value,
        Err(err) => {
            return ctx
                .fail("auth_error", format!("Auth error: {}", err), Some(30))
                .await;
        }
    };

    // Reconcile-first: ask server what action this device should take.
    let reconcile = match ports.get_reconcile_ready_state(&token, &device_id).await {
        Ok(response) => response,
        Err(err) => {
            return ctx
                .fail(
                    "reconcile_error",
                    format!("Reconcile ready state failed: {}", err),
                    Some(10),
                )
                .await;
        }
    };

    debug!(
        "[DeviceSync] Reconcile action={}, cursor={:?}",
        reconcile.action, reconcile.cursor
    );

    let has_pending = ports.has_pending_outbox().await.unwrap_or(false);
    match reconcile.action.as_str() {
        "NOOP" => {
            if !has_pending {
                debug!(
                    "[DeviceSync] Reconcile action=NOOP and no pending outbox, skipping push+pull"
                );
                ports
                    .mark_cycle_outcome(
                        "ok".to_string(),
                        ctx.started_at.elapsed().as_millis() as i64,
                        None,
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                return Ok(SyncCycleResult {
                    status: "ok".to_string(),
                    lock_version: 0,
                    pushed_count: 0,
                    pulled_count: 0,
                    cursor: ctx.local_cursor,
                    needs_bootstrap: false,
                    bootstrap_snapshot_id: None,
                    bootstrap_snapshot_seq: None,
                });
            }
            debug!("[DeviceSync] Reconcile action=NOOP but has pending outbox, proceeding with push+pull");
        }
        "BOOTSTRAP_SNAPSHOT" => {
            ports
                .mark_cycle_outcome(
                    "stale_cursor".to_string(),
                    ctx.started_at.elapsed().as_millis() as i64,
                    None,
                )
                .await
                .map_err(|e| e.to_string())?;
            return Ok(SyncCycleResult {
                status: "stale_cursor".to_string(),
                lock_version: 0,
                pushed_count: 0,
                pulled_count: 0,
                cursor: ctx.local_cursor,
                needs_bootstrap: true,
                bootstrap_snapshot_id: reconcile
                    .latest_snapshot
                    .as_ref()
                    .map(|s| s.snapshot_id.clone()),
                bootstrap_snapshot_seq: reconcile.latest_snapshot.as_ref().map(|s| s.oplog_seq),
            });
        }
        "WAIT_SNAPSHOT" => {
            ports
                .mark_cycle_outcome(
                    "wait_snapshot".to_string(),
                    ctx.started_at.elapsed().as_millis() as i64,
                    Some((Utc::now() + chrono::Duration::seconds(30)).to_rfc3339()),
                )
                .await
                .map_err(|e| e.to_string())?;
            return Ok(SyncCycleResult {
                status: "wait_snapshot".to_string(),
                lock_version: 0,
                pushed_count: 0,
                pulled_count: 0,
                cursor: ctx.local_cursor,
                needs_bootstrap: false,
                bootstrap_snapshot_id: None,
                bootstrap_snapshot_seq: None,
            });
        }
        "PULL_TAIL" => {
            // Proceed with normal push+pull flow
        }
        other => {
            log::warn!(
                "[DeviceSync] Unknown reconcile action '{}', proceeding with push+pull flow",
                other
            );
        }
    }

    ctx.lock_version = ports
        .acquire_cycle_lock()
        .await
        .map_err(|e| e.to_string())?;
    ctx.local_cursor = ports.get_cursor().await.map_err(|e| e.to_string())?;
    debug!("[DeviceSync] Local cursor: {}", ctx.local_cursor);
    let lock_version = ctx.lock_version;
    let mut local_cursor = ctx.local_cursor;
    let server_cursor = match reconcile.cursor {
        Some(c) => c,
        None => {
            log::warn!(
                "[DeviceSync] Reconcile action '{}' returned no cursor, defaulting to 0",
                reconcile.action
            );
            0
        }
    };

    let pending = ports
        .list_pending_outbox(500)
        .await
        .map_err(|e| e.to_string())?;
    debug!(
        "[DeviceSync] Retrieved {} pending outbox events",
        pending.len()
    );
    let mut push_events = Vec::new();
    let mut push_event_ids = Vec::new();
    let mut invalid_entity_id_event_ids = Vec::new();
    let mut max_retry_count = 0;

    for event in pending {
        if !remote_entity_id_is_valid(&event.entity_id) {
            warn!(
                "[DeviceSync] Marking outbox event dead due to non-UUID entity_id (event_id={}, entity={:?}, entity_id={})",
                event.event_id,
                event.entity,
                event.entity_id
            );
            invalid_entity_id_event_ids.push(event.event_id.clone());
            continue;
        }
        max_retry_count = max_retry_count.max(event.retry_count);
        let event_type = format!(
            "{}.{}.v1",
            sync_entity_name(&event.entity),
            sync_operation_name(&event.op)
        );
        push_event_ids.push(event.event_id.clone());
        let payload_key_version = event.payload_key_version.max(1);
        let encrypted_payload =
            match ports.encrypt_sync_payload(&event.payload, &identity, payload_key_version) {
                Ok(payload) => payload,
                Err(err) => {
                    return ctx
                        .fail(
                            "push_prepare_error",
                            format!("Push payload encryption failed: {}", err),
                            Some(15),
                        )
                        .await;
                }
            };
        push_events.push(SyncPushEventRequest {
            event_id: event.event_id,
            device_id: device_id.clone(),
            event_type,
            entity: event.entity,
            entity_id: event.entity_id,
            client_timestamp: event.client_timestamp,
            payload: encrypted_payload,
            payload_key_version,
        });
    }

    if !invalid_entity_id_event_ids.is_empty() {
        ports
            .mark_outbox_dead(
                invalid_entity_id_event_ids,
                Some("Remote sync requires UUID entity_id".to_string()),
                Some("invalid_entity_id".to_string()),
            )
            .await
            .map_err(|e| e.to_string())?;
    }

    let mut pushed_count = 0usize;
    if !push_events.is_empty() {
        match ports
            .push_events(
                &token,
                &device_id,
                SyncPushRequest {
                    events: push_events,
                },
            )
            .await
        {
            Ok(push_response) => {
                let mut sent_ids: Vec<String> = push_response
                    .accepted
                    .into_iter()
                    .map(|item| item.event_id)
                    .collect();
                sent_ids.extend(
                    push_response
                        .duplicate
                        .into_iter()
                        .map(|item| item.event_id),
                );
                pushed_count = sent_ids.len();
                ports
                    .mark_outbox_sent(sent_ids)
                    .await
                    .map_err(|e| e.to_string())?;
                ports
                    .mark_push_completed()
                    .await
                    .map_err(|e| e.to_string())?;
            }
            Err(err) => {
                let err_str = err.to_string();

                if err_str.contains("KEY_VERSION_MISMATCH") {
                    ports
                        .mark_outbox_dead(
                            push_event_ids,
                            Some(err_str.clone()),
                            Some("key_version_mismatch".to_string()),
                        )
                        .await
                        .map_err(|e| e.to_string())?;
                    return ctx
                        .fail(
                            "key_version_mismatch",
                            "Key version mismatch — re-pairing required".to_string(),
                            None,
                        )
                        .await;
                }

                let backoff = backoff_seconds(max_retry_count);
                let retry_class = err.retry_class;
                match retry_class {
                    ApiRetryClass::ReauthRequired => {
                        ports
                            .schedule_outbox_retry(
                                push_event_ids,
                                30,
                                Some(err_str.clone()),
                                Some(retry_class_code(retry_class).to_string()),
                            )
                            .await
                            .map_err(|e| e.to_string())?;
                        warn!("[DeviceSync] Auth error during push — token may need refresh");
                        return ctx
                            .fail(
                                "auth_error",
                                "Authentication required".to_string(),
                                Some(30),
                            )
                            .await;
                    }
                    ApiRetryClass::Retryable => {
                        ports
                            .schedule_outbox_retry(
                                push_event_ids,
                                backoff,
                                Some(err_str),
                                Some(retry_class_code(retry_class).to_string()),
                            )
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                    ApiRetryClass::Permanent => {
                        ports
                            .mark_outbox_dead(
                                push_event_ids,
                                Some(err_str),
                                Some(retry_class_code(retry_class).to_string()),
                            )
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                }
                return ctx
                    .fail("push_error", format!("Push failed: {}", err), Some(backoff))
                    .await;
            }
        }
    }

    ctx.pushed_count = pushed_count;

    if !ports
        .verify_cycle_lock(lock_version)
        .await
        .map_err(|e| e.to_string())?
    {
        let _ = ports
            .mark_cycle_outcome(
                "preempted".to_string(),
                cycle_started_at.elapsed().as_millis() as i64,
                None,
            )
            .await;
        return Ok(SyncCycleResult {
            status: "preempted".to_string(),
            lock_version,
            pushed_count,
            pulled_count: 0,
            cursor: local_cursor,
            needs_bootstrap: false,
            bootstrap_snapshot_id: None,
            bootstrap_snapshot_seq: None,
        });
    }

    let mut pulled_count = 0usize;
    if server_cursor > local_cursor {
        loop {
            ctx.local_cursor = local_cursor;
            ctx.pulled_count = pulled_count;
            let pull_response = match ports
                .pull_events(&token, &device_id, Some(local_cursor), Some(500))
                .await
            {
                Ok(value) => value,
                Err(err) => {
                    if err.retry_class == ApiRetryClass::ReauthRequired {
                        warn!("[DeviceSync] Auth error during pull — token may need refresh");
                        return ctx
                            .fail(
                                "auth_error",
                                "Authentication required".to_string(),
                                Some(30),
                            )
                            .await;
                    }
                    // Check for SYNC_CURSOR_TOO_OLD or integrity errors — trigger bootstrap
                    if let Some(code) = err.error_code.as_deref() {
                        if code == crate::error::SYNC_CURSOR_TOO_OLD
                            || crate::error::is_integrity_code(code)
                        {
                            warn!("[DeviceSync] Pull error code {} — bootstrap required", code);
                            let _ = ctx
                                .replay_store
                                .mark_engine_error(format!("Pull failed: {}", err))
                                .await;
                            let _ = ctx
                                .replay_store
                                .mark_cycle_outcome(
                                    "stale_cursor".to_string(),
                                    ctx.started_at.elapsed().as_millis() as i64,
                                    None,
                                )
                                .await;
                            // Extract bootstrap hints from details if available
                            let (snap_id, snap_seq) = extract_bootstrap_hints(&err.details);
                            return Ok(SyncCycleResult {
                                status: "stale_cursor".to_string(),
                                lock_version: ctx.lock_version,
                                pushed_count: ctx.pushed_count,
                                pulled_count: ctx.pulled_count,
                                cursor: ctx.local_cursor,
                                needs_bootstrap: true,
                                bootstrap_snapshot_id: snap_id,
                                bootstrap_snapshot_seq: snap_seq,
                            });
                        }
                    }
                    return ctx
                        .fail("pull_error", format!("Pull failed: {}", err), Some(10))
                        .await;
                }
            };

            if let Some(gc_watermark) = pull_response.gc_watermark {
                if local_cursor < gc_watermark {
                    return ctx
                        .fail(
                            "stale_cursor",
                            format!(
                                "Cursor {} is older than pull GC watermark {}",
                                local_cursor, gc_watermark
                            ),
                            None,
                        )
                        .await;
                }
            }

            let mut decoded_events: Vec<ReplayEvent> =
                Vec::with_capacity(pull_response.events.len());
            for remote_event in pull_response.events {
                if remote_event.device_id == device_id {
                    continue;
                }
                let local_entity = remote_event.entity;
                let local_op = match parse_event_operation(&remote_event.event_type) {
                    Some(op) => op,
                    None => {
                        if local_entity == SyncEntity::Snapshot {
                            debug!(
                                "[DeviceSync] Skipping snapshot control event during replay: event_id={} event_type={} seq={}",
                                remote_event.event_id, remote_event.event_type, remote_event.seq
                            );
                            continue;
                        }
                        warn!(
                            "[DeviceSync] Replay blocked: unsupported event type '{}' for event {}",
                            remote_event.event_type, remote_event.event_id
                        );
                        return ctx
                            .fail(
                                "replay_blocked",
                                format!(
                                    "Replay blocked: unsupported event type '{}' for event {}",
                                    remote_event.event_type, remote_event.event_id
                                ),
                                Some(6 * 60 * 60),
                            )
                            .await;
                    }
                };
                let decrypted_payload = match ports.decrypt_sync_payload(
                    &remote_event.payload,
                    &identity,
                    remote_event.payload_key_version,
                ) {
                    Ok(payload) => payload,
                    Err(err) => {
                        return ctx
                            .fail(
                                "replay_error",
                                format!(
                                    "Replay decrypt failed for event {}: {}",
                                    remote_event.event_id, err
                                ),
                                Some(10),
                            )
                            .await;
                    }
                };
                let payload_json: serde_json::Value = match serde_json::from_str(&decrypted_payload)
                {
                    Ok(payload) => payload,
                    Err(err) => {
                        return ctx
                            .fail(
                                "replay_error",
                                format!(
                                    "Replay payload decode failed for event {}: {}",
                                    remote_event.event_id, err
                                ),
                                Some(10),
                            )
                            .await;
                    }
                };

                decoded_events.push(ReplayEvent {
                    entity: local_entity,
                    entity_id: remote_event.entity_id,
                    op: local_op,
                    event_id: remote_event.event_id,
                    client_timestamp: remote_event.client_timestamp,
                    seq: remote_event.seq,
                    payload: payload_json,
                });
            }

            let applied_count = match ports
                .apply_remote_events_lww_batch(decoded_events.clone())
                .await
            {
                Ok(applied) => applied,
                Err(err) => {
                    warn!(
                        "[DeviceSync] Batch replay apply failed ({}). Falling back to per-event apply with dead-letter skip.",
                        err
                    );

                    let mut applied = 0usize;
                    let mut dead_lettered = 0usize;

                    for event in decoded_events {
                        match ports.apply_remote_event_lww(event.clone()).await {
                            Ok(applied_one) => {
                                if applied_one {
                                    applied += 1;
                                }
                            }
                            Err(event_err) => {
                                dead_lettered += 1;
                                log::error!(
                                    "[DeviceSync] Dead-lettering replay event due to apply error: entity={:?} entity_id={} op={:?} event_id={} seq={} error={}",
                                    event.entity,
                                    event.entity_id,
                                    event.op,
                                    event.event_id,
                                    event.seq,
                                    event_err
                                );
                            }
                        }
                    }

                    if dead_lettered > 0 {
                        warn!(
                            "[DeviceSync] Dead-lettered {} replay events in this pull batch (cursor will advance).",
                            dead_lettered
                        );
                    }

                    applied
                }
            };
            pulled_count += applied_count;

            local_cursor = pull_response.next_cursor;
            ports
                .set_cursor(local_cursor)
                .await
                .map_err(|e| e.to_string())?;

            if !pull_response.has_more {
                break;
            }
        }
        ports
            .mark_pull_completed()
            .await
            .map_err(|e| e.to_string())?;
    }

    if local_cursor > 20_000 {
        let prune_seq = local_cursor - 10_000;
        let _ = ports.prune_applied_events_up_to_seq(prune_seq).await;
    }

    ports
        .mark_cycle_outcome(
            "ok".to_string(),
            cycle_started_at.elapsed().as_millis() as i64,
            None,
        )
        .await
        .map_err(|e| e.to_string())?;

    if pulled_count > 0 {
        ports
            .on_pull_complete(pulled_count)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(SyncCycleResult {
        status: "ok".to_string(),
        lock_version,
        pushed_count,
        pulled_count,
        cursor: local_cursor,
        needs_bootstrap: false,
        bootstrap_snapshot_id: None,
        bootstrap_snapshot_seq: None,
    })
}

fn reconcile_error(
    mut result: SyncReadyReconcileResult,
    message: String,
) -> SyncReadyReconcileResult {
    result.status = "error".to_string();
    result.message = message;
    result
}

fn derive_bootstrap_action(bootstrap_status: &str, bootstrap_snapshot_id: Option<&str>) -> String {
    if bootstrap_status == "applied" {
        return "PULL_REMOTE_OVERWRITE".to_string();
    }

    if bootstrap_status == "requested" {
        return "NO_REMOTE_PULL".to_string();
    }

    if bootstrap_snapshot_id
        .map(|id| !id.trim().is_empty())
        .unwrap_or(false)
    {
        return "PULL_REMOTE_OVERWRITE".to_string();
    }

    "NO_BOOTSTRAP".to_string()
}

pub async fn run_ready_reconcile_state<P>(ports: &P) -> SyncReadyReconcileResult
where
    P: ReadyReconcileStore + Send + Sync,
{
    let mut result = SyncReadyReconcileResult {
        status: "ok".to_string(),
        message: "Device sync reconcile completed".to_string(),
        bootstrap_action: "NO_BOOTSTRAP".to_string(),
        bootstrap_status: "not_attempted".to_string(),
        bootstrap_message: None,
        bootstrap_snapshot_id: None,
        cycle_status: None,
        cycle_needs_bootstrap: false,
        retry_attempted: false,
        retry_cycle_status: None,
        background_status: "skipped".to_string(),
    };

    let sync_state = match ports.get_sync_state().await {
        Ok(value) => value,
        Err(err) => {
            return reconcile_error(result, format!("Failed to read sync state: {}", err));
        }
    };
    if sync_state != SyncState::Ready {
        result.status = "skipped_not_ready".to_string();
        result.message = "Device is not in READY state".to_string();
        return result;
    }

    let bootstrap_result = match ports.bootstrap_snapshot_if_needed().await {
        Ok(value) => value,
        Err(err) => {
            return reconcile_error(result, format!("Snapshot bootstrap failed: {}", err));
        }
    };
    result.bootstrap_status = bootstrap_result.status.clone();
    result.bootstrap_message = Some(bootstrap_result.message);
    result.bootstrap_snapshot_id = bootstrap_result.snapshot_id;
    result.bootstrap_action = derive_bootstrap_action(
        &result.bootstrap_status,
        result.bootstrap_snapshot_id.as_deref(),
    );

    if result.bootstrap_status == "applied" {
        let cycle_result = match ports.run_sync_cycle().await {
            Ok(value) => value,
            Err(err) => {
                return reconcile_error(result, format!("Initial sync cycle failed: {}", err));
            }
        };
        result.cycle_status = Some(cycle_result.status.clone());
        result.cycle_needs_bootstrap = cycle_result.needs_bootstrap;

        if cycle_result.needs_bootstrap {
            result.retry_attempted = true;
            let retry_bootstrap_result = match ports.bootstrap_snapshot_if_needed().await {
                Ok(value) => value,
                Err(err) => {
                    return reconcile_error(
                        result,
                        format!("Retry snapshot bootstrap failed: {}", err),
                    );
                }
            };
            result.bootstrap_status = retry_bootstrap_result.status.clone();
            result.bootstrap_message = Some(retry_bootstrap_result.message);
            result.bootstrap_snapshot_id = retry_bootstrap_result.snapshot_id;
            result.bootstrap_action = derive_bootstrap_action(
                &result.bootstrap_status,
                result.bootstrap_snapshot_id.as_deref(),
            );

            if result.bootstrap_status != "applied" {
                let retry_status = result.bootstrap_status.clone();
                return reconcile_error(
                    result,
                    format!(
                        "Retry bootstrap did not apply a snapshot (status={})",
                        retry_status
                    ),
                );
            }

            let retry_cycle_result = match ports.run_sync_cycle().await {
                Ok(value) => value,
                Err(err) => {
                    return reconcile_error(result, format!("Retry sync cycle failed: {}", err));
                }
            };
            result.retry_cycle_status = Some(retry_cycle_result.status);
            result.cycle_needs_bootstrap = retry_cycle_result.needs_bootstrap;
            if result.cycle_needs_bootstrap {
                return reconcile_error(
                    result,
                    "Retry sync cycle still requires bootstrap".to_string(),
                );
            }
        }
    }

    match ports.ensure_background_started().await {
        Ok(true) => {
            result.background_status = "started".to_string();
        }
        Ok(false) => {
            result.background_status = "skipped".to_string();
        }
        Err(err) => {
            result.background_status = "failed".to_string();
            let bootstrap_status = result.bootstrap_status.clone();
            let cycle_status = result.cycle_status.as_deref().unwrap_or("none").to_string();
            let retry_cycle_status = result
                .retry_cycle_status
                .as_deref()
                .unwrap_or("none")
                .to_string();
            return reconcile_error(
                result,
                format!(
                    "Background engine start failed: {} (bootstrap_status={}, cycle_status={}, retry_cycle_status={})",
                    err,
                    bootstrap_status,
                    cycle_status,
                    retry_cycle_status
                ),
            );
        }
    }

    result
}

fn compute_jitter_ms() -> u64 {
    let jitter_bound = DEVICE_SYNC_INTERVAL_JITTER_SECS.saturating_mul(1000);
    if jitter_bound > 0 {
        Utc::now().timestamp_millis().unsigned_abs() % jitter_bound
    } else {
        0
    }
}

async fn compute_cycle_delay_ms<P>(ports: &P, jitter_ms: u64) -> u64
where
    P: OutboxStore + ReplayStore + Send + Sync,
{
    let mut delay_ms = DEVICE_SYNC_FOREGROUND_INTERVAL_SECS.saturating_mul(1000) + jitter_ms;

    if let Ok(engine_status) = ports.get_engine_status().await {
        if let Some(next_retry_at) = engine_status.next_retry_at.as_deref() {
            if let Some(wait_ms) = millis_until_rfc3339(next_retry_at) {
                delay_ms = wait_ms.saturating_add(jitter_ms).max(1_000);
            }
        }
    }

    if ports.has_pending_outbox().await.unwrap_or(false) {
        delay_ms = delay_ms.min(2_000 + (jitter_ms % 500));
    }

    delay_ms
}

pub async fn run_background_loop<P>(ports: Arc<P>)
where
    P: OutboxStore + ReplayStore + SyncTransport + CredentialStore + Send + Sync,
{
    let mut consecutive_not_ready: u32 = 0;
    loop {
        let cycle_result = run_sync_cycle(ports.as_ref()).await;
        if let Err(err) = &cycle_result {
            warn!("[DeviceSync] Background cycle failed: {}", err);
            consecutive_not_ready = 0;
        }
        if let Ok(result) = &cycle_result {
            debug!(
                "[DeviceSync] Cycle complete status={} needs_bootstrap={} cursor={} pushed={} pulled={}",
                result.status,
                result.needs_bootstrap,
                result.cursor,
                result.pushed_count,
                result.pulled_count
            );
            if result.status == "not_ready" || result.status == "config_error" {
                consecutive_not_ready += 1;
                if let Some(identity) = ports.get_sync_identity() {
                    if identity.root_key.is_none() && identity.device_id.is_some() {
                        info!("[DeviceSync] Device appears revoked. Stopping background engine.");
                        break;
                    }
                }
                if consecutive_not_ready >= 5 {
                    info!(
                        "[DeviceSync] {} consecutive not_ready/config_error cycles. Stopping background engine.",
                        consecutive_not_ready
                    );
                    break;
                }
            } else {
                consecutive_not_ready = 0;
            }
        }

        let jitter_ms = compute_jitter_ms();
        let delay_ms = compute_cycle_delay_ms(ports.as_ref(), jitter_ms).await;
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use wealthfolio_core::sync::SyncEngineStatus;

    #[derive(Clone)]
    struct TestPorts {
        cursor: i64,
        identity: Option<SyncIdentity>,
        sync_state: Result<SyncState, String>,
        fail_mark_cycle_outcome: bool,
        persisted_trust_states: Arc<Mutex<Vec<String>>>,
        cycle_outcomes: Arc<Mutex<Vec<String>>>,
        engine_errors: Arc<Mutex<Vec<String>>>,
    }

    impl TestPorts {
        fn new(identity: Option<SyncIdentity>, sync_state: Result<SyncState, String>) -> Self {
            Self {
                cursor: 0,
                identity,
                sync_state,
                fail_mark_cycle_outcome: false,
                persisted_trust_states: Arc::new(Mutex::new(Vec::new())),
                cycle_outcomes: Arc::new(Mutex::new(Vec::new())),
                engine_errors: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    #[async_trait]
    impl OutboxStore for TestPorts {
        async fn list_pending_outbox(
            &self,
            _limit: i64,
        ) -> Result<Vec<wealthfolio_core::sync::SyncOutboxEvent>, String> {
            Ok(Vec::new())
        }

        async fn mark_outbox_dead(
            &self,
            _event_ids: Vec<String>,
            _error_message: Option<String>,
            _error_code: Option<String>,
        ) -> Result<(), String> {
            Ok(())
        }

        async fn mark_outbox_sent(&self, _event_ids: Vec<String>) -> Result<(), String> {
            Ok(())
        }

        async fn schedule_outbox_retry(
            &self,
            _event_ids: Vec<String>,
            _delay_seconds: i64,
            _error_message: Option<String>,
            _error_code: Option<String>,
        ) -> Result<(), String> {
            Ok(())
        }

        async fn mark_push_completed(&self) -> Result<(), String> {
            Ok(())
        }

        async fn has_pending_outbox(&self) -> Result<bool, String> {
            Ok(false)
        }
    }

    #[async_trait]
    impl ReplayStore for TestPorts {
        async fn acquire_cycle_lock(&self) -> Result<i64, String> {
            Ok(1)
        }

        async fn verify_cycle_lock(&self, _lock_version: i64) -> Result<bool, String> {
            Ok(true)
        }

        async fn get_cursor(&self) -> Result<i64, String> {
            Ok(self.cursor)
        }

        async fn set_cursor(&self, _cursor: i64) -> Result<(), String> {
            Ok(())
        }

        async fn apply_remote_events_lww_batch(
            &self,
            _events: Vec<ReplayEvent>,
        ) -> Result<usize, String> {
            Ok(0)
        }

        async fn apply_remote_event_lww(&self, _event: ReplayEvent) -> Result<bool, String> {
            Ok(false)
        }

        async fn mark_pull_completed(&self) -> Result<(), String> {
            Ok(())
        }

        async fn mark_cycle_outcome(
            &self,
            status: String,
            _duration_ms: i64,
            _next_retry_at: Option<String>,
        ) -> Result<(), String> {
            self.cycle_outcomes.lock().await.push(status);
            if self.fail_mark_cycle_outcome {
                return Err("forced cycle_outcome failure".to_string());
            }
            Ok(())
        }

        async fn mark_engine_error(&self, message: String) -> Result<(), String> {
            self.engine_errors.lock().await.push(message);
            Ok(())
        }

        async fn prune_applied_events_up_to_seq(&self, _seq: i64) -> Result<(), String> {
            Ok(())
        }

        async fn get_engine_status(&self) -> Result<SyncEngineStatus, String> {
            Ok(SyncEngineStatus {
                cursor: self.cursor,
                last_push_at: None,
                last_pull_at: None,
                last_error: None,
                consecutive_failures: 0,
                next_retry_at: None,
                last_cycle_status: None,
                last_cycle_duration_ms: None,
            })
        }
    }

    #[async_trait]
    impl SyncTransport for TestPorts {
        async fn get_events_cursor(
            &self,
            _token: &str,
            _device_id: &str,
        ) -> Result<crate::SyncCursorResponse, TransportError> {
            unreachable!("not used by these tests")
        }

        async fn push_events(
            &self,
            _token: &str,
            _device_id: &str,
            _request: SyncPushRequest,
        ) -> Result<crate::SyncPushResponse, TransportError> {
            unreachable!("not used by these tests")
        }

        async fn pull_events(
            &self,
            _token: &str,
            _device_id: &str,
            _from_cursor: Option<i64>,
            _limit: Option<i64>,
        ) -> Result<crate::SyncPullResponse, TransportError> {
            unreachable!("not used by these tests")
        }

        async fn get_reconcile_ready_state(
            &self,
            _token: &str,
            _device_id: &str,
        ) -> Result<crate::ReconcileReadyStateResponse, TransportError> {
            unreachable!("not used by these tests")
        }
    }

    #[async_trait]
    impl CredentialStore for TestPorts {
        fn get_sync_identity(&self) -> Option<SyncIdentity> {
            self.identity.clone()
        }

        fn get_access_token(&self) -> Result<String, String> {
            Ok("token".to_string())
        }

        async fn get_sync_state(&self) -> Result<SyncState, String> {
            self.sync_state.clone()
        }

        async fn persist_device_config(&self, _identity: &SyncIdentity, trust_state: &str) {
            self.persisted_trust_states
                .lock()
                .await
                .push(trust_state.to_string());
        }

        fn encrypt_sync_payload(
            &self,
            _plaintext_payload: &str,
            _identity: &SyncIdentity,
            _payload_key_version: i32,
        ) -> Result<String, String> {
            unreachable!("not used by these tests")
        }

        fn decrypt_sync_payload(
            &self,
            _encrypted_payload: &str,
            _identity: &SyncIdentity,
            _payload_key_version: i32,
        ) -> Result<String, String> {
            unreachable!("not used by these tests")
        }
    }

    #[tokio::test]
    async fn run_sync_cycle_reports_config_error_when_identity_missing() {
        let ports = TestPorts::new(None, Ok(SyncState::Ready));

        let result = run_sync_cycle(&ports)
            .await
            .expect("cycle should return a status");

        assert_eq!(result.status, "config_error");
        assert_eq!(ports.engine_errors.lock().await.len(), 1);
        assert_eq!(
            ports.cycle_outcomes.lock().await.as_slice(),
            ["config_error"]
        );
    }

    #[tokio::test]
    async fn run_sync_cycle_marks_not_ready_and_persists_untrusted_config() {
        let identity = SyncIdentity {
            device_id: Some("device-1".to_string()),
            root_key: Some("root-key".to_string()),
            key_version: Some(1),
        };
        let ports = TestPorts::new(Some(identity), Ok(SyncState::Registered));

        let result = run_sync_cycle(&ports)
            .await
            .expect("cycle should return a status");

        assert_eq!(result.status, "not_ready");
        assert_eq!(
            ports.persisted_trust_states.lock().await.as_slice(),
            ["untrusted"]
        );
        assert_eq!(ports.cycle_outcomes.lock().await.as_slice(), ["not_ready"]);
    }

    #[tokio::test]
    async fn run_sync_cycle_propagates_not_ready_outcome_persist_failures() {
        let identity = SyncIdentity {
            device_id: Some("device-1".to_string()),
            root_key: Some("root-key".to_string()),
            key_version: Some(1),
        };
        let mut ports = TestPorts::new(Some(identity), Ok(SyncState::Registered));
        ports.fail_mark_cycle_outcome = true;

        let error = run_sync_cycle(&ports)
            .await
            .expect_err("cycle should fail when status persistence fails");

        assert!(error.contains("forced cycle_outcome failure"));
    }

    #[derive(Clone)]
    struct ReconcileTestPorts {
        sync_state: Result<SyncState, String>,
        bootstrap_results: Arc<Mutex<Vec<SyncBootstrapResult>>>,
        cycle_results: Arc<Mutex<Vec<SyncCycleResult>>>,
        ensure_background_result: Result<bool, String>,
    }

    impl ReconcileTestPorts {
        fn new(sync_state: Result<SyncState, String>) -> Self {
            Self {
                sync_state,
                bootstrap_results: Arc::new(Mutex::new(Vec::new())),
                cycle_results: Arc::new(Mutex::new(Vec::new())),
                ensure_background_result: Ok(true),
            }
        }
    }

    #[async_trait]
    impl ReadyReconcileStore for ReconcileTestPorts {
        async fn get_sync_state(&self) -> Result<SyncState, String> {
            self.sync_state.clone()
        }

        async fn bootstrap_snapshot_if_needed(&self) -> Result<SyncBootstrapResult, String> {
            self.bootstrap_results
                .lock()
                .await
                .pop()
                .ok_or_else(|| "missing bootstrap result".to_string())
        }

        async fn run_sync_cycle(&self) -> Result<SyncCycleResult, String> {
            self.cycle_results
                .lock()
                .await
                .pop()
                .ok_or_else(|| "missing cycle result".to_string())
        }

        async fn ensure_background_started(&self) -> Result<bool, String> {
            self.ensure_background_result.clone()
        }
    }

    #[tokio::test]
    async fn run_ready_reconcile_state_skips_when_not_ready() {
        let ports = ReconcileTestPorts::new(Ok(SyncState::Registered));
        let result = run_ready_reconcile_state(&ports).await;

        assert_eq!(result.status, "skipped_not_ready");
        assert_eq!(result.bootstrap_status, "not_attempted");
        assert_eq!(result.background_status, "skipped");
    }

    #[tokio::test]
    async fn run_ready_reconcile_state_applies_bootstrap_and_cycle() {
        let ports = ReconcileTestPorts::new(Ok(SyncState::Ready));
        ports
            .bootstrap_results
            .lock()
            .await
            .push(SyncBootstrapResult {
                status: "applied".to_string(),
                message: "Snapshot bootstrap completed".to_string(),
                snapshot_id: Some("snap-1".to_string()),
            });
        ports.cycle_results.lock().await.push(SyncCycleResult {
            status: "ok".to_string(),
            lock_version: 1,
            pushed_count: 0,
            pulled_count: 8,
            cursor: 25,
            needs_bootstrap: false,
            bootstrap_snapshot_id: None,
            bootstrap_snapshot_seq: None,
        });

        let result = run_ready_reconcile_state(&ports).await;
        assert_eq!(result.status, "ok");
        assert_eq!(result.bootstrap_status, "applied");
        assert_eq!(result.cycle_status.as_deref(), Some("ok"));
        assert!(!result.retry_attempted);
        assert_eq!(result.background_status, "started");
    }

    #[tokio::test]
    async fn run_ready_reconcile_state_retries_once_when_cycle_needs_bootstrap() {
        let ports = ReconcileTestPorts::new(Ok(SyncState::Ready));
        {
            let mut bootstrap_results = ports.bootstrap_results.lock().await;
            bootstrap_results.push(SyncBootstrapResult {
                status: "applied".to_string(),
                message: "Retry bootstrap".to_string(),
                snapshot_id: Some("snap-2".to_string()),
            });
            bootstrap_results.push(SyncBootstrapResult {
                status: "applied".to_string(),
                message: "Initial bootstrap".to_string(),
                snapshot_id: Some("snap-1".to_string()),
            });
        }
        {
            let mut cycle_results = ports.cycle_results.lock().await;
            cycle_results.push(SyncCycleResult {
                status: "ok".to_string(),
                lock_version: 2,
                pushed_count: 0,
                pulled_count: 2,
                cursor: 40,
                needs_bootstrap: false,
                bootstrap_snapshot_id: None,
                bootstrap_snapshot_seq: None,
            });
            cycle_results.push(SyncCycleResult {
                status: "stale_cursor".to_string(),
                lock_version: 1,
                pushed_count: 0,
                pulled_count: 0,
                cursor: 20,
                needs_bootstrap: true,
                bootstrap_snapshot_id: None,
                bootstrap_snapshot_seq: None,
            });
        }

        let result = run_ready_reconcile_state(&ports).await;
        assert_eq!(result.status, "ok");
        assert!(result.retry_attempted);
        assert_eq!(result.retry_cycle_status.as_deref(), Some("ok"));
        assert!(!result.cycle_needs_bootstrap);
    }

    #[tokio::test]
    async fn run_ready_reconcile_state_errors_when_retry_bootstrap_not_applied() {
        let ports = ReconcileTestPorts::new(Ok(SyncState::Ready));
        {
            let mut bootstrap_results = ports.bootstrap_results.lock().await;
            bootstrap_results.push(SyncBootstrapResult {
                status: "requested".to_string(),
                message: "requested a new snapshot".to_string(),
                snapshot_id: None,
            });
            bootstrap_results.push(SyncBootstrapResult {
                status: "applied".to_string(),
                message: "Initial bootstrap".to_string(),
                snapshot_id: Some("snap-1".to_string()),
            });
        }
        ports.cycle_results.lock().await.push(SyncCycleResult {
            status: "stale_cursor".to_string(),
            lock_version: 1,
            pushed_count: 0,
            pulled_count: 0,
            cursor: 20,
            needs_bootstrap: true,
            bootstrap_snapshot_id: None,
            bootstrap_snapshot_seq: None,
        });

        let result = run_ready_reconcile_state(&ports).await;
        assert_eq!(result.status, "error");
        assert!(result.retry_attempted);
        assert_eq!(result.bootstrap_status, "requested");
        assert!(result
            .message
            .contains("Retry bootstrap did not apply a snapshot"));
    }

    #[tokio::test]
    async fn run_ready_reconcile_state_errors_when_retry_cycle_still_needs_bootstrap() {
        let ports = ReconcileTestPorts::new(Ok(SyncState::Ready));
        {
            let mut bootstrap_results = ports.bootstrap_results.lock().await;
            bootstrap_results.push(SyncBootstrapResult {
                status: "applied".to_string(),
                message: "Retry bootstrap".to_string(),
                snapshot_id: Some("snap-2".to_string()),
            });
            bootstrap_results.push(SyncBootstrapResult {
                status: "applied".to_string(),
                message: "Initial bootstrap".to_string(),
                snapshot_id: Some("snap-1".to_string()),
            });
        }
        {
            let mut cycle_results = ports.cycle_results.lock().await;
            cycle_results.push(SyncCycleResult {
                status: "stale_cursor".to_string(),
                lock_version: 2,
                pushed_count: 0,
                pulled_count: 0,
                cursor: 40,
                needs_bootstrap: true,
                bootstrap_snapshot_id: None,
                bootstrap_snapshot_seq: None,
            });
            cycle_results.push(SyncCycleResult {
                status: "stale_cursor".to_string(),
                lock_version: 1,
                pushed_count: 0,
                pulled_count: 0,
                cursor: 20,
                needs_bootstrap: true,
                bootstrap_snapshot_id: None,
                bootstrap_snapshot_seq: None,
            });
        }

        let result = run_ready_reconcile_state(&ports).await;
        assert_eq!(result.status, "error");
        assert!(result.retry_attempted);
        assert!(result.cycle_needs_bootstrap);
        assert_eq!(result.retry_cycle_status.as_deref(), Some("stale_cursor"));
        assert!(result
            .message
            .contains("Retry sync cycle still requires bootstrap"));
    }

    #[tokio::test]
    async fn run_ready_reconcile_state_surfaces_background_start_failure() {
        let mut ports = ReconcileTestPorts::new(Ok(SyncState::Ready));
        ports.ensure_background_result = Err("start failed".to_string());
        ports
            .bootstrap_results
            .lock()
            .await
            .push(SyncBootstrapResult {
                status: "skipped".to_string(),
                message: "Snapshot bootstrap already completed".to_string(),
                snapshot_id: None,
            });

        let result = run_ready_reconcile_state(&ports).await;
        assert_eq!(result.status, "error");
        assert_eq!(result.background_status, "failed");
        assert!(result.message.contains("Background engine start failed"));
        assert!(result.message.contains("bootstrap_status=skipped"));
        assert_eq!(result.bootstrap_status, "skipped");
    }
}
