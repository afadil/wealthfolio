//! Central projector for transactional sync outbox appends.

use diesel::sqlite::SqliteConnection;
use serde_json::Value;
use wealthfolio_core::errors::Result;
use wealthfolio_core::sync::{SyncEntity, SyncOperation};

use super::repository::{insert_outbox_event, OutboxWriteRequest};
use crate::sync::SyncOutboxModel;

/// Captured mutation that can be projected to a sync outbox request at commit-time.
#[derive(Debug, Clone)]
pub(crate) struct ProjectedChange {
    pub entity: SyncEntity,
    pub entity_id: String,
    pub op: SyncOperation,
    pub payload: Value,
}

impl ProjectedChange {
    pub(crate) fn for_model<T: SyncOutboxModel>(model: &T, op: SyncOperation) -> Result<Self> {
        Ok(Self {
            entity: T::ENTITY,
            entity_id: model.sync_entity_id().to_string(),
            op,
            payload: serde_json::to_value(model)?,
        })
    }

    pub(crate) fn delete_for_model<T: SyncOutboxModel>(entity_id: impl Into<String>) -> Self {
        let entity_id = entity_id.into();
        Self {
            entity: T::ENTITY,
            entity_id: entity_id.clone(),
            op: SyncOperation::Delete,
            payload: T::delete_payload(&entity_id),
        }
    }

    fn into_outbox_request(self) -> OutboxWriteRequest {
        OutboxWriteRequest::new(self.entity, self.entity_id, self.op, self.payload)
    }
}

pub(crate) fn flush_projected_outbox(
    conn: &mut SqliteConnection,
    requests: Vec<OutboxWriteRequest>,
    projected_changes: Vec<ProjectedChange>,
) -> Result<()> {
    for request in requests.into_iter().chain(
        projected_changes
            .into_iter()
            .map(ProjectedChange::into_outbox_request),
    ) {
        insert_outbox_event(conn, request)?;
    }
    Ok(())
}
