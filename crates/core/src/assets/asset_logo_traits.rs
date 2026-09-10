//! Custom asset logo repository and service traits.

use async_trait::async_trait;

use super::asset_logo_model::{AssetLogo, AssetLogoSummary, UpsertAssetLogo};
use crate::errors::Result;

#[async_trait]
pub trait AssetLogoRepositoryTrait: Send + Sync {
    /// Returns the logo row for an asset, `Ok(None)` when there is none.
    fn get(&self, asset_id: &str) -> Result<Option<AssetLogo>>;

    /// Lists every override (no bytes), joined with the asset's codes.
    fn list_summaries(&self) -> Result<Vec<AssetLogoSummary>>;

    /// Inserts or replaces the logo for `logo.asset_id`.
    async fn upsert(&self, logo: AssetLogo) -> Result<AssetLogo>;

    /// Deletes the logo; returns `true` when a row was removed.
    async fn delete(&self, asset_id: &str) -> Result<bool>;
}

#[async_trait]
pub trait AssetLogoServiceTrait: Send + Sync {
    fn get_asset_logo(&self, asset_id: &str) -> Result<Option<AssetLogo>>;

    fn list_asset_logos(&self) -> Result<Vec<AssetLogoSummary>>;

    async fn upsert_asset_logo(
        &self,
        asset_id: &str,
        payload: UpsertAssetLogo,
    ) -> Result<AssetLogo>;

    async fn delete_asset_logo(&self, asset_id: &str) -> Result<()>;
}
