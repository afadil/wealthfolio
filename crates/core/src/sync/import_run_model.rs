//! Import run domain models.

use crate::Result;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Type of import run
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunType {
    /// API pull (SnapTrade, Plaid)
    Sync,
    /// CSV/manual upload
    Import,
}

/// Mode of import run
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunMode {
    /// First sync ever
    Initial,
    /// Normal incremental sync
    Incremental,
    /// Historical data fetch
    Backfill,
    /// Fix/reconcile data
    Repair,
}

/// Status of import run
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunStatus {
    /// In progress
    #[default]
    Running,
    /// Successfully committed
    Applied,
    /// Waiting for user review
    NeedsReview,
    /// Error occurred
    Failed,
    /// User cancelled
    Cancelled,
}

/// Review mode for import runs
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewMode {
    /// Auto-apply everything
    #[default]
    Never,
    /// Always require review
    Always,
    /// Review only if warnings
    IfWarnings,
}

/// Represents a single import/sync run for an account
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRun {
    /// Unique identifier for the import run
    pub id: String,
    /// Account this import belongs to
    pub account_id: String,
    /// Source system (e.g., "snaptrade", "plaid", "csv")
    pub source_system: String,
    /// Type of run (sync or import)
    pub run_type: ImportRunType,
    /// Mode of the run
    pub mode: ImportRunMode,
    /// Current status
    pub status: ImportRunStatus,
    /// When the run started
    pub started_at: DateTime<Utc>,
    /// When the run finished (if completed)
    pub finished_at: Option<DateTime<Utc>>,
    /// Review mode for this run
    pub review_mode: ReviewMode,
    /// When changes were applied (if applicable)
    pub applied_at: Option<DateTime<Utc>>,
    /// Input checkpoint (for incremental syncs)
    pub checkpoint_in: Option<Value>,
    /// Output checkpoint (for next sync)
    pub checkpoint_out: Option<Value>,
    /// Summary of the run
    pub summary: Option<ImportRunSummary>,
    /// List of warnings
    pub warnings: Option<Vec<String>>,
    /// Error message if failed
    pub error: Option<String>,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

/// Summary statistics for an import run
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportRunSummary {
    /// Number of records fetched from source
    pub fetched: u32,
    /// Number of new records inserted
    pub inserted: u32,
    /// Number of existing records updated
    pub updated: u32,
    /// Number of records skipped
    pub skipped: u32,
    /// Number of warnings
    pub warnings: u32,
    /// Number of errors
    pub errors: u32,
    /// Number of records removed
    pub removed: u32,
    /// Number of assets created during import
    pub assets_created: u32,
}

impl ImportRun {
    /// Create a new import run
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

    /// Mark the run as completed successfully
    pub fn complete(&mut self) {
        self.status = ImportRunStatus::Applied;
        self.finished_at = Some(Utc::now());
        self.applied_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Mark the run as failed
    pub fn fail(&mut self, error: String) {
        self.status = ImportRunStatus::Failed;
        self.finished_at = Some(Utc::now());
        self.error = Some(error);
        self.updated_at = Utc::now();
    }

    /// Mark as needing review
    pub fn mark_needs_review(&mut self) {
        self.status = ImportRunStatus::NeedsReview;
        self.finished_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }
}

/// Trait for ImportRun persistence operations
#[async_trait]
pub trait ImportRunRepositoryTrait: Send + Sync {
    /// Create a new import run
    async fn create(&self, import_run: ImportRun) -> Result<ImportRun>;

    /// Update an import run
    async fn update(&self, import_run: ImportRun) -> Result<ImportRun>;

    /// Get import run by ID
    fn get_by_id(&self, id: &str) -> Result<Option<ImportRun>>;

    /// Get recent import runs for an account
    fn get_recent_for_account(&self, account_id: &str, limit: i64) -> Result<Vec<ImportRun>>;
}
