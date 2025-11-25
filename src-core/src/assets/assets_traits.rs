use super::assets_model::{Asset, NewAsset, UpdateAssetProfile};
use crate::errors::Result;

/// Trait defining the contract for Asset service operations.
#[async_trait::async_trait]
pub trait AssetServiceTrait: Send + Sync {
    fn get_assets(&self) -> Result<Vec<Asset>>;
    fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset>;
    async fn delete_asset(&self, asset_id: &str) -> Result<()>;
    async fn update_asset_profile(
        &self,
        asset_id: &str,
        payload: UpdateAssetProfile,
    ) -> Result<Asset>;
    fn load_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>>;
    async fn create_cash_asset(&self, currency: &str) -> Result<Asset>;
    async fn get_or_create_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
    ) -> Result<Asset>;
    async fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset>;
    async fn get_assets_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>>;
}

/// Trait defining the contract for Asset repository operations.
#[async_trait::async_trait]
pub trait AssetRepositoryTrait: Send + Sync {
    async fn create(&self, new_asset: NewAsset) -> Result<Asset>;
    async fn update_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset>;
    async fn update_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset>;
    fn get_by_id(&self, asset_id: &str) -> Result<Asset>;
    fn list(&self) -> Result<Vec<Asset>>;
    fn list_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>>;
    fn list_by_symbols(&self, symbols: &Vec<String>) -> Result<Vec<Asset>>;
    async fn delete(&self, asset_id: &str) -> Result<()>;
}
