use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use log::debug;
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
            .filter(assets::asset_type.eq("CASH"))
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
                let normalized_quote_symbol = payload_owned
                    .quote_symbol
                    .as_ref()
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty());

                let result_db = diesel::update(assets::table.filter(assets::id.eq(asset_id_owned)))
                    .set((
                        assets::name.eq(&payload_owned.name),
                        assets::sectors.eq(&payload_owned.sectors),
                        assets::countries.eq(&payload_owned.countries),
                        assets::notes.eq(&payload_owned.notes),
                        assets::asset_sub_class.eq(&payload_owned.asset_sub_class),
                        assets::asset_class.eq(&payload_owned.asset_class),
                        assets::quote_symbol.eq(normalized_quote_symbol),
                    ))
                    .get_result::<AssetDB>(conn)
                    .map_err(StorageError::from)?;
                Ok(result_db.into())
            })
            .await
    }

    /// Updates the data source of an asset
    async fn update_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        debug!(
            "Updating data source for asset {} to {}",
            asset_id, data_source
        );
        let asset_id_owned = asset_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Asset> {
                let result_db = diesel::update(assets::table.filter(assets::id.eq(asset_id_owned)))
                    .set(assets::data_source.eq(data_source))
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

                // Get the asset symbol for deleting quotes
                let asset_symbol: String = assets::table
                    .filter(assets::id.eq(&asset_id_owned))
                    .select(assets::symbol)
                    .first(conn)
                    .map_err(StorageError::from)?;

                // Delete all quotes for this asset (by symbol)
                diesel::delete(quotes::table.filter(quotes::symbol.eq(&asset_symbol)))
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
}
