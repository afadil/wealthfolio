use super::assets_model::{Asset, AssetMetadata, NewAsset, UpdateAssetProfile};
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
    /// Creates a new asset directly without network lookups.
    /// Used for alternative assets and other manually created assets.
    async fn create_asset(&self, new_asset: NewAsset) -> Result<Asset>;
    async fn get_or_create_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
    ) -> Result<Asset>;
    /// Creates a minimal asset without network calls.
    /// Returns the existing asset if found, or creates a new minimal one.
    /// Accepts optional metadata hints from the caller (e.g., user-provided asset details).
    /// Should be followed by an enrichment event for full profile data.
    async fn get_or_create_minimal_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
        metadata: Option<AssetMetadata>,
    ) -> Result<Asset>;
    async fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset>;
    async fn get_assets_by_symbols(&self, symbols: &[String]) -> Result<Vec<Asset>>;
    /// Enriches an existing asset's profile with data from market data provider.
    /// Updates the profile JSON (sectors, countries, website) and notes fields.
    async fn enrich_asset_profile(&self, asset_id: &str) -> Result<Asset>;
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
    fn list_by_symbols(&self, symbols: &[String]) -> Result<Vec<Asset>>;
    async fn delete(&self, asset_id: &str) -> Result<()>;

    /// Search for assets by symbol (case-insensitive partial match).
    /// Used for merging existing assets into search results.
    fn search_by_symbol(&self, query: &str) -> Result<Vec<Asset>>;
}
