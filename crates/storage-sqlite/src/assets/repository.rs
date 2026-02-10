use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use wealthfolio_core::assets::{Asset, AssetRepositoryTrait, NewAsset, UpdateAssetProfile};
use wealthfolio_core::{Error, Result};

use super::model::{AssetDB, InsertableAssetDB};
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{activities, assets, quotes};
use crate::utils::chunk_for_sqlite;

/// Repository for managing asset data in the database
pub struct AssetRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl AssetRepository {
    /// Creates a new AssetRepository instance
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    /// Retrieves an asset by its ID
    pub fn get_by_id_impl(&self, asset_id: &str) -> Result<Asset> {
        let mut conn = get_connection(&self.pool)?;

        let result = assets::table
            .select(AssetDB::as_select())
            .find(asset_id)
            .first::<AssetDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(result.into())
    }

    /// Lists all assets in the database
    pub fn list_impl(&self) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .select(AssetDB::as_select())
            .load::<AssetDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }

    pub fn list_by_asset_ids_impl(&self, asset_ids: &[String]) -> Result<Vec<Asset>> {
        if asset_ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut conn = get_connection(&self.pool)?;
        let mut all_results = Vec::new();

        // Chunk the asset_ids to avoid SQLite parameter limits
        for chunk in chunk_for_sqlite(asset_ids) {
            let results = assets::table
                .select(AssetDB::as_select())
                .filter(assets::id.eq_any(chunk))
                .load::<AssetDB>(&mut conn)
                .map_err(StorageError::from)?;

            all_results.extend(results.into_iter().map(Asset::from));
        }

        Ok(all_results)
    }

    /// Search for assets by display_code or name (case-insensitive partial match).
    pub fn search_by_symbol_impl(&self, query: &str) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let pattern = format!("%{}%", query.to_uppercase());

        let results = assets::table
            .select(AssetDB::as_select())
            .filter(diesel::dsl::sql::<diesel::sql_types::Bool>(&format!(
                "UPPER(display_code) LIKE '{}'",
                pattern.replace('\'', "''")
            )))
            .or_filter(diesel::dsl::sql::<diesel::sql_types::Bool>(&format!(
                "UPPER(instrument_symbol) LIKE '{}'",
                pattern.replace('\'', "''")
            )))
            .or_filter(diesel::dsl::sql::<diesel::sql_types::Bool>(&format!(
                "UPPER(name) LIKE '{}'",
                pattern.replace('\'', "''")
            )))
            .order(assets::display_code.asc())
            .limit(50)
            .load::<AssetDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }
}

#[async_trait]
impl AssetRepositoryTrait for AssetRepository {
    /// Creates a new asset in the database
    async fn create(&self, new_asset: NewAsset) -> Result<Asset> {
        new_asset.validate()?;
        let asset_db: InsertableAssetDB = new_asset.into();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Asset> {
                let result_db = diesel::insert_into(assets::table)
                    .values(&asset_db)
                    .get_result::<AssetDB>(conn)
                    .map_err(StorageError::from)?;
                Ok(result_db.into())
            })
            .await
    }

    async fn create_batch(&self, new_assets: Vec<NewAsset>) -> Result<Vec<Asset>> {
        if new_assets.is_empty() {
            return Ok(Vec::new());
        }
        for asset in &new_assets {
            asset.validate()?;
        }
        let assets_db: Vec<InsertableAssetDB> = new_assets.into_iter().map(|a| a.into()).collect();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Vec<Asset>> {
                // INSERT OR IGNORE: skip assets that already exist
                for asset_db in &assets_db {
                    diesel::insert_into(assets::table)
                        .values(asset_db)
                        .on_conflict(assets::id)
                        .do_nothing()
                        .execute(conn)
                        .map_err(StorageError::from)?;
                }

                // Re-read all to return the full set
                let ids: Vec<String> = assets_db.into_iter().filter_map(|a| a.id).collect();
                let results = assets::table
                    .filter(assets::id.eq_any(&ids))
                    .load::<AssetDB>(conn)
                    .map_err(StorageError::from)?;
                Ok(results.into_iter().map(|r| r.into()).collect())
            })
            .await
    }

    /// Updates an existing asset in the database
    async fn update_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset> {
        payload.validate()?;
        let asset_id_owned = asset_id.to_string();
        let payload_owned = payload.clone();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Asset> {
                // First, get the existing asset to preserve fields if not provided
                let existing: AssetDB = assets::table
                    .filter(assets::id.eq(&asset_id_owned))
                    .first(conn)
                    .map_err(StorageError::from)?;

                // Use payload metadata if provided, otherwise preserve existing
                let metadata_json = match &payload_owned.metadata {
                    Some(new_metadata) => {
                        Some(serde_json::to_string(new_metadata).unwrap_or_default())
                    }
                    None => existing.metadata.clone(),
                };

                // Serialize kind to string if present
                let kind_str = payload_owned
                    .kind
                    .as_ref()
                    .map(|k| k.as_db_str().to_string());

                // Serialize quote_mode to string if present
                let quote_mode_str = payload_owned
                    .quote_mode
                    .as_ref()
                    .map(|qm| qm.as_db_str().to_string());

                // Serialize provider_config to JSON string if present
                let provider_config_str = payload_owned
                    .provider_config
                    .as_ref()
                    .map(|pc| serde_json::to_string(pc).unwrap_or_default());

                // Instrument fields - use payload if present, otherwise keep existing
                let instrument_type_value = payload_owned
                    .instrument_type
                    .as_ref()
                    .map(|t| Some(t.as_db_str().to_string()))
                    .unwrap_or_else(|| existing.instrument_type.clone());

                let instrument_symbol_value = if payload_owned.instrument_symbol.is_some() {
                    payload_owned.instrument_symbol.clone()
                } else {
                    existing.instrument_symbol.clone()
                };

                let instrument_exchange_mic_value =
                    if payload_owned.instrument_exchange_mic.is_some() {
                        payload_owned.instrument_exchange_mic.clone()
                    } else {
                        existing.instrument_exchange_mic.clone()
                    };

                // Build the update query
                let result_db = if let Some(kind_value) = kind_str {
                    diesel::update(assets::table.filter(assets::id.eq(&asset_id_owned)))
                        .set((
                            assets::name.eq(&payload_owned.name),
                            assets::kind.eq(kind_value),
                            assets::display_code.eq(&payload_owned.display_code),
                            assets::notes.eq(&payload_owned.notes),
                            assets::metadata.eq(&metadata_json),
                            assets::quote_mode.eq(quote_mode_str
                                .clone()
                                .unwrap_or_else(|| "MARKET".to_string())),
                            assets::instrument_type.eq(&instrument_type_value),
                            assets::instrument_symbol.eq(&instrument_symbol_value),
                            assets::instrument_exchange_mic.eq(&instrument_exchange_mic_value),
                            assets::provider_config.eq(&provider_config_str),
                        ))
                        .get_result::<AssetDB>(conn)
                        .map_err(StorageError::from)?
                } else {
                    diesel::update(assets::table.filter(assets::id.eq(&asset_id_owned)))
                        .set((
                            assets::name.eq(&payload_owned.name),
                            assets::display_code.eq(&payload_owned.display_code),
                            assets::notes.eq(&payload_owned.notes),
                            assets::metadata.eq(&metadata_json),
                            assets::quote_mode
                                .eq(quote_mode_str.unwrap_or_else(|| "MARKET".to_string())),
                            assets::instrument_type.eq(&instrument_type_value),
                            assets::instrument_symbol.eq(&instrument_symbol_value),
                            assets::instrument_exchange_mic.eq(&instrument_exchange_mic_value),
                            assets::provider_config.eq(&provider_config_str),
                        ))
                        .get_result::<AssetDB>(conn)
                        .map_err(StorageError::from)?
                };
                Ok(result_db.into())
            })
            .await
    }

    /// Updates the quote mode of an asset (MARKET, MANUAL)
    async fn update_quote_mode(&self, asset_id: &str, quote_mode: &str) -> Result<Asset> {
        let asset_id_owned = asset_id.to_string();
        let quote_mode_owned = quote_mode.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Asset> {
                let result_db = diesel::update(assets::table.filter(assets::id.eq(asset_id_owned)))
                    .set(assets::quote_mode.eq(quote_mode_owned))
                    .get_result::<AssetDB>(conn)
                    .map_err(StorageError::from)?;
                Ok(result_db.into())
            })
            .await
    }

    /// Retrieves an asset by its ID
    fn get_by_id(&self, asset_id: &str) -> Result<Asset> {
        self.get_by_id_impl(asset_id)
    }

    /// Lists all assets in the database
    fn list(&self) -> Result<Vec<Asset>> {
        self.list_impl()
    }

    /// Lists assets by their asset IDs
    fn list_by_asset_ids(&self, asset_ids: &[String]) -> Result<Vec<Asset>> {
        self.list_by_asset_ids_impl(asset_ids)
    }

    async fn delete(&self, asset_id: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Check for activities constraint
                let activity_count: i64 = activities::table
                    .filter(activities::asset_id.eq(&asset_id_owned))
                    .count()
                    .get_result(conn)
                    .map_err(StorageError::from)?;

                if activity_count > 0 {
                    return Err(Error::ConstraintViolation(
                        "Cannot delete asset: it has existing activities. Please delete all associated activities first.".to_string()
                    ));
                }

                // Delete all quotes for this asset (by asset_id)
                diesel::delete(quotes::table.filter(quotes::asset_id.eq(&asset_id_owned)))
                    .execute(conn)
                    .map_err(StorageError::from)?;

                // Delete the asset
                diesel::delete(assets::table.filter(assets::id.eq(&asset_id_owned)))
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    fn search_by_symbol(&self, query: &str) -> Result<Vec<Asset>> {
        self.search_by_symbol_impl(query)
    }

    /// Find an asset by its instrument_key
    fn find_by_instrument_key(&self, instrument_key: &str) -> Result<Option<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let result = assets::table
            .select(AssetDB::as_select())
            .filter(assets::instrument_key.eq(instrument_key))
            .first::<AssetDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(Asset::from))
    }

    async fn cleanup_legacy_metadata(&self, asset_id: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Get current metadata
                let existing: AssetDB = assets::table
                    .filter(assets::id.eq(&asset_id_owned))
                    .first(conn)
                    .map_err(StorageError::from)?;

                // Parse current metadata and remove $.legacy, keep $.identifiers
                let new_metadata: Option<String> = existing.metadata.and_then(|meta_str| {
                    serde_json::from_str::<serde_json::Value>(&meta_str)
                        .ok()
                        .and_then(|meta| {
                            let identifiers = meta.get("identifiers").cloned();
                            identifiers
                                .map(|ids| serde_json::json!({ "identifiers": ids }).to_string())
                        })
                });

                // Update the asset
                diesel::update(assets::table.filter(assets::id.eq(&asset_id_owned)))
                    .set(assets::metadata.eq(new_metadata))
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(())
            })
            .await
    }

    async fn deactivate(&self, asset_id: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::update(assets::table.filter(assets::id.eq(&asset_id_owned)))
                    .set(assets::is_active.eq(0))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }

    async fn reactivate(&self, asset_id: &str) -> Result<()> {
        let asset_id_owned = asset_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::update(assets::table.filter(assets::id.eq(&asset_id_owned)))
                    .set(assets::is_active.eq(1))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }

    async fn copy_user_metadata(&self, source_id: &str, target_id: &str) -> Result<()> {
        let source_id_owned = source_id.to_string();
        let target_id_owned = target_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // Get source asset
                let source: AssetDB = assets::table
                    .filter(assets::id.eq(&source_id_owned))
                    .first(conn)
                    .map_err(StorageError::from)?;

                // Only copy notes (user-editable field) if source has content
                // Don't overwrite target's notes if source is empty
                if let Some(ref notes) = source.notes {
                    if !notes.trim().is_empty() {
                        diesel::update(assets::table.filter(assets::id.eq(&target_id_owned)))
                            .set(assets::notes.eq(notes))
                            .execute(conn)
                            .map_err(StorageError::from)?;
                    }
                }

                Ok(())
            })
            .await
    }

    async fn deactivate_orphaned_investments(&self) -> Result<Vec<String>> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Vec<String>> {
                // Find active INVESTMENT assets with zero activities
                let orphan_ids: Vec<String> = assets::table
                    .select(assets::id)
                    .filter(assets::kind.eq("INVESTMENT"))
                    .filter(assets::is_active.eq(1))
                    .filter(diesel::dsl::sql::<diesel::sql_types::Bool>(
                        "id NOT IN (SELECT DISTINCT asset_id FROM activities WHERE asset_id IS NOT NULL)",
                    ))
                    .load::<String>(conn)
                    .map_err(StorageError::from)?;

                if !orphan_ids.is_empty() {
                    diesel::update(
                        assets::table.filter(assets::id.eq_any(&orphan_ids)),
                    )
                    .set(assets::is_active.eq(0))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                }

                Ok(orphan_ids)
            })
            .await
    }
}
