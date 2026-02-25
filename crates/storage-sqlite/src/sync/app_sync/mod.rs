//! SQLite persistence for app-side device sync state and outbox.

pub mod adapters;
mod engine_ports;
mod model;
mod outbox_models;
mod outbox_projector;
mod repository;

pub use engine_ports::SqliteSyncEngineDbPorts;
pub use model::{
    SyncAppliedEventDB, SyncCursorDB, SyncDeviceConfigDB, SyncEngineStateDB, SyncEntityMetadataDB,
    SyncOutboxEventDB, SyncTableStateDB,
};
pub(crate) use outbox_projector::{flush_projected_outbox, ProjectedChange};
pub use repository::{
    insert_outbox_event, AppSyncRepository, OutboxWriteRequest, SyncLocalDataSummary,
    SyncTableRowCount,
};
