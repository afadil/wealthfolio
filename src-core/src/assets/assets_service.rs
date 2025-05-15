use log::{debug, error, info};
use std::sync::Arc;

use crate::market_data::market_data_traits::MarketDataServiceTrait;

use crate::errors::{Error, Result, DatabaseError};
use diesel::result::Error as DieselError;
use super::assets_model::{Asset, AssetData, NewAsset, UpdateAssetProfile};
use super::assets_traits::{AssetRepositoryTrait, AssetServiceTrait};


/// Service for managing assets
pub struct AssetService {
    market_data_service: Arc<dyn MarketDataServiceTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
}

impl AssetService {
    /// Creates a new AssetService instance
    pub fn new(
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        market_data_service: Arc<dyn MarketDataServiceTrait>,
    ) -> Result<Self> {
        Ok(Self {
            market_data_service,
            asset_repository,
        })
    }
}

// Implement the service trait
#[async_trait::async_trait]
impl AssetServiceTrait for AssetService {
    /// Lists all assets
    fn get_assets(&self) -> Result<Vec<Asset>> {
        self.asset_repository.list()
    }

    /// Retrieves an asset by its ID
    fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset> {
        self.asset_repository.get_by_id(asset_id)
    }

    /// Retrieves an asset profile with quote history
    async fn get_asset_data(&self, asset_id: &str) -> Result<AssetData> {
        debug!("Fetching asset data for asset_id: {}", asset_id);

        let asset = self.asset_repository.get_by_id(asset_id)?;
        
        let quote_history = self
            .market_data_service
            .get_historical_quotes_for_symbol(&asset.symbol)?;

        Ok(AssetData {
            asset,
            quote_history,
        })
    }

    /// Updates an asset profile
    fn update_asset_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset> {
        self.asset_repository.update_profile(asset_id, payload)
    }

    /// Lists currency assets for a given base currency
    fn load_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>> {
        self.asset_repository.list_cash_assets(base_currency)
    }

    /// Creates a new cash asset
    fn create_cash_asset(&self, currency: &str) -> Result<Asset> {
        let new_asset = NewAsset::new_cash_asset(currency);
        self.asset_repository.create(new_asset)
    }

    /// Retrieves or creates an asset by its ID
    async fn get_or_create_asset(&self, asset_id: &str, context_currency: Option<String>) -> Result<Asset> {
        match self.asset_repository.get_by_id(asset_id) {
            Ok(existing_asset) => Ok(existing_asset),
            Err(Error::Database(DatabaseError::QueryFailed(DieselError::NotFound))) => {
                debug!(
                    "Asset not found locally, attempting to fetch from market data: {}",
                    asset_id
                );
                let asset_profile_from_provider = self
                    .market_data_service
                    .get_asset_profile(asset_id)
                    .await?;

                let mut new_asset: NewAsset = asset_profile_from_provider.into();

                // If the asset profile didn't provide a currency (e.g., generic manual asset)
                // and a context currency is available, use the context currency.
                if new_asset.currency.is_empty() {
                    if let Some(curr) = context_currency {
                        if !curr.is_empty() {
                            new_asset.currency = curr;
                        }
                    }
                }

                info!("New asset to be created: {:?}", new_asset);

                // The NewAsset::validate() method (likely called within create)
                // will ensure currency is not empty before insertion.
                let inserted_asset = self.asset_repository.create(new_asset)?;
                Ok(inserted_asset)
            }
            Err(e) => {
                error!("Error fetching asset by ID '{}': {}", asset_id, e);
                Err(e)
            }
        }
    }

    /// Updates the data source for an asset
    fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        self.asset_repository.update_data_source(asset_id, data_source)
    }

    fn get_assets_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>> {
        self.asset_repository.list_by_symbols(symbols)
    }
} 