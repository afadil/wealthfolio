//! Traits defining the contract for sync operations.

use async_trait::async_trait;

use super::models::{
    AccountUniversalActivity, BrokerAccount, BrokerBrokerage, BrokerConnection,
    SyncAccountsResponse, SyncConnectionsResponse,
};
use crate::platform::Platform;
use crate::state::BrokersSyncState;
use wealthfolio_core::accounts::Account;
use wealthfolio_core::errors::Result;

/// Trait for fetching data from the cloud broker API
#[async_trait]
pub trait BrokerApiClient: Send + Sync {
    /// Fetch all broker connections (authorizations) for the user
    async fn list_connections(&self) -> Result<Vec<BrokerConnection>>;

    /// Fetch all broker accounts for the user
    async fn list_accounts(
        &self,
        authorization_ids: Option<Vec<String>>,
    ) -> Result<Vec<BrokerAccount>>;

    /// Fetch all available brokerages
    async fn list_brokerages(&self) -> Result<Vec<BrokerBrokerage>>;
}

/// Trait for platform repository operations
#[async_trait]
pub trait PlatformRepositoryTrait: Send + Sync {
    fn get_by_id(&self, platform_id: &str) -> Result<Option<Platform>>;
    fn get_by_external_id(&self, external_id: &str) -> Result<Option<Platform>>;
    fn list(&self) -> Result<Vec<Platform>>;
    async fn upsert(&self, platform: Platform) -> Result<Platform>;
    async fn delete(&self, platform_id: &str) -> Result<usize>;
}

/// Trait for the sync service operations
#[async_trait]
pub trait SyncServiceTrait: Send + Sync {
    /// Sync connections from the broker API to local platforms table
    async fn sync_connections(
        &self,
        connections: Vec<BrokerConnection>,
    ) -> Result<SyncConnectionsResponse>;

    /// Sync accounts from the broker API to local accounts table
    async fn sync_accounts(&self, broker_accounts: Vec<BrokerAccount>)
        -> Result<SyncAccountsResponse>;

    /// Get all synced accounts (accounts with external_id set)
    fn get_synced_accounts(&self) -> Result<Vec<Account>>;

    /// Get all platforms
    fn get_platforms(&self) -> Result<Vec<Platform>>;

    /// Get the stored activity sync state for an account, if any.
    fn get_activity_sync_state(&self, account_id: &str) -> Result<Option<BrokersSyncState>>;

    /// Record an activity sync attempt for an account.
    async fn mark_activity_sync_attempt(&self, account_id: String) -> Result<()>;

    /// Upsert a batch/page of broker activities for a local account.
    async fn upsert_account_activities(
        &self,
        account_id: String,
        activities: Vec<AccountUniversalActivity>,
    ) -> Result<(usize, usize)>;

    /// Finalize an activity sync as successful for an account.
    async fn finalize_activity_sync_success(
        &self,
        account_id: String,
        last_synced_date: String,
    ) -> Result<()>;

    /// Finalize an activity sync as failed for an account.
    async fn finalize_activity_sync_failure(&self, account_id: String, error: String)
        -> Result<()>;
}
