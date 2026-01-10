use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use wealthfolio_core::assets::{Asset, AssetRepositoryTrait, NewAsset, UpdateAssetProfile};
use wealthfolio_core::{Error, Result};

use super::model::AssetDB;
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{activities, assets, quotes};

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

    /// Lists currency assets for a given base currency
    pub fn list_cash_assets_impl(&self, base_currency: &str) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .select(AssetDB::as_select())
            .filter(assets::kind.eq("CASH"))
            .filter(assets::symbol.like(format!("{}%", base_currency)))
            .load::<AssetDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }

    pub fn list_by_symbols_impl(&self, symbols: &Vec<String>) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .select(AssetDB::as_select())
            .filter(assets::id.eq_any(symbols))
            .load::<AssetDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }

    /// Search for assets by symbol (case-insensitive partial match).
    pub fn search_by_symbol_impl(&self, query: &str) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        // Use LIKE for case-insensitive partial matching
        let pattern = format!("%{}%", query.to_uppercase());

        let results = assets::table
            .select(AssetDB::as_select())
            .filter(
                diesel::dsl::sql::<diesel::sql_types::Bool>(&format!(
                    "UPPER(symbol) LIKE '{}'",
                    pattern.replace('\'', "''")
                ))
            )
            .or_filter(
                diesel::dsl::sql::<diesel::sql_types::Bool>(&format!(
                    "UPPER(name) LIKE '{}'",
                    pattern.replace('\'', "''")
                ))
            )
            .order(assets::symbol.asc())
            .limit(50) // Limit results to avoid huge result sets
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
        let asset_db: AssetDB = new_asset.into();

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

    /// Updates an existing asset in the database
    async fn update_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset> {
        payload.validate()?;
        let asset_id_owned = asset_id.to_string();
        let payload_owned = payload.clone();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Asset> {
                // First, get the existing asset to preserve its metadata
                let existing: AssetDB = assets::table
                    .filter(assets::id.eq(&asset_id_owned))
                    .first(conn)
                    .map_err(StorageError::from)?;

                // Preserve existing metadata (includes legacy data from migration)
                let metadata_json = existing.metadata;

                // Serialize kind to string if present
                let kind_str = payload_owned.kind.as_ref().map(|k| k.as_db_str().to_string());

                // Serialize pricing_mode to string if present
                let pricing_mode_str = payload_owned
                    .pricing_mode
                    .as_ref()
                    .map(|pm| serde_json::to_string(pm).unwrap_or_default().trim_matches('"').to_string());

                // Serialize provider_overrides to JSON string if present
                let provider_overrides_str = payload_owned
                    .provider_overrides
                    .as_ref()
                    .map(|po| serde_json::to_string(po).unwrap_or_default());

                // Determine exchange_mic - use payload if present, otherwise keep existing
                let exchange_mic_value = if payload_owned.exchange_mic.is_some() {
                    payload_owned.exchange_mic.clone()
                } else {
                    existing.exchange_mic.clone()
                };

                // Build the update query - only include kind if it's provided
                let result_db = if let Some(kind_value) = kind_str {
                    diesel::update(assets::table.filter(assets::id.eq(&asset_id_owned)))
                        .set((
                            assets::name.eq(&payload_owned.name),
                            assets::kind.eq(kind_value),
                            assets::exchange_mic.eq(&exchange_mic_value),
                            assets::notes.eq(&payload_owned.notes),
                            assets::metadata.eq(&metadata_json),
                            assets::pricing_mode.eq(pricing_mode_str.clone().unwrap_or_else(|| "MARKET".to_string())),
                            assets::provider_overrides.eq(&provider_overrides_str),
                        ))
                        .get_result::<AssetDB>(conn)
                        .map_err(StorageError::from)?
                } else {
                    diesel::update(assets::table.filter(assets::id.eq(&asset_id_owned)))
                        .set((
                            assets::name.eq(&payload_owned.name),
                            assets::exchange_mic.eq(&exchange_mic_value),
                            assets::notes.eq(&payload_owned.notes),
                            assets::metadata.eq(&metadata_json),
                            assets::pricing_mode.eq(pricing_mode_str.unwrap_or_else(|| "MARKET".to_string())),
                            assets::provider_overrides.eq(&provider_overrides_str),
                        ))
                        .get_result::<AssetDB>(conn)
                        .map_err(StorageError::from)?
                };
                Ok(result_db.into())
            })
            .await
    }

    /// Updates the preferred provider of an asset
    /// Note: data_source column no longer exists; this now updates preferred_provider
    async fn update_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        let asset_id_owned = asset_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Asset> {
                let result_db = diesel::update(assets::table.filter(assets::id.eq(asset_id_owned)))
                    .set(assets::preferred_provider.eq(Some(data_source)))
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

    /// Lists currency assets for a given base currency
    fn list_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>> {
        self.list_cash_assets_impl(base_currency)
    }

    /// Lists assets by their symbols
    fn list_by_symbols(&self, symbols: &[String]) -> Result<Vec<Asset>> {
        self.list_by_symbols_impl(&symbols.to_vec())
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
}
