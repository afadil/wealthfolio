//! Database models for import runs.

use chrono::Utc;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use wealthfolio_core::sync::{
    ImportRun, ImportRunMode, ImportRunStatus, ImportRunType, ReviewMode,
};

/// Database model for import runs
#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::import_runs)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ImportRunDB {
    pub id: String,
    pub account_id: String,
    pub source_system: String,
    pub run_type: String,
    pub mode: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub review_mode: String,
    pub applied_at: Option<String>,
    pub checkpoint_in: Option<String>,
    pub checkpoint_out: Option<String>,
    pub summary: Option<String>,
    pub warnings: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<ImportRunDB> for ImportRun {
    fn from(db: ImportRunDB) -> Self {
        use chrono::DateTime;

        Self {
            id: db.id,
            account_id: db.account_id,
            source_system: db.source_system,
            run_type: serde_json::from_str(&format!("\"{}\"", db.run_type))
                .unwrap_or(ImportRunType::Sync),
            mode: serde_json::from_str(&format!("\"{}\"", db.mode))
                .unwrap_or(ImportRunMode::Incremental),
            status: serde_json::from_str(&format!("\"{}\"", db.status))
                .unwrap_or(ImportRunStatus::Running),
            started_at: DateTime::parse_from_rfc3339(&db.started_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            finished_at: db.finished_at.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            }),
            review_mode: serde_json::from_str(&format!("\"{}\"", db.review_mode))
                .unwrap_or(ReviewMode::Never),
            applied_at: db.applied_at.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            }),
            checkpoint_in: db.checkpoint_in.and_then(|s| serde_json::from_str(&s).ok()),
            checkpoint_out: db
                .checkpoint_out
                .and_then(|s| serde_json::from_str(&s).ok()),
            summary: db.summary.and_then(|s| serde_json::from_str(&s).ok()),
            warnings: db.warnings.and_then(|s| serde_json::from_str(&s).ok()),
            error: db.error,
            created_at: DateTime::parse_from_rfc3339(&db.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            updated_at: DateTime::parse_from_rfc3339(&db.updated_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }
    }
}

impl From<ImportRun> for ImportRunDB {
    fn from(domain: ImportRun) -> Self {
        Self {
            id: domain.id,
            account_id: domain.account_id,
            source_system: domain.source_system,
            run_type: serde_json::to_string(&domain.run_type)
                .unwrap_or_default()
                .trim_matches('"')
                .to_string(),
            mode: serde_json::to_string(&domain.mode)
                .unwrap_or_default()
                .trim_matches('"')
                .to_string(),
            status: serde_json::to_string(&domain.status)
                .unwrap_or_default()
                .trim_matches('"')
                .to_string(),
            started_at: domain.started_at.to_rfc3339(),
            finished_at: domain.finished_at.map(|dt| dt.to_rfc3339()),
            review_mode: serde_json::to_string(&domain.review_mode)
                .unwrap_or_default()
                .trim_matches('"')
                .to_string(),
            applied_at: domain.applied_at.map(|dt| dt.to_rfc3339()),
            checkpoint_in: domain
                .checkpoint_in
                .map(|v| serde_json::to_string(&v).unwrap_or_default()),
            checkpoint_out: domain
                .checkpoint_out
                .map(|v| serde_json::to_string(&v).unwrap_or_default()),
            summary: domain
                .summary
                .map(|s| serde_json::to_string(&s).unwrap_or_default()),
            warnings: domain
                .warnings
                .map(|w| serde_json::to_string(&w).unwrap_or_default()),
            error: domain.error,
            created_at: domain.created_at.to_rfc3339(),
            updated_at: domain.updated_at.to_rfc3339(),
        }
    }
}
