use async_trait::async_trait;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_stronghold::Stronghold;
use wealthfolio_core::{
    errors::Result as CoreResult, // Alias to avoid conflict
    market_data::{
        market_data_errors::MarketDataError,
        providers::api_key_resolver::ApiKeyResolver,
    },
};
use log::{warn, error, debug};

/// A resolver that attempts to fetch API keys from a Stronghold instance.
pub struct StrongholdApiKeyResolver<R: Runtime> {
    app_handle: AppHandle<R>,
    client_name: String,
}

impl<R: Runtime> StrongholdApiKeyResolver<R> {
    pub fn new(app_handle: AppHandle<R>, client_name: &str) -> Self {
        debug!("Creating StrongholdApiKeyResolver for client: {}", client_name);
        Self {
            app_handle,
            client_name: client_name.to_string(),
        }
    }
}

#[async_trait]
impl<R: Runtime> ApiKeyResolver for StrongholdApiKeyResolver<R> {
    async fn resolve_api_key(&self, vault_path: &str) -> CoreResult<Option<String>> {
        debug!("Attempting to resolve API key from Stronghold. Path: '{}', Client: '{}'", vault_path, self.client_name);

        let stronghold = self.app_handle.state::<Stronghold>();
        
        let client = match stronghold.load_client(&self.client_name).await {
            Ok(c) => {
                debug!("Successfully loaded Stronghold client: {}", self.client_name);
                c
            }
            Err(e_load) => {
                warn!("Failed to load stronghold client '{}': {}. Attempting to create.", self.client_name, e_load);
                match stronghold.create_client(&self.client_name).await {
                    Ok(c_new) => {
                        debug!("Successfully created Stronghold client: {}", self.client_name);
                        c_new
                    }
                    Err(e_create) => {
                        error!("Failed to create stronghold client '{}' after load failed: {}", self.client_name, e_create);
                        return Err(MarketDataError::StrongholdError(format!(
                            "Failed to load or create stronghold client '{}': load_err={}, create_err={}",
                            self.client_name, e_load, e_create
                        )).into());
                    }
                }
            }
        };
        
        let store = client.store();

        match store.get(vault_path).await {
            Ok(Some(key_bytes)) => {
                if key_bytes.is_empty() {
                    warn!("API key for vault path '{}' is empty in Stronghold.", vault_path);
                    Ok(None) // Treat empty key as no key
                } else {
                    match String::from_utf8(key_bytes) {
                        Ok(key_str) => {
                            debug!("Successfully resolved API key for vault path: '{}'", vault_path);
                            Ok(Some(key_str))
                        }
                        Err(e) => {
                            error!("Failed to convert API key from UTF-8 for vault path '{}': {}", vault_path, e);
                            Err(MarketDataError::StrongholdError(format!(
                                "Invalid UTF-8 sequence for API key at path '{}'", vault_path
                            )).into())
                        }
                    }
                }
            }
            Ok(None) => {
                warn!("No API key found in Stronghold for vault path '{}'.", vault_path);
                Ok(None)
            }
            Err(e) => {
                // This could be tauri_plugin_stronghold::Error, convert to string
                let err_msg = format!("{}", e);
                error!("Failed to get API key from Stronghold for vault path '{}': {}", vault_path, err_msg);
                Err(MarketDataError::StrongholdError(format!(
                    "Failed to retrieve API key for path '{}': {}", vault_path, err_msg
                )).into())
            }
        }
    }
}
