//! Repository for managing platform/brokerage data in the local database.

use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db::{get_connection, WriteHandle};
use crate::errors::Result;
use crate::schema::platforms;
use crate::schema::platforms::dsl::*;

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

/// Repository for platform CRUD operations
pub struct PlatformRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl PlatformRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    /// Get a platform by its slug ID
    pub fn get_by_id(&self, platform_id: &str) -> Result<Option<Platform>> {
        let mut conn = get_connection(&self.pool)?;

        let result = platforms
            .select(PlatformDB::as_select())
            .find(platform_id)
            .first::<PlatformDB>(&mut conn)
            .optional()?;

        Ok(result.map(Platform::from))
    }

    /// Get a platform by its external UUID
    pub fn get_by_external_id(&self, ext_id: &str) -> Result<Option<Platform>> {
        let mut conn = get_connection(&self.pool)?;

        let result = platforms
            .select(PlatformDB::as_select())
            .filter(external_id.eq(ext_id))
            .first::<PlatformDB>(&mut conn)
            .optional()?;

        Ok(result.map(Platform::from))
    }

    /// List all platforms
    pub fn list(&self) -> Result<Vec<Platform>> {
        let mut conn = get_connection(&self.pool)?;

        let results = platforms
            .select(PlatformDB::as_select())
            .order(name.asc())
            .load::<PlatformDB>(&mut conn)?;

        Ok(results.into_iter().map(Platform::from).collect())
    }

    /// Upsert a platform (insert or update on conflict)
    pub async fn upsert(&self, platform: Platform) -> Result<Platform> {
        let platform_db: PlatformDB = platform.into();

        self.writer
            .exec(move |conn| {
                // Try to insert, on conflict update
                diesel::insert_into(platforms::table)
                    .values(&platform_db)
                    .on_conflict(platforms::id)
                    .do_update()
                    .set((
                        platforms::name.eq(&platform_db.name),
                        platforms::url.eq(&platform_db.url),
                        platforms::external_id.eq(&platform_db.external_id),
                    ))
                    .execute(conn)?;

                // Return the platform
                Ok(Platform::from(platform_db))
            })
            .await
    }

    /// Delete a platform by ID
    pub async fn delete(&self, platform_id: &str) -> Result<usize> {
        let id_to_delete = platform_id.to_string();
        self.writer
            .exec(move |conn| {
                let affected = diesel::delete(platforms.find(id_to_delete)).execute(conn)?;
                Ok(affected)
            })
            .await
    }
}
