// src/provider/setup_registry.rs
use std::sync::Arc;
use tauri::{AppHandle, Runtime};
use crate::context::KeyringApiKeyResolver;
use wealthfolio_core::market_data::providers::api_key_resolver::ApiKeyResolver;
use wealthfolio_core::market_data::providers::ProviderRegistry;
// Import MarketDataProviderSetting if not already (it should be in scope via prelude or direct use)
use wealthfolio_core::market_data::market_data_model::MarketDataProviderSetting;
use log::{debug, warn, error};

/// Build the ProviderRegistry, providing configurations for default providers.
/// API keys for these providers (if needed and specified in settings) will be
/// resolved by the ApiKeyResolver passed to the ProviderRegistry.
pub async fn build_provider_registry<R: Runtime>(
    _handle: &AppHandle<R>, // Evaluate if handle is needed at all
) -> anyhow::Result<ProviderRegistry> {
    debug!("Building ProviderRegistry with KeyringApiKeyResolver for default providers.");
    let keyring_resolver = Arc::new(KeyringApiKeyResolver::new()); // ProviderRegistry expects Arc

    const MARKET_DATA_APP_DEFAULT_KEY_ENTRY_NAME: &str = "default_provider_marketdata_app_key";

    let mut default_provider_settings = Vec::new();

    // Setting for Yahoo (does not require an API key through this resolver path)
    default_provider_settings.push(MarketDataProviderSetting {
        id: "yahoo".to_string(), // Matches the ID used in DB seeding
        name: "Yahoo Finance".to_string(),
        api_key_vault_path: None, // Yahoo provider itself doesn't use API key via resolver
        priority: 1,
        enabled: true,
        logo_filename: Some("yahoo-finance.png".to_string()),
    });

    // Attempt to set up MarketDataAppProvider
    // The API key for MarketDataAppProvider, if set by user via UI, will be stored
    // using an entry name like "market_data_provider_api_key_marketdata_app".
    // The 'MARKET_DATA_APP_DEFAULT_KEY_ENTRY_NAME' is for a *potential* pre-seeded default key.
    // If we want ProviderRegistry to load this specific default key,
    // the api_key_vault_path for MarketDataAppProvider should be this constant.
    default_provider_settings.push(MarketDataProviderSetting {
        id: "marketdata_app".to_string(), // Matches the ID used in DB seeding
        name: "MarketData.app".to_string(),
        // This tells the ProviderRegistry to use the resolver for this entry
        // if it needs to initialize MarketDataAppProvider with a key.
        api_key_vault_path: Some(MARKET_DATA_APP_DEFAULT_KEY_ENTRY_NAME.to_string()),
        priority: 2,
        enabled: true, // Default to enabled, user can disable in settings
        logo_filename: Some("marketdata-app.png".to_string()),
    });

    // Log the attempt to pre-load the key for user awareness if they need to set it
    match keyring_resolver.resolve_api_key(MARKET_DATA_APP_DEFAULT_KEY_ENTRY_NAME).await {
        Ok(Some(key)) if !key.is_empty() => {
            debug!("A pre-configured API key for MarketData.app was found in keyring under '{}'. ProviderRegistry will use this if needed.", MARKET_DATA_APP_DEFAULT_KEY_ENTRY_NAME);
        }
        _ => {
            warn!("No pre-configured API key for MarketData.app was found in keyring under '{}'. If this provider is used, its API key might need to be configured in settings.", MARKET_DATA_APP_DEFAULT_KEY_ENTRY_NAME);
        }
    }

    // ProviderRegistry::new now takes the resolver and settings.
    // It will internally try to create providers based on these settings.
    // If a setting has an api_key_vault_path, the resolver will be used.
    match ProviderRegistry::new(keyring_resolver.clone(), default_provider_settings).await {
        Ok(registry) => {
            debug!("ProviderRegistry built successfully.");
            Ok(registry)
        }
        Err(e) => {
            error!("Failed to build ProviderRegistry: {}", e);
            Err(anyhow::anyhow!("Failed to build ProviderRegistry: {}", e))
        }
    }
}