use async_trait::async_trait;
use wealthfolio_core::{
    errors::Result as CoreResult,
    market_data::{
        market_data_errors::MarketDataError,
        providers::api_key_resolver::ApiKeyResolver,
    },
};
use log::{error, debug, warn};

const SERVICE_NAME: &str = "wealthfolio-api-keys";

/// An ApiKeyResolver that uses the system's keyring for storing and retrieving API keys.
#[derive(Debug, Clone)]
pub struct KeyringApiKeyResolver;

impl KeyringApiKeyResolver {
    pub fn new() -> Self {
        debug!("Creating KeyringApiKeyResolver");
        Self
    }
}

#[async_trait]
impl ApiKeyResolver for KeyringApiKeyResolver {
    async fn resolve_api_key(&self, entry_name: &str) -> CoreResult<Option<String>> {
        debug!("Attempting to resolve API key from keyring. Entry name: '{}'", entry_name);
        if entry_name.is_empty() {
            warn!("resolve_api_key called with empty entry_name.");
            return Ok(None);
        }
        let entry = keyring::Entry::new(SERVICE_NAME, entry_name);
        match entry.get_password() {
            Ok(key) => {
                debug!("Successfully resolved API key for entry name: '{}'", entry_name);
                Ok(Some(key))
            }
            Err(keyring::Error::NoEntry) => {
                warn!("No API key found in keyring for entry name: '{}'", entry_name);
                Ok(None)
            }
            Err(e) => {
                error!("Failed to get API key from keyring for entry name '{}': {}", entry_name, e);
                Err(MarketDataError::ApiKeyStorageError(format!(
                    "Failed to retrieve API key for entry '{}': {}",
                    entry_name, e
                ))
                .into())
            }
        }
    }

    async fn set_api_key(&self, entry_name: &str, key: &str) -> CoreResult<()> {
        debug!("Attempting to set API key in keyring. Entry name: '{}'", entry_name);
        if entry_name.is_empty() {
            error!("set_api_key called with empty entry_name.");
            return Err(MarketDataError::ApiKeyStorageError("Entry name cannot be empty".to_string()).into());
        }
        if key.is_empty() {
            // If the key is empty, this is equivalent to deleting the key.
            // keyring::Entry::set_password with an empty string might behave differently across platforms
            // or might not be allowed. Explicitly call delete for clarity and safety.
            warn!("set_api_key called with an empty key for entry_name: '{}'. Deleting the key instead.", entry_name);
            return self.delete_api_key(entry_name).await;
        }
        let entry = keyring::Entry::new(SERVICE_NAME, entry_name);
        match entry.set_password(key) {
            Ok(_) => {
                debug!("Successfully set API key in keyring for entry name: '{}'", entry_name);
                Ok(())
            }
            Err(e) => {
                error!("Failed to set API key in keyring for entry name '{}': {}", entry_name, e);
                Err(MarketDataError::ApiKeyStorageError(format!(
                    "Failed to save API key for entry '{}': {}",
                    entry_name, e
                ))
                .into())
            }
        }
    }

    async fn delete_api_key(&self, entry_name: &str) -> CoreResult<()> {
        debug!("Attempting to delete API key from keyring. Entry name: '{}'", entry_name);
        if entry_name.is_empty() {
            warn!("delete_api_key called with empty entry_name.");
            // Consider if this should be an error or a silent ignore.
            // For now, align with resolve_api_key and treat as non-error, but log it.
            return Ok(());
        }
        let entry = keyring::Entry::new(SERVICE_NAME, entry_name);
        match entry.delete_password() {
            Ok(_) => {
                debug!("Successfully deleted API key from keyring for entry name: '{}'", entry_name);
                Ok(())
            }
            Err(keyring::Error::NoEntry) => {
                warn!("Attempted to delete API key from keyring, but key was not found for entry name '{}'. This is not an error.", entry_name);
                Ok(()) // Deleting a non-existent entry is not an error.
            }
            Err(e) => {
                error!("Failed to delete API key from keyring for entry name '{}': {}", entry_name, e);
                Err(MarketDataError::ApiKeyStorageError(format!(
                    "Failed to delete API key for entry '{}': {}",
                    entry_name, e
                ))
                .into())
            }
        }
    }
}

// Add this to ensure the new module is part of the crate
// Find the `mod.rs` or `lib.rs` for `src-tauri/src/context` and add `pub mod keyring_api_key_resolver;`
// For now, this subtask only creates the file. The module system update will be a separate step or handled during compilation checks.
