use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use wealthfolio_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncStatus {
    #[default]
    Idle,
    Running,
    NeedsReview,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerSyncState {
    pub account_id: String,
    pub provider: String,
    pub checkpoint_json: Option<Value>,
    pub last_attempted_at: Option<DateTime<Utc>>,
    pub last_successful_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub last_run_id: Option<String>,
    pub sync_status: SyncStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl BrokerSyncState {
    pub fn new(account_id: String, provider: String) -> Self {
        let now = Utc::now();
        Self {
            account_id,
            provider,
            checkpoint_json: None,
            last_attempted_at: None,
            last_successful_at: None,
            last_error: None,
            last_run_id: None,
            sync_status: SyncStatus::Idle,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn get_checkpoint<T: serde::de::DeserializeOwned>(&self) -> Option<T> {
        self.checkpoint_json
            .as_ref()
            .and_then(|value| serde_json::from_value(value.clone()).ok())
    }

    pub fn set_checkpoint<T: Serialize>(
        &mut self,
        checkpoint: &T,
    ) -> std::result::Result<(), serde_json::Error> {
        self.checkpoint_json = Some(serde_json::to_value(checkpoint)?);
        self.updated_at = Utc::now();
        Ok(())
    }

    pub fn start_sync(&mut self, run_id: String) {
        self.sync_status = SyncStatus::Running;
        self.last_attempted_at = Some(Utc::now());
        self.last_run_id = Some(run_id);
        self.last_error = None;
        self.updated_at = Utc::now();
    }

    pub fn complete_sync(&mut self) {
        self.sync_status = SyncStatus::Idle;
        self.last_successful_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    pub fn fail_sync(&mut self, error: String) {
        self.sync_status = SyncStatus::Failed;
        self.last_error = Some(error);
        self.updated_at = Utc::now();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapTradeCheckpoint {
    pub last_synced_date: NaiveDate,
    pub lookback_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaidSyncCheckpoint {
    pub cursor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaidInvestmentsCheckpoint {
    pub last_synced_date: NaiveDate,
    pub lookback_days: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunType {
    Sync,
    Import,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunMode {
    Initial,
    Incremental,
    Backfill,
    Repair,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunStatus {
    #[default]
    Running,
    Applied,
    NeedsReview,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewMode {
    #[default]
    Never,
    Always,
    IfWarnings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRun {
    pub id: String,
    pub account_id: String,
    pub source_system: String,
    pub run_type: ImportRunType,
    pub mode: ImportRunMode,
    pub status: ImportRunStatus,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub review_mode: ReviewMode,
    pub applied_at: Option<DateTime<Utc>>,
    pub checkpoint_in: Option<Value>,
    pub checkpoint_out: Option<Value>,
    pub summary: Option<ImportRunSummary>,
    pub warnings: Option<Vec<String>>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportRunSummary {
    pub fetched: u32,
    pub inserted: u32,
    pub updated: u32,
    pub skipped: u32,
    pub warnings: u32,
    pub errors: u32,
    pub removed: u32,
    pub assets_created: u32,
}

impl ImportRun {
    pub fn new(
        account_id: String,
        source_system: String,
        run_type: ImportRunType,
        mode: ImportRunMode,
        review_mode: ReviewMode,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            account_id,
            source_system,
            run_type,
            mode,
            status: ImportRunStatus::Running,
            started_at: now,
            finished_at: None,
            review_mode,
            applied_at: None,
            checkpoint_in: None,
            checkpoint_out: None,
            summary: Some(ImportRunSummary::default()),
            warnings: None,
            error: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn complete(&mut self) {
        self.status = ImportRunStatus::Applied;
        self.finished_at = Some(Utc::now());
        self.applied_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    pub fn fail(&mut self, error: String) {
        self.status = ImportRunStatus::Failed;
        self.finished_at = Some(Utc::now());
        self.error = Some(error);
        self.updated_at = Utc::now();
    }

    pub fn mark_needs_review(&mut self) {
        self.status = ImportRunStatus::NeedsReview;
        self.finished_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }
}

#[async_trait]
pub trait ImportRunRepositoryTrait: Send + Sync {
    async fn create(&self, import_run: ImportRun) -> Result<ImportRun>;
    async fn update(&self, import_run: ImportRun) -> Result<ImportRun>;
    fn get_by_id(&self, id: &str) -> Result<Option<ImportRun>>;
    fn get_recent_for_account(&self, account_id: &str, limit: i64) -> Result<Vec<ImportRun>>;
    fn get_all(&self, limit: i64, offset: i64) -> Result<Vec<ImportRun>>;
    fn get_by_run_type(&self, run_type: &str, limit: i64, offset: i64) -> Result<Vec<ImportRun>>;
}

#[async_trait]
pub trait BrokerSyncStateRepositoryTrait: Send + Sync {
    fn get_by_account_id(&self, account_id: &str) -> Result<Option<BrokerSyncState>>;
    async fn upsert_attempt(&self, account_id: String, provider: String) -> Result<()>;
    async fn upsert_success(
        &self,
        account_id: String,
        provider: String,
        last_synced_date: String,
        import_run_id: Option<String>,
    ) -> Result<()>;
    async fn upsert_failure(
        &self,
        account_id: String,
        provider: String,
        error: String,
        import_run_id: Option<String>,
    ) -> Result<()>;
    fn get_all(&self) -> Result<Vec<BrokerSyncState>>;
}

impl From<wealthfolio_core::activities::ImportRunType> for ImportRunType {
    fn from(value: wealthfolio_core::activities::ImportRunType) -> Self {
        match value {
            wealthfolio_core::activities::ImportRunType::Sync => Self::Sync,
            wealthfolio_core::activities::ImportRunType::Import => Self::Import,
        }
    }
}

impl From<ImportRunType> for wealthfolio_core::activities::ImportRunType {
    fn from(value: ImportRunType) -> Self {
        match value {
            ImportRunType::Sync => Self::Sync,
            ImportRunType::Import => Self::Import,
        }
    }
}

impl From<wealthfolio_core::activities::ImportRunMode> for ImportRunMode {
    fn from(value: wealthfolio_core::activities::ImportRunMode) -> Self {
        match value {
            wealthfolio_core::activities::ImportRunMode::Initial => Self::Initial,
            wealthfolio_core::activities::ImportRunMode::Incremental => Self::Incremental,
            wealthfolio_core::activities::ImportRunMode::Backfill => Self::Backfill,
            wealthfolio_core::activities::ImportRunMode::Repair => Self::Repair,
        }
    }
}

impl From<ImportRunMode> for wealthfolio_core::activities::ImportRunMode {
    fn from(value: ImportRunMode) -> Self {
        match value {
            ImportRunMode::Initial => Self::Initial,
            ImportRunMode::Incremental => Self::Incremental,
            ImportRunMode::Backfill => Self::Backfill,
            ImportRunMode::Repair => Self::Repair,
        }
    }
}

impl From<wealthfolio_core::activities::ImportRunStatus> for ImportRunStatus {
    fn from(value: wealthfolio_core::activities::ImportRunStatus) -> Self {
        match value {
            wealthfolio_core::activities::ImportRunStatus::Running => Self::Running,
            wealthfolio_core::activities::ImportRunStatus::Applied => Self::Applied,
            wealthfolio_core::activities::ImportRunStatus::NeedsReview => Self::NeedsReview,
            wealthfolio_core::activities::ImportRunStatus::Failed => Self::Failed,
            wealthfolio_core::activities::ImportRunStatus::Cancelled => Self::Cancelled,
        }
    }
}

impl From<ImportRunStatus> for wealthfolio_core::activities::ImportRunStatus {
    fn from(value: ImportRunStatus) -> Self {
        match value {
            ImportRunStatus::Running => Self::Running,
            ImportRunStatus::Applied => Self::Applied,
            ImportRunStatus::NeedsReview => Self::NeedsReview,
            ImportRunStatus::Failed => Self::Failed,
            ImportRunStatus::Cancelled => Self::Cancelled,
        }
    }
}

impl From<wealthfolio_core::activities::ReviewMode> for ReviewMode {
    fn from(value: wealthfolio_core::activities::ReviewMode) -> Self {
        match value {
            wealthfolio_core::activities::ReviewMode::Never => Self::Never,
            wealthfolio_core::activities::ReviewMode::Always => Self::Always,
            wealthfolio_core::activities::ReviewMode::IfWarnings => Self::IfWarnings,
        }
    }
}

impl From<ReviewMode> for wealthfolio_core::activities::ReviewMode {
    fn from(value: ReviewMode) -> Self {
        match value {
            ReviewMode::Never => Self::Never,
            ReviewMode::Always => Self::Always,
            ReviewMode::IfWarnings => Self::IfWarnings,
        }
    }
}

impl From<wealthfolio_core::activities::ImportRunSummary> for ImportRunSummary {
    fn from(value: wealthfolio_core::activities::ImportRunSummary) -> Self {
        Self {
            fetched: value.fetched,
            inserted: value.inserted,
            updated: value.updated,
            skipped: value.skipped,
            warnings: value.warnings,
            errors: value.errors,
            removed: value.removed,
            assets_created: value.assets_created,
        }
    }
}

impl From<ImportRunSummary> for wealthfolio_core::activities::ImportRunSummary {
    fn from(value: ImportRunSummary) -> Self {
        Self {
            fetched: value.fetched,
            inserted: value.inserted,
            updated: value.updated,
            skipped: value.skipped,
            warnings: value.warnings,
            errors: value.errors,
            removed: value.removed,
            assets_created: value.assets_created,
        }
    }
}

impl From<wealthfolio_core::activities::ImportRun> for ImportRun {
    fn from(value: wealthfolio_core::activities::ImportRun) -> Self {
        Self {
            id: value.id,
            account_id: value.account_id,
            source_system: value.source_system,
            run_type: value.run_type.into(),
            mode: value.mode.into(),
            status: value.status.into(),
            started_at: value.started_at,
            finished_at: value.finished_at,
            review_mode: value.review_mode.into(),
            applied_at: value.applied_at,
            checkpoint_in: value.checkpoint_in,
            checkpoint_out: value.checkpoint_out,
            summary: value.summary.map(Into::into),
            warnings: value.warnings,
            error: value.error,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl From<ImportRun> for wealthfolio_core::activities::ImportRun {
    fn from(value: ImportRun) -> Self {
        Self {
            id: value.id,
            account_id: value.account_id,
            source_system: value.source_system,
            run_type: value.run_type.into(),
            mode: value.mode.into(),
            status: value.status.into(),
            started_at: value.started_at,
            finished_at: value.finished_at,
            review_mode: value.review_mode.into(),
            applied_at: value.applied_at,
            checkpoint_in: value.checkpoint_in,
            checkpoint_out: value.checkpoint_out,
            summary: value.summary.map(Into::into),
            warnings: value.warnings,
            error: value.error,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}
