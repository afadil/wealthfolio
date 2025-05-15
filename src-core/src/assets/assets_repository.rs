use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use crate::db::get_connection;
use crate::schema::assets;
use crate::errors::Result;

use super::assets_model::{Asset, AssetDB, NewAsset, UpdateAssetProfile};
use super::assets_traits::AssetRepositoryTrait;

/// Repository for managing asset data in the database
pub struct AssetRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
}

impl AssetRepository {
    /// Creates a new AssetRepository instance
    pub fn new(pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }

    /// Creates a new asset in the database
    pub fn create(&self, new_asset: NewAsset) -> Result<Asset> {
        new_asset.validate()?;
        let asset_db: AssetDB = new_asset.into();
       
        let mut conn = get_connection(&self.pool)?;

        let result = diesel::insert_into(assets::table)
            .values(&asset_db)
            .get_result::<AssetDB>(&mut conn)?;

        Ok(result.into())
    }

    /// Updates an existing asset in the database
    pub fn update_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset> {
        payload.validate()?;
        let mut conn = get_connection(&self.pool)?;

        let result = diesel::update(assets::table.filter(assets::id.eq(asset_id)))
            .set((
                assets::sectors.eq(&payload.sectors),
                assets::countries.eq(&payload.countries),
                assets::notes.eq(&payload.notes),
                assets::asset_sub_class.eq(&payload.asset_sub_class),
                assets::asset_class.eq(&payload.asset_class),
            ))
            .get_result::<AssetDB>(&mut conn)?;

        Ok(result.into())
    }

    /// Updates the data source of an asset
    pub fn update_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        let mut conn = get_connection(&self.pool)?;

        let result = diesel::update(assets::table.filter(assets::id.eq(asset_id)))
            .set(assets::data_source.eq(data_source))
            .get_result::<AssetDB>(&mut conn)?;

        Ok(result.into())
    }

    /// Retrieves an asset by its ID
    pub fn get_by_id(&self, asset_id: &str) -> Result<Asset> {
        let mut conn = get_connection(&self.pool)?;

        let result = assets::table
            .find(asset_id)
            .first::<AssetDB>(&mut conn)?;

        Ok(result.into())
    }

    /// Lists all assets in the database
    pub fn list(&self) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .load::<AssetDB>(&mut conn)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }

    /// Lists currency assets for a given base currency
    pub fn list_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .filter(assets::asset_type.eq("CASH"))
            .filter(assets::symbol.like(format!("{}%", base_currency)))
            .load::<AssetDB>(&mut conn)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }

    pub fn list_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .filter(assets::id.eq_any(symbols))
            .load::<AssetDB>(&mut conn)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }
}

impl AssetRepositoryTrait for AssetRepository {
    /// Creates a new asset in the database
    fn create(&self, new_asset: NewAsset) -> Result<Asset> {
        AssetRepository::create(self, new_asset)
    }

    /// Updates an existing asset in the database
    fn update_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset> {
        AssetRepository::update_profile(self, asset_id, payload)
    }

    /// Updates the data source of an asset
    fn update_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        AssetRepository::update_data_source(self, asset_id, data_source)
    }

    /// Retrieves an asset by its ID
    fn get_by_id(&self, asset_id: &str) -> Result<Asset> {
        AssetRepository::get_by_id(self, asset_id)
    }

    /// Lists all assets in the database
    fn list(&self) -> Result<Vec<Asset>> {
        AssetRepository::list(self)
    }

    /// Lists currency assets for a given base currency
    fn list_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>> {
        AssetRepository::list_cash_assets(self, base_currency)
    }

    /// Lists assets by their symbols
    fn list_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>> {
        AssetRepository::list_by_symbols(self, symbols)
    }
} 