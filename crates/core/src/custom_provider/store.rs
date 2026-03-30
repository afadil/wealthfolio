use async_trait::async_trait;

use crate::errors::Result;

use super::model::{CustomProviderSource, CustomProviderWithSources, NewCustomProviderSource};
use crate::quotes::provider_settings::MarketDataProviderSetting;

/// Repository trait for custom provider persistence.
#[async_trait]
pub trait CustomProviderRepository: Send + Sync {
    /// Get all custom providers with their sources.
    fn get_all(&self) -> Result<Vec<CustomProviderWithSources>>;

    /// Get the source for a provider by kind ("latest" or "historical").
    fn get_source_by_kind(
        &self,
        provider_id: &str,
        kind: &str,
    ) -> Result<Option<CustomProviderSource>>;

    /// Create a new custom provider with sources.
    async fn create(
        &self,
        provider: &MarketDataProviderSetting,
        sources: &[NewCustomProviderSource],
    ) -> Result<()>;

    /// Update a custom provider's metadata (name, description, priority, enabled).
    async fn update_provider(&self, provider: &MarketDataProviderSetting) -> Result<()>;

    /// Replace a provider's source configurations.
    async fn update_sources(
        &self,
        provider_id: &str,
        sources: &[NewCustomProviderSource],
    ) -> Result<()>;

    /// Delete a custom provider.
    async fn delete(&self, provider_id: &str) -> Result<()>;

    /// Count assets that reference a given custom provider code.
    fn get_asset_count_for_provider(&self, provider_code: &str) -> Result<i64>;
}
