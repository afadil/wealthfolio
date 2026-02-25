use std::sync::Arc;

use async_trait::async_trait;
use wealthfolio_device_sync::engine::{OutboxStore, ReplayEvent, ReplayStore};

use super::repository::AppSyncRepository;

#[derive(Clone)]
pub struct SqliteSyncEngineDbPorts {
    repository: Arc<AppSyncRepository>,
}

impl SqliteSyncEngineDbPorts {
    pub fn new(repository: Arc<AppSyncRepository>) -> Self {
        Self { repository }
    }

    pub fn repository(&self) -> Arc<AppSyncRepository> {
        Arc::clone(&self.repository)
    }
}

#[async_trait]
impl OutboxStore for SqliteSyncEngineDbPorts {
    async fn list_pending_outbox(
        &self,
        limit: i64,
    ) -> Result<Vec<wealthfolio_core::sync::SyncOutboxEvent>, String> {
        self.repository
            .list_pending_outbox(limit)
            .map_err(|e| e.to_string())
    }

    async fn mark_outbox_dead(
        &self,
        event_ids: Vec<String>,
        error_message: Option<String>,
        error_code: Option<String>,
    ) -> Result<(), String> {
        self.repository
            .mark_outbox_dead(event_ids, error_message, error_code)
            .await
            .map_err(|e| e.to_string())
    }

    async fn mark_outbox_sent(&self, event_ids: Vec<String>) -> Result<(), String> {
        self.repository
            .mark_outbox_sent(event_ids)
            .await
            .map_err(|e| e.to_string())
    }

    async fn schedule_outbox_retry(
        &self,
        event_ids: Vec<String>,
        delay_seconds: i64,
        error_message: Option<String>,
        error_code: Option<String>,
    ) -> Result<(), String> {
        self.repository
            .schedule_outbox_retry(event_ids, delay_seconds, error_message, error_code)
            .await
            .map_err(|e| e.to_string())
    }

    async fn mark_push_completed(&self) -> Result<(), String> {
        self.repository
            .mark_push_completed()
            .await
            .map_err(|e| e.to_string())
    }

    async fn has_pending_outbox(&self) -> Result<bool, String> {
        self.repository
            .list_pending_outbox(1)
            .map(|rows| !rows.is_empty())
            .map_err(|e| e.to_string())
    }
}

#[async_trait]
impl ReplayStore for SqliteSyncEngineDbPorts {
    async fn acquire_cycle_lock(&self) -> Result<i64, String> {
        self.repository
            .acquire_cycle_lock()
            .await
            .map_err(|e| e.to_string())
    }

    async fn verify_cycle_lock(&self, lock_version: i64) -> Result<bool, String> {
        self.repository
            .verify_cycle_lock(lock_version)
            .map_err(|e| e.to_string())
    }

    async fn get_cursor(&self) -> Result<i64, String> {
        self.repository.get_cursor().map_err(|e| e.to_string())
    }

    async fn set_cursor(&self, cursor: i64) -> Result<(), String> {
        self.repository
            .set_cursor(cursor)
            .await
            .map_err(|e| e.to_string())
    }

    async fn apply_remote_events_lww_batch(
        &self,
        events: Vec<ReplayEvent>,
    ) -> Result<usize, String> {
        self.repository
            .apply_remote_events_lww_batch(
                events
                    .into_iter()
                    .map(|event| {
                        (
                            event.entity,
                            event.entity_id,
                            event.op,
                            event.event_id,
                            event.client_timestamp,
                            event.seq,
                            event.payload,
                        )
                    })
                    .collect(),
            )
            .await
            .map_err(|e| e.to_string())
    }

    async fn apply_remote_event_lww(&self, event: ReplayEvent) -> Result<bool, String> {
        self.repository
            .apply_remote_event_lww(
                event.entity,
                event.entity_id,
                event.op,
                event.event_id,
                event.client_timestamp,
                event.seq,
                event.payload,
            )
            .await
            .map_err(|e| e.to_string())
    }

    async fn mark_pull_completed(&self) -> Result<(), String> {
        self.repository
            .mark_pull_completed()
            .await
            .map_err(|e| e.to_string())
    }

    async fn mark_cycle_outcome(
        &self,
        status: String,
        duration_ms: i64,
        next_retry_at: Option<String>,
    ) -> Result<(), String> {
        self.repository
            .mark_cycle_outcome(status, duration_ms, next_retry_at)
            .await
            .map_err(|e| e.to_string())
    }

    async fn mark_engine_error(&self, message: String) -> Result<(), String> {
        self.repository
            .mark_engine_error(message)
            .await
            .map_err(|e| e.to_string())
    }

    async fn prune_applied_events_up_to_seq(&self, seq: i64) -> Result<(), String> {
        self.repository
            .prune_applied_events_up_to_seq(seq)
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    async fn get_engine_status(&self) -> Result<wealthfolio_core::sync::SyncEngineStatus, String> {
        self.repository
            .get_engine_status()
            .map_err(|e| e.to_string())
    }
}
