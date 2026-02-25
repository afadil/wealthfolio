//! Broker ingest domain contracts (connect-owned API surface).

mod core_adapter;
mod models;

pub use core_adapter::CoreImportRunRepositoryAdapter;
pub use models::{
    BrokerSyncState, BrokerSyncStateRepositoryTrait, ImportRun, ImportRunMode,
    ImportRunRepositoryTrait, ImportRunStatus, ImportRunSummary, ImportRunType,
    PlaidInvestmentsCheckpoint, PlaidSyncCheckpoint, ReviewMode, SnapTradeCheckpoint, SyncStatus,
};
