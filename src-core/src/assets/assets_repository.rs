use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use log::debug;
use std::sync::Arc;
use async_trait::async_trait;

use crate::db::{get_connection, WriteHandle};
use crate::schema::assets;
use crate::errors::Result;

use super::assets_model::{Asset, AssetDB, NewAsset, UpdateAssetProfile};
use super::assets_traits::AssetRepositoryTrait;

/// Repository for managing asset data in the database
pub struct AssetRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl AssetRepository {
    /// Creates a new AssetRepository instance
    pub fn new(pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }

    /// Retrieves an asset by its ID
    pub fn get_by_id_impl(&self, asset_id: &str) -> Result<Asset> {
        let mut conn = get_connection(&self.pool)?;

        let result = assets::table
            .find(asset_id)
            .first::<AssetDB>(&mut conn)?;

        Ok(result.into())
    }

    /// Lists all assets in the database
    pub fn list_impl(&self) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .load::<AssetDB>(&mut conn)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }

    /// Lists currency assets for a given base currency
    pub fn list_cash_assets_impl(&self, base_currency: &str) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .filter(assets::asset_type.eq("CASH"))
            .filter(assets::symbol.like(format!("{}%", base_currency)))
            .load::<AssetDB>(&mut conn)?;

        Ok(results.into_iter().map(Asset::from).collect())
    }

    pub fn list_by_symbols_impl(&self, symbols: &Vec<String>) -> Result<Vec<Asset>> {
        let mut conn = get_connection(&self.pool)?;

        let results = assets::table
            .filter(assets::id.eq_any(symbols))
            .load::<AssetDB>(&mut conn)?;

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
                    .get_result::<AssetDB>(conn)?;
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
                let result_db = diesel::update(assets::table.filter(assets::id.eq(asset_id_owned)))
                    .set((
                        assets::name.eq(&payload_owned.name),
                        assets::sectors.eq(&payload_owned.sectors),
                        assets::countries.eq(&payload_owned.countries),
                        assets::notes.eq(&payload_owned.notes),
                        assets::asset_sub_class.eq(&payload_owned.asset_sub_class),
                        assets::asset_class.eq(&payload_owned.asset_class),
                    ))
                    .get_result::<AssetDB>(conn)?;
                Ok(result_db.into())
            })
            .await
    }

    /// Updates the data source of an asset
    async fn update_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        debug!("Updating data source for asset {} to {}", asset_id, data_source);
        let asset_id_owned = asset_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Asset> {
                let result_db = diesel::update(assets::table.filter(assets::id.eq(asset_id_owned)))
                    .set(assets::data_source.eq(data_source))
                    .get_result::<AssetDB>(conn)?;
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
    fn list_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>> {
        self.list_by_symbols_impl(symbols)
    }
} 