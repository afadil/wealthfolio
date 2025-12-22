//! Wealthfolio Connect - Cloud sync functionality for Wealthfolio.
//!
//! This crate provides integration with Wealthfolio Connect cloud services
//! for syncing broker accounts and activities.

#[cfg(feature = "broker")]
pub mod broker;
pub mod platform;
pub mod state;

// Re-export commonly used types
#[cfg(feature = "broker")]
pub use broker::{
    AccountUniversalActivity, BrokerAccount, BrokerApiClient, BrokerBrokerage, BrokerConnection,
    ConnectPortalRequest, ConnectPortalResponse, PaginatedUniversalActivity,
    PlatformRepositoryTrait, RemoveConnectionRequest, SyncAccountsResponse,
    SyncActivitiesResponse, SyncConnectionsResponse, SyncService, SyncServiceTrait,
};

pub use platform::{Platform, PlatformDB, PlatformRepository};
pub use state::{BrokersSyncState, BrokersSyncStateRepository};
