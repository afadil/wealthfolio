use async_trait::async_trait;

use crate::errors::Result;

use super::model::{
    CustomProviderSource, CustomProviderWithSources, NewCustomProvider, UpdateCustomProvider,
};

/// Repository trait for custom provider persistence.
///
/// Read methods are synchronous because Diesel is synchronous and reads use a
/// shared connection pool (no serialisation needed). Write methods are async
/// because they go through a serialised write handle (`WriteHandle::exec_tx`).
#[async_trait]
pub trait CustomProviderRepository: Send + Sync {
    /// Get all custom providers with their sources.
    fn get_all(&self) -> Result<Vec<CustomProviderWithSources>>;

    /// Get the source for a provider by kind ("latest" or "historical").
    fn get_source_by_kind(
        &self,
        provider_code: &str,
        kind: &str,
    ) -> Result<Option<CustomProviderSource>>;

    /// Create a new custom provider with sources. Returns the created provider.
    async fn create(&self, payload: &NewCustomProvider) -> Result<CustomProviderWithSources>;

    /// Update a custom provider (metadata and/or sources). Returns the updated provider.
    async fn update(
        &self,
        provider_code: &str,
        payload: &UpdateCustomProvider,
    ) -> Result<CustomProviderWithSources>;

    /// Delete a custom provider.
    async fn delete(&self, provider_code: &str) -> Result<()>;

    /// Count assets that reference a given custom provider code.
    fn get_asset_count_for_provider(&self, provider_code: &str) -> Result<i64>;
}
