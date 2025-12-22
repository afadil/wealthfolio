//! Database models for platforms/brokerages.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Domain model representing a platform/brokerage
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    /// Slug identifier (e.g., "QUESTRADE", "INTERACTIVE_BROKERS")
    pub id: String,
    /// Display name of the platform
    pub name: Option<String>,
    /// URL to the platform's website
    pub url: String,
    /// External UUID from the broker API
    pub external_id: Option<String>,
}

/// Database model for platforms
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
#[diesel(table_name = crate::schema::platforms)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct PlatformDB {
    pub id: String,
    pub name: Option<String>,
    pub url: String,
    pub external_id: Option<String>,
}

impl From<PlatformDB> for Platform {
    fn from(db: PlatformDB) -> Self {
        Self {
            id: db.id,
            name: db.name,
            url: db.url,
            external_id: db.external_id,
        }
    }
}

impl From<Platform> for PlatformDB {
    fn from(p: Platform) -> Self {
        Self {
            id: p.id,
            name: p.name,
            url: p.url,
            external_id: p.external_id,
        }
    }
}
