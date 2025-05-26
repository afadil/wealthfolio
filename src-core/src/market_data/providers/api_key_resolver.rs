use async_trait::async_trait;
use crate::errors::Result;
// MarketDataError might not be needed here if resolve_api_key returns a more generic error or just Result<Option<String>>
// use crate::market_data::market_data_errors::MarketDataError;

#[async_trait]
pub trait ApiKeyResolver: Send + Sync {
    /// Resolves an API key given a vault path.
    /// Returns Ok(Some(key)) if found, Ok(None) if not found or needs to be treated as not found (e.g. empty).
    /// Returns Err if there was an issue trying to resolve the key.
    async fn resolve_api_key(&self, vault_path: &str) -> Result<Option<String>>;

    /// Sets (saves or updates) an API key at the given vault path.
    async fn set_api_key(&self, vault_path: &str, key: &str) -> Result<()>;

    /// Deletes an API key from the given vault path.
    async fn delete_api_key(&self, vault_path: &str) -> Result<()>;
}

/// A resolver that does not actually resolve any keys.
/// Useful for tests or for providers that don't require API keys.
pub struct NoOpApiKeyResolver;

#[async_trait]
impl ApiKeyResolver for NoOpApiKeyResolver {
    async fn resolve_api_key(&self, _vault_path: &str) -> Result<Option<String>> {
        Ok(None)
    }

    async fn set_api_key(&self, _vault_path: &str, _key: &str) -> Result<()> {
        Ok(()) // No-op
    }

    async fn delete_api_key(&self, _vault_path: &str) -> Result<()> {
        Ok(()) // No-op
    }
}
