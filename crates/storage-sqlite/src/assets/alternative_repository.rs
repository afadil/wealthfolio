//! SQLite repository implementation for alternative assets.
//!
//! This module provides the database operations for alternative assets
//! (properties, vehicles, collectibles, precious metals, liabilities).
//!
//! Alternative assets use a simplified model - no accounts or activities,
//! just asset records + valuation quotes.

use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use wealthfolio_core::assets::AlternativeAssetRepositoryTrait;
use wealthfolio_core::errors::DatabaseError;
use wealthfolio_core::{Error, Result};

use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{assets, quotes};

/// Repository for managing alternative asset data in the database.
///
/// This repository handles transactional operations for alternative assets,
/// including metadata updates and cascading deletions.
pub struct AlternativeAssetRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl AlternativeAssetRepository {
    /// Creates a new AlternativeAssetRepository instance.
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl AlternativeAssetRepositoryTrait for AlternativeAssetRepository {
    /// Deletes an alternative asset and associated data transactionally.
    ///
    /// This operation performs the following steps in a transaction:
    /// 1. Unlinks any liabilities that reference this asset (removes linked_asset_id from metadata)
    /// 2. Deletes all quotes for this asset WHERE data_source = 'MANUAL'
    /// 3. Deletes the asset record
    ///
    /// Note: No account or activity deletion needed - alternative assets don't create them.
    async fn delete_alternative_asset(&self, asset_id: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Step 1: Find and unlink any liabilities that reference this asset
                let linked_pattern = format!("%\"linked_asset_id\":\"{}\"%", asset_id_owned);

                let linked_liabilities: Vec<(String, Option<String>)> = assets::table
                    .filter(assets::metadata.like(&linked_pattern))
                    .select((assets::id, assets::metadata))
                    .load(conn)
                    .map_err(StorageError::from)?;

                for (liability_id, metadata_opt) in linked_liabilities {
                    if let Some(metadata_str) = metadata_opt {
                        if let Ok(mut metadata_json) =
                            serde_json::from_str::<serde_json::Value>(&metadata_str)
                        {
                            if let Some(obj) = metadata_json.as_object_mut() {
                                obj.remove("linked_asset_id");
                            }

                            let updated_metadata = serde_json::to_string(&metadata_json).ok();

                            diesel::update(assets::table.filter(assets::id.eq(&liability_id)))
                                .set(assets::metadata.eq(updated_metadata))
                                .execute(conn)
                                .map_err(StorageError::from)?;
                        }
                    }
                }

                // Step 2: Delete all quotes for this asset with data_source = 'MANUAL'
                diesel::delete(
                    quotes::table
                        .filter(quotes::symbol.eq(&asset_id_owned))
                        .filter(quotes::data_source.eq("MANUAL")),
                )
                .execute(conn)
                .map_err(StorageError::from)?;

                // Step 3: Delete the asset record
                let assets_deleted =
                    diesel::delete(assets::table.filter(assets::id.eq(&asset_id_owned)))
                        .execute(conn)
                        .map_err(StorageError::from)?;

                if assets_deleted == 0 {
                    return Err(Error::Database(DatabaseError::NotFound(format!(
                        "Alternative asset not found: {}",
                        asset_id_owned
                    ))));
                }

                Ok(())
            })
            .await
    }

    /// Updates an asset's metadata.
    ///
    /// This is used for linking/unlinking liabilities to assets.
    /// The metadata is stored as a JSON string in the database.
    async fn update_asset_metadata(
        &self,
        asset_id: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<()> {
        let asset_id_owned = asset_id.to_string();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Serialize metadata to JSON string if present
                let metadata_str = metadata.and_then(|v| serde_json::to_string(&v).ok());

                let updated = diesel::update(assets::table.filter(assets::id.eq(&asset_id_owned)))
                    .set(assets::metadata.eq(metadata_str))
                    .execute(conn)
                    .map_err(StorageError::from)?;

                if updated == 0 {
                    return Err(Error::Database(DatabaseError::NotFound(format!(
                        "Asset not found: {}",
                        asset_id_owned
                    ))));
                }

                Ok(())
            })
            .await
    }

    /// Finds all liabilities linked to the given asset.
    ///
    /// This queries assets where the metadata contains linked_asset_id = asset_id.
    /// Returns a list of liability asset IDs.
    fn find_liabilities_linked_to(&self, linked_asset_id: &str) -> Result<Vec<String>> {
        let mut conn = get_connection(&self.pool)?;

        // Build a pattern to match the linked_asset_id in the metadata JSON
        // Metadata is stored as JSON string, so we look for: "linked_asset_id":"PROP-xxxxx"
        let linked_pattern = format!("%\"linked_asset_id\":\"{}\"%", linked_asset_id);

        let liability_ids: Vec<String> = assets::table
            .filter(assets::metadata.like(&linked_pattern))
            .select(assets::id)
            .load(&mut conn)
            .map_err(StorageError::from)?;

        Ok(liability_ids)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_linked_pattern_construction() {
        let asset_id = "PROP-a1b2c3d4";
        let pattern = format!("%\"linked_asset_id\":\"{}\"%", asset_id);
        assert_eq!(pattern, "%\"linked_asset_id\":\"PROP-a1b2c3d4\"%");

        // This pattern would match JSON like:
        // {"linked_asset_id":"PROP-a1b2c3d4","liability_type":"mortgage"}
    }
}
