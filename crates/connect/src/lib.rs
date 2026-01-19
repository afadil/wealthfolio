//! Wealthfolio Connect - Cloud sync functionality for Wealthfolio.
//!
//! This crate provides integration with Wealthfolio Connect cloud services
//! for syncing broker accounts and activities.

#[cfg(feature = "broker")]
pub mod broker;
pub mod client;
pub mod platform;
pub mod state;

// Re-export commonly used types
#[cfg(feature = "broker")]
pub use broker::{
    AccountUniversalActivity, BrokerAccount, BrokerApiClient, BrokerBrokerage, BrokerConnection,
    BrokerSyncService, BrokerSyncServiceTrait, NoOpProgressReporter, PaginatedUniversalActivity,
    PlanLimitValue, PlanLimits, PlanPricing, PlansResponse, PlatformRepositoryTrait,
    SubscriptionPlan, SyncAccountsResponse, SyncActivitiesResponse, SyncConfig,
    SyncConnectionsResponse, SyncOrchestrator, SyncProgressPayload, SyncProgressReporter,
    SyncResult, SyncStatus, UserInfo, UserTeam,
};

// Re-export the HTTP client and public functions
pub use client::{fetch_subscription_plans_public, ConnectApiClient, DEFAULT_CLOUD_API_URL};

pub use platform::{Platform, PlatformDB, PlatformRepository};
pub use state::{BrokerSyncState, BrokerSyncStateDB, BrokerSyncStateRepository};
