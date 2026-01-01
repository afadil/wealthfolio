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
    PlanPricing, PlanPricingPeriods, PlansResponse, PlatformRepositoryTrait,
    RemoveConnectionRequest, SubscriptionPlan, SyncAccountsResponse, SyncActivitiesResponse,
    SyncConnectionsResponse, SyncService, SyncServiceTrait, UserInfo, UserTeam,
};

pub use platform::{Platform, PlatformDB, PlatformRepository};
pub use state::{BrokerSyncState, BrokerSyncStateDB, BrokerSyncStateRepository};
