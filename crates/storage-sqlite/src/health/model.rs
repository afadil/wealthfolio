//! Database models for health issue dismissals.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for health issue dismissals
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
#[diesel(table_name = crate::schema::health_issue_dismissals)]
#[diesel(primary_key(issue_id))]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct HealthIssueDismissalDB {
    pub issue_id: String,
    pub dismissed_at: String,
    pub data_hash: String,
}

// Conversion to domain model
impl From<HealthIssueDismissalDB> for wealthfolio_core::health::IssueDismissal {
    fn from(db: HealthIssueDismissalDB) -> Self {
        Self {
            issue_id: db.issue_id,
            dismissed_at: chrono::DateTime::parse_from_rfc3339(&db.dismissed_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now()),
            data_hash: db.data_hash,
        }
    }
}

impl From<wealthfolio_core::health::IssueDismissal> for HealthIssueDismissalDB {
    fn from(domain: wealthfolio_core::health::IssueDismissal) -> Self {
        Self {
            issue_id: domain.issue_id,
            dismissed_at: domain.dismissed_at.to_rfc3339(),
            data_hash: domain.data_hash,
        }
    }
}
