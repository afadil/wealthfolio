use log::{debug, error};
use std::sync::Arc;

use crate::market_data::market_data_traits::{MarketDataServiceTrait, MarketDataRepositoryTrait};

use super::assets_model::{Asset, NewAsset, UpdateAssetProfile};
use super::assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
use crate::errors::{DatabaseError, Error, Result};
use diesel::result::Error as DieselError;

/// Service for managing assets
pub struct AssetService {
    market_data_service: Arc<dyn MarketDataServiceTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
    market_data_repository: Arc<dyn MarketDataRepositoryTrait>,
}

impl AssetService {
    /// Creates a new AssetService instance
    pub fn new(
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        market_data_service: Arc<dyn MarketDataServiceTrait>,
        market_data_repository: Arc<dyn MarketDataRepositoryTrait>,
    ) -> Result<Self> {
        Ok(Self {
            market_data_service,
            asset_repository,
            market_data_repository,
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

    async fn delete_asset(&self, asset_id: &str) -> Result<()> {
        self.asset_repository.delete(asset_id).await
    }

    /// Updates an asset profile
    async fn update_asset_profile(
        &self,
        asset_id: &str,
        payload: UpdateAssetProfile,
    ) -> Result<Asset> {
        self.asset_repository
            .update_profile(asset_id, payload)
            .await
    }

    /// Lists currency assets for a given base currency
    fn load_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>> {
        self.asset_repository.list_cash_assets(base_currency)
    }

    /// Creates a new cash asset
    async fn create_cash_asset(&self, currency: &str) -> Result<Asset> {
        let new_asset = NewAsset::new_cash_asset(currency);
        self.asset_repository.create(new_asset).await
    }

    /// Creates a manual asset without searching providers
    async fn create_manual_asset(&self, symbol: &str, currency: String) -> Result<Asset> {
        // Check if asset already exists
        match self.asset_repository.get_by_id(symbol) {
            Ok(existing_asset) => Ok(existing_asset),
            Err(Error::Database(DatabaseError::QueryFailed(DieselError::NotFound))) => {
                debug!("Creating manual asset: {}", symbol);
                // Create a simple manual asset profile
                let new_asset = NewAsset {
                    id: Some(symbol.to_string()),
                    isin: None,
                    name: Some(symbol.to_string()),
                    asset_type: Some("EQUITY".to_string()),
                    symbol: symbol.to_string(),
                    symbol_mapping: None,
                    asset_class: Some("Equity".to_string()),
                    asset_sub_class: Some("Stock".to_string()),
                    notes: None,
                    countries: None,
                    categories: None,
                    classes: None,
                    attributes: None,
                    currency,
                    data_source: "MANUAL".to_string(),
                    sectors: None,
                    url: None,
                };
                self.asset_repository.create(new_asset).await
            }
            Err(e) => {
                error!("Error checking for existing manual asset '{}': {}", symbol, e);
                Err(e)
            }
        }
    }

    /// Retrieves or creates an asset by its ID
    async fn get_or_create_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
    ) -> Result<Asset> {
        match self.asset_repository.get_by_id(asset_id) {
            Ok(existing_asset) => Ok(existing_asset),
            Err(Error::Database(DatabaseError::QueryFailed(DieselError::NotFound))) => {
                debug!(
                    "Asset not found locally, attempting to fetch from market data: {}",
                    asset_id
                );
                let asset_profile_from_provider =
                    self.market_data_service.get_asset_profile(asset_id).await?;

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

                // will ensure currency is not empty before insertion.
                return self.asset_repository.create(new_asset).await;
            }
            Err(e) => {
                error!("Error fetching asset by ID '{}': {}", asset_id, e);
                Err(e)
            }
        }
    }

    /// Updates the data source for an asset and removes quotes from other sources
    async fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        // Update the asset's data source
        let updated_asset = self
            .asset_repository
            .update_data_source(asset_id, data_source.clone())
            .await?;

        // If switching to a specific provider (not MANUAL), delete quotes from other providers
        if data_source != "MANUAL" {
            if let Err(e) = self
                .market_data_repository
                .delete_quotes_by_symbol_except_source(asset_id, &data_source)
                .await
            {
                error!(
                    "Failed to clean up old quotes for asset {} when switching to {}: {}",
                    asset_id, data_source, e
                );
                // Don't fail the whole operation if quote cleanup fails
            }
        }

        Ok(updated_asset)
    }

    async fn get_assets_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>> {
        self.asset_repository.list_by_symbols(symbols)
    }
}
