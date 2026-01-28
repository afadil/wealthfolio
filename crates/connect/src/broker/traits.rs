//! Traits defining the contract for sync operations.

use async_trait::async_trait;

use super::models::{
    AccountUniversalActivity, BrokerAccount, BrokerBrokerage, BrokerConnection,
    BrokerHoldingsResponse, HoldingsBalance, HoldingsPosition, PaginatedUniversalActivity,
    SyncAccountsResponse, SyncConnectionsResponse,
};
use crate::platform::Platform;
use crate::state::BrokerSyncState;
use wealthfolio_core::accounts::Account;
use wealthfolio_core::errors::Result;
use wealthfolio_core::sync::{ImportRun, ImportRunMode, ImportRunStatus, ImportRunSummary};

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

    /// Fetch account activities with pagination.
    ///
    /// # Arguments
    ///
    /// * `account_id` - The broker account ID (provider's ID)
    /// * `start_date` - Optional start date filter (YYYY-MM-DD)
    /// * `end_date` - Optional end date filter (YYYY-MM-DD)
    /// * `offset` - Pagination offset
    /// * `limit` - Maximum number of results per page
    async fn get_account_activities(
        &self,
        account_id: &str,
        start_date: Option<&str>,
        end_date: Option<&str>,
        offset: Option<i64>,
        limit: Option<i64>,
    ) -> Result<PaginatedUniversalActivity>;

    /// Fetch current holdings for a broker account.
    ///
    /// # Arguments
    ///
    /// * `account_id` - The broker account ID (provider's ID)
    ///
    /// Returns cash balances, stock/ETF positions, and option positions.
    async fn get_account_holdings(&self, account_id: &str) -> Result<BrokerHoldingsResponse>;
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
pub trait BrokerSyncServiceTrait: Send + Sync {
    /// Sync connections from the broker API to local platforms table
    async fn sync_connections(
        &self,
        connections: Vec<BrokerConnection>,
    ) -> Result<SyncConnectionsResponse>;

    /// Sync accounts from the broker API to local accounts table
    async fn sync_accounts(
        &self,
        broker_accounts: Vec<BrokerAccount>,
    ) -> Result<SyncAccountsResponse>;

    /// Get all synced accounts (accounts with provider_account_id set)
    fn get_synced_accounts(&self) -> Result<Vec<Account>>;

    /// Get all platforms
    fn get_platforms(&self) -> Result<Vec<Platform>>;

    /// Get the stored activity sync state for an account, if any.
    fn get_activity_sync_state(&self, account_id: &str) -> Result<Option<BrokerSyncState>>;

    /// Record an activity sync attempt for an account.
    async fn mark_activity_sync_attempt(&self, account_id: String) -> Result<()>;

    /// Upsert a batch/page of broker activities for a local account.
    /// Returns (activities_upserted, assets_inserted, new_asset_ids, needs_review_count).
    async fn upsert_account_activities(
        &self,
        account_id: String,
        import_run_id: Option<String>,
        activities: Vec<AccountUniversalActivity>,
    ) -> Result<(usize, usize, Vec<String>, usize)>;

    /// Finalize an activity sync as successful for an account.
    async fn finalize_activity_sync_success(
        &self,
        account_id: String,
        last_synced_date: String,
        import_run_id: Option<String>,
    ) -> Result<()>;

    /// Finalize an activity sync as failed for an account.
    async fn finalize_activity_sync_failure(
        &self,
        account_id: String,
        error: String,
        import_run_id: Option<String>,
    ) -> Result<()>;

    /// Get all broker sync states.
    fn get_all_sync_states(&self) -> Result<Vec<BrokerSyncState>>;

    /// Get import runs by type (SYNC or IMPORT) with pagination.
    fn get_import_runs(&self, run_type: Option<&str>, limit: i64, offset: i64) -> Result<Vec<ImportRun>>;

    /// Create a new import run for broker sync.
    async fn create_import_run(
        &self,
        account_id: &str,
        mode: ImportRunMode,
    ) -> Result<ImportRun>;

    /// Finalize an import run with summary and status.
    async fn finalize_import_run(
        &self,
        run_id: &str,
        summary: ImportRunSummary,
        status: ImportRunStatus,
        error: Option<String>,
    ) -> Result<()>;

    /// Save broker holdings as a snapshot with source=BROKER_IMPORTED.
    /// Returns (positions_saved, assets_created, new_asset_ids).
    async fn save_broker_holdings(
        &self,
        account_id: String,
        balances: Vec<HoldingsBalance>,
        positions: Vec<HoldingsPosition>,
    ) -> Result<(usize, usize, Vec<String>)>;
}
