use super::assets_model::{Asset, AssetData, NewAsset, UpdateAssetProfile};
use crate::errors::Result;

/// Trait defining the contract for Asset service operations.
#[async_trait::async_trait]
pub trait AssetServiceTrait: Send + Sync {
    fn get_assets(&self) -> Result<Vec<Asset>>;
    fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset>;
    async fn get_asset_data(&self, asset_id: &str) -> Result<AssetData>;
    fn update_asset_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset>;
    fn load_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>>;
    fn create_cash_asset(&self, currency: &str) -> Result<Asset>;
    async fn get_or_create_asset(&self, asset_id: &str) -> Result<Asset>;
    fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset>;
    async fn sync_asset_quotes(&self, asset_list: &Vec<Asset>, refetch_all: bool) -> Result<()>;
    async fn sync_asset_quotes_by_symbols(&self, symbols: &Vec<String>, refetch_all: bool) -> Result<()>;
    fn get_assets_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>>;
}

/// Trait defining the contract for Asset repository operations.
pub trait AssetRepositoryTrait: Send + Sync {
    fn create(&self, new_asset: NewAsset) -> Result<Asset>;
    fn update_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset>;
    fn update_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset>;
    fn get_by_id(&self, asset_id: &str) -> Result<Asset>;
    fn list(&self) -> Result<Vec<Asset>>;
    fn list_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>>;
    fn list_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>>;
} 