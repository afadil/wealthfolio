//! Repository for managing platform/brokerage data in the local database.

use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::platforms;
use crate::schema::platforms::dsl::*;
use wealthfolio_connect::broker::PlatformRepositoryTrait;
use wealthfolio_connect::Platform as ConnectPlatform;
use wealthfolio_core::errors::Result;

use super::model::{Platform, PlatformDB};

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
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(Platform::from))
    }

    /// Get a platform by its external UUID
    pub fn get_by_external_id(&self, ext_id: &str) -> Result<Option<Platform>> {
        let mut conn = get_connection(&self.pool)?;

        let result = platforms
            .select(PlatformDB::as_select())
            .filter(external_id.eq(ext_id))
            .first::<PlatformDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(Platform::from))
    }

    /// List all platforms
    pub fn list(&self) -> Result<Vec<Platform>> {
        let mut conn = get_connection(&self.pool)?;

        let results = platforms
            .select(PlatformDB::as_select())
            .order(name.asc())
            .load::<PlatformDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Platform::from).collect())
    }

    /// Upsert a platform (insert or update on conflict)
    pub async fn upsert(&self, platform: Platform) -> Result<Platform> {
        let platform_db: PlatformDB = platform.into();

        self.writer
            .exec_tx(move |tx| {
                let existed = platforms::table
                    .find(&platform_db.id)
                    .select(platforms::id)
                    .first::<String>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?
                    .is_some();

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
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;

                if existed {
                    tx.update(&platform_db)?;
                } else {
                    tx.insert(&platform_db)?;
                }

                // Return the platform
                Ok(Platform::from(platform_db))
            })
            .await
    }

    /// Delete a platform by ID
    pub async fn delete(&self, platform_id: &str) -> Result<usize> {
        let id_to_delete = platform_id.to_string();
        self.writer
            .exec_tx(move |tx| {
                let existing_platform = platforms
                    .select(PlatformDB::as_select())
                    .find(&id_to_delete)
                    .first::<PlatformDB>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?;
                let affected = diesel::delete(platforms.find(&id_to_delete))
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;
                if affected > 0 {
                    if let Some(existing) = existing_platform.as_ref() {
                        tx.delete_model(existing);
                    }
                }
                Ok(affected)
            })
            .await
    }
}

impl From<Platform> for ConnectPlatform {
    fn from(value: Platform) -> Self {
        Self {
            id: value.id,
            name: value.name,
            url: value.url,
            external_id: value.external_id,
            kind: value.kind,
            website_url: value.website_url,
            logo_url: value.logo_url,
        }
    }
}

impl From<ConnectPlatform> for Platform {
    fn from(value: ConnectPlatform) -> Self {
        Self {
            id: value.id,
            name: value.name,
            url: value.url,
            external_id: value.external_id,
            kind: value.kind,
            website_url: value.website_url,
            logo_url: value.logo_url,
        }
    }
}

#[async_trait]
impl PlatformRepositoryTrait for PlatformRepository {
    fn get_by_id(&self, platform_id: &str) -> Result<Option<ConnectPlatform>> {
        PlatformRepository::get_by_id(self, platform_id).map(|p| p.map(Into::into))
    }

    fn get_by_external_id(&self, ext_id: &str) -> Result<Option<ConnectPlatform>> {
        PlatformRepository::get_by_external_id(self, ext_id).map(|p| p.map(Into::into))
    }

    fn list(&self) -> Result<Vec<ConnectPlatform>> {
        PlatformRepository::list(self).map(|items| items.into_iter().map(Into::into).collect())
    }

    async fn upsert(&self, platform: ConnectPlatform) -> Result<ConnectPlatform> {
        PlatformRepository::upsert(self, platform.into())
            .await
            .map(Into::into)
    }

    async fn delete(&self, platform_id: &str) -> Result<usize> {
        PlatformRepository::delete(self, platform_id).await
    }
}
