//! Traits defining the contract for sync operations.

use async_trait::async_trait;

use super::models::{
    AccountUniversalActivity, BrokerAccount, BrokerBrokerage, BrokerConnection,
    BrokerHoldingsResponse, HoldingsBalance, HoldingsDiff, HoldingsOptionPosition,
    HoldingsPosition, PaginatedUniversalActivity, SyncAccountsResponse, SyncConnectionsResponse,
    RAW_TYPE_META_KEY,
};
use crate::broker_ingest::BrokerSyncState;
use crate::broker_ingest::{ImportRun, ImportRunMode, ImportRunStatus, ImportRunSummary};
use crate::platform::Platform;
use wealthfolio_core::accounts::{account_types, Account};
use wealthfolio_core::errors::Result;

/// Account tracking modes accepted by Wealthfolio Connect account-scoped endpoints.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrokerTrackingMode {
    Holdings,
    Transactions,
}

impl BrokerTrackingMode {
    pub const fn as_header_value(self) -> &'static str {
        match self {
            Self::Holdings => "holdings",
            Self::Transactions => "transactions",
        }
    }
}

/// Local account classification and the original provider label, used for diagnostics only.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BrokerAccountContext {
    pub account_type: Option<String>,
    pub raw_type: Option<String>,
}

impl BrokerAccountContext {
    pub fn from_account(account: &Account) -> Self {
        // Broker sync has always stored the provider label under `raw_type`.
        let raw_type = account
            .meta
            .as_deref()
            .and_then(|value| serde_json::from_str::<serde_json::Value>(value).ok())
            .and_then(|meta| {
                meta.get(RAW_TYPE_META_KEY)
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(String::from)
            });
        let account_type = match account.account_type.as_str() {
            account_types::SECURITIES
            | account_types::CASH
            | account_types::CREDIT_CARD
            | account_types::CRYPTOCURRENCY => Some(account.account_type.clone()),
            _ => None,
        };
        Self {
            account_type,
            raw_type,
        }
    }
}

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
    #[allow(clippy::too_many_arguments)]
    async fn get_account_activities(
        &self,
        account_id: &str,
        tracking_mode: BrokerTrackingMode,
        account_context: &BrokerAccountContext,
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
    async fn get_account_holdings(
        &self,
        account_id: &str,
        tracking_mode: BrokerTrackingMode,
    ) -> Result<BrokerHoldingsResponse>;
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

    /// Whether the account already has a broker-imported holdings snapshot.
    fn has_broker_imported_holdings_snapshot(&self, account_id: &str) -> Result<bool>;

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

    /// Finalize an activity sync as needs-review (partial success) for an account.
    async fn finalize_activity_sync_needs_review(
        &self,
        account_id: String,
        warning: String,
        import_run_id: Option<String>,
    ) -> Result<()>;

    /// Get all broker sync states.
    fn get_all_sync_states(&self) -> Result<Vec<BrokerSyncState>>;

    /// Get import runs by type (SYNC or IMPORT) with pagination.
    fn get_import_runs(
        &self,
        run_type: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ImportRun>>;

    /// Create a new import run for broker sync.
    async fn create_import_run(&self, account_id: &str, mode: ImportRunMode) -> Result<ImportRun>;

    /// Finalize an import run with summary and status.
    async fn finalize_import_run(
        &self,
        run_id: &str,
        summary: ImportRunSummary,
        status: ImportRunStatus,
        error: Option<String>,
    ) -> Result<()>;

    /// Save broker holdings as a snapshot with source=BROKER_IMPORTED.
    /// Returns (position_diff, assets_created, new_asset_ids).
    async fn save_broker_holdings(
        &self,
        account_id: String,
        balances: Vec<HoldingsBalance>,
        positions: Vec<HoldingsPosition>,
        option_positions: Vec<HoldingsOptionPosition>,
    ) -> Result<(HoldingsDiff, usize, Vec<String>)>;
}

#[cfg(test)]
mod account_context_tests {
    use super::*;

    #[test]
    fn account_context_uses_local_type_and_provider_label() {
        // Metadata as broker sync writes it: the API's canonical type plus the provider label.
        let account = Account {
            account_type: "CASH".into(),
            meta: BrokerAccount {
                account_type: Some("SECURITIES".into()),
                raw_type: Some("TFSA".into()),
                ..BrokerAccount::default()
            }
            .to_meta_json(),
            ..Account::default()
        };
        let context = BrokerAccountContext::from_account(&account);
        assert_eq!(context.account_type.as_deref(), Some("CASH"));
        assert_eq!(context.raw_type.as_deref(), Some("TFSA"));
    }

    #[test]
    fn account_context_trims_raw_type_and_omits_missing_or_malformed_metadata() {
        for (meta, expected) in [
            (Some(r#"{"raw_type":" RRSP "}"#), Some("RRSP")),
            (Some(r#"{"raw_type":"  "}"#), None),
            (Some(r#"{"raw_type":4}"#), None),
            // The API's canonical type is not a provider label.
            (
                Some(r#"{"broker_account_type":"SECURITIES","raw_type":null}"#),
                None,
            ),
            (Some("invalid json"), None),
            (None, None),
        ] {
            let account = Account {
                account_type: "unknown".into(),
                meta: meta.map(str::to_owned),
                ..Account::default()
            };
            let context = BrokerAccountContext::from_account(&account);
            assert_eq!(context.raw_type.as_deref(), expected);
            assert!(context.account_type.is_none());
        }
    }
}
