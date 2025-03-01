use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use log::{debug, error};
use std::sync::Arc;

use crate::market_data::market_data_service::MarketDataService;
use crate::market_data::market_data_model::{QuoteRequest, DataSource};

use super::assets_errors::{AssetError, Result};
use super::assets_model::{Asset, AssetProfile, NewAsset, Quote, UpdateAssetProfile};
use super::assets_repository::AssetRepository;

/// Service for managing assets
pub struct AssetService {
    market_data_service: Arc<MarketDataService>,
    repository: AssetRepository,
}

impl AssetService {
    /// Creates a new AssetService instance
    pub async fn new(pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>) -> Result<Self> {
        let repository = AssetRepository::new(pool.clone());
        Ok(Self {
            market_data_service: Arc::new(MarketDataService::new(pool.clone()).await.map_err(|e| AssetError::MarketDataError(e.to_string()))?),
            repository,
        })
    }

    /// Lists all assets
    pub fn get_assets(&self) -> Result<Vec<Asset>> {
        self.repository.list()
    }

    /// Retrieves an asset by its ID
    pub fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset> {
        self.repository.get_by_id(asset_id)
    }

    /// Retrieves an asset profile with quote history
    pub fn get_asset_data(&self, asset_id: &str) -> Result<AssetProfile> {
        debug!("Fetching asset data for asset_id: {}", asset_id);

        let asset = self.repository.get_by_id(asset_id)?;
        let quote_history = self.repository.get_quote_history(&asset.symbol)?;

        Ok(AssetProfile {
            asset,
            quote_history,
        })
    }

    /// Updates an asset profile
    pub fn update_asset_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset> {
        self.repository.update_profile(asset_id, payload)
    }

    /// Lists currency assets for a given base currency
    pub fn load_currency_assets(&self, base_currency: &str) -> Result<Vec<Asset>> {
        self.repository.list_currency_assets(base_currency)
    }

    /// Creates a new cash asset
    pub fn create_cash_asset(&self, currency: &str) -> Result<Asset> {
        let new_asset = NewAsset::new_cash_asset(currency);
        self.repository.create(new_asset)
    }

    /// Retrieves or creates an asset by its ID
    pub async fn get_or_create_asset(&self, asset_id: &str) -> Result<Asset> {
        match self.repository.get_by_id(asset_id) {
            Ok(existing_asset) => Ok(existing_asset),
            Err(AssetError::NotFound(_)) => {
                // Check if this is a cash asset (starts with $CASH-)
                if asset_id.starts_with("$CASH-") {
                    let currency = &asset_id[6..]; // Skip the "$CASH-" prefix
                    if currency.is_empty() {
                        error!("Invalid cash asset ID: {}, missing currency", asset_id);
                        return Err(AssetError::InvalidData("Missing currency for cash asset".to_string()));
                    }
                    return self.create_cash_asset(currency);
                }

                // Not a cash asset, try fetching info from market data service
                match self.market_data_service.get_asset_info(asset_id).await {
                    Ok(new_asset) => {
                        let inserted_asset = self.insert_new_asset(new_asset).await?;

                        // Sync the quotes for the new asset but don't fail if sync fails
                        if let Err(e) = self.sync_asset_quotes(&vec![inserted_asset.clone()]).await {
                            error!(
                                "Failed to sync quotes for new asset {}: {}",
                                inserted_asset.id, e
                            );
                        }
                        Ok(inserted_asset)
                    }
                    Err(e) => {
                        error!("No data found for asset_id: {}", asset_id);
                        Err(AssetError::MarketDataError(e.to_string()))
                    }
                }
            }
            Err(e) => Err(e),
        }
    }

    /// Inserts a new asset into the database
    async fn insert_new_asset(&self, new_asset: NewAsset) -> Result<Asset> {
        self.repository.create(new_asset)
    }

    /// Updates the data source for an asset
    pub fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        self.repository.update_data_source(asset_id, data_source)
    }

    /// Retrieves the latest quotes for multiple symbols
    pub fn get_latest_quotes(&self, symbols: &[String]) -> Result<Vec<Quote>> {
        self.repository.get_latest_quotes(symbols)
    }

    /// Synchronizes quotes for a list of assets
    pub async fn sync_asset_quotes(&self, asset_list: &Vec<Asset>) -> Result<()> {
        let quote_requests: Vec<_> = asset_list.iter()
            .map(|asset| QuoteRequest::new(asset.symbol.clone(), DataSource::from(asset.data_source.as_str())))
            .collect();
        match self.market_data_service.sync_quotes(&quote_requests).await {
            Ok(_) => Ok(()),
            Err(e) => Err(AssetError::MarketDataError(e.to_string()))
        }
    }

} 