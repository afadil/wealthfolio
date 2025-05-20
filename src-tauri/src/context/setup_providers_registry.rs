// src/provider/setup_registry.rs
use std::{path::PathBuf, sync::Arc};

use tauri::{AppHandle, Runtime};
use tauri_plugin_stronghold::{Client, Store, Stronghold};

use crate::provider::{
    MarketDataProvider, ProviderRegistry, YahooProvider, MarketDataAppProvider
};

/// Build the ProviderRegistry, pulling API keys from the Stronghold vault.
///
/// Called from `main` as:
/// ```rust
/// let registry = tauri::async_runtime::block_on(setup_registry(&handle))?;
/// handle.manage(registry);
/// ```
pub async fn build_provider_registry<R: Runtime>(
    handle: &AppHandle<R>,
    instance_id: &str,
) -> anyhow::Result<ProviderRegistry> {
    // ---------- open / create vault ----------
    let vault_path: PathBuf = handle
        .path()
        .app_data_dir()?
        .join("vault.hold");

    let stronghold = if vault_path.exists() {
        Stronghold::load(&vault_path, instance_id).await?
    } else {
        Stronghold::create(&vault_path, instance_id).await?
    };

    // ---------- client + store ----------
    let client_name = "wealthfolio";
    let client: Client = stronghold
        .load_client(client_name)
        .await
        .unwrap_or_else(|_| futures::executor::block_on(stronghold.create_client(client_name)).unwrap());
    let store: Store = client.get_store();

    // helper to read UTF‑8 secrets
    async fn secret(store: &Store, key: &str) -> Option<String> {
        store
            .get(key)
            .await
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
    }

    // ---------- providers ----------
    let mut providers: Vec<Arc<dyn MarketDataProvider>> =
        vec![Arc::new(YahooProvider::default())];

    if let Some(market_data_app_key) = secret(&store, "MARKET_DATA_APP_KEY").await {
        providers.push(Arc::new(MarketDataAppProvider::new(market_data_app_key)));
    }

    Ok(ProviderRegistry::new(providers))
}