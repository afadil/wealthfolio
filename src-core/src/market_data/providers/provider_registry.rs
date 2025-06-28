use crate::market_data::market_data_constants::{
    DATA_SOURCE_MANUAL, DATA_SOURCE_MARKET_DATA_APP, DATA_SOURCE_YAHOO,
};
use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::market_data_model::{
    MarketDataProviderSetting, Quote as ModelQuote, QuoteSummary,
};
use crate::market_data::providers::manual_provider::ManualProvider;
use crate::market_data::providers::market_data_provider::{AssetProfiler, MarketDataProvider};
use crate::market_data::providers::market_data_app_provider::MarketDataAppProvider;
use crate::market_data::providers::yahoo_provider::YahooProvider;
use crate::secrets::SecretManager;
use log::{info, warn};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;

pub struct ProviderRegistry {
    data_providers: HashMap<String, Arc<dyn MarketDataProvider + Send + Sync>>,
    ordered_data_provider_ids: Vec<String>,
    asset_profilers: HashMap<String, Arc<dyn AssetProfiler + Send + Sync>>,
    ordered_profiler_ids: Vec<String>,
}

impl ProviderRegistry {
    pub async fn new(
        provider_settings: Vec<MarketDataProviderSetting>,
    ) -> Result<Self, MarketDataError> {
        let mut active_providers_with_priority: Vec<(
            i32,
            String,
            Arc<dyn MarketDataProvider + Send + Sync>,
            Option<Arc<dyn AssetProfiler + Send + Sync>>,
        )> = Vec::new();

        for setting in provider_settings {
            if !setting.enabled {
                info!(
                    "Provider '{}' (ID: {}) is disabled, skipping.",
                    setting.name, setting.id
                );
                continue;
            }

            let provider_id_str = &setting.id;

            let api_key = if provider_id_str == DATA_SOURCE_MARKET_DATA_APP {
                match SecretManager::get_api_key(provider_id_str) {
                    Ok(key_opt) => key_opt,
                    Err(e) => {
                        warn!(
                            "Failed to resolve API key for provider '{}' (ID: {}). Error: {}. Skipping.",
                            setting.name, setting.id, e
                        );
                        continue;
                    }
                }
            } else {
                None
            };

            let (provider, profiler) = match provider_id_str.as_str() {
                DATA_SOURCE_YAHOO => {
                    let p = Arc::new(YahooProvider::new().await?);
                    (
                        Some(p.clone() as Arc<dyn MarketDataProvider + Send + Sync>),
                        Some(p as Arc<dyn AssetProfiler + Send + Sync>),
                    )
                }
                DATA_SOURCE_MARKET_DATA_APP => {
                    if let Some(key) = api_key {
                        if !key.is_empty() {
                            let p = Arc::new(MarketDataAppProvider::new(key).await?);
                            (
                                Some(p.clone() as Arc<dyn MarketDataProvider + Send + Sync>),
                                None,
                            )
                        } else {
                            warn!("MarketData.app provider '{}' (ID: {}) is enabled but API key is empty. Skipping.", setting.name, setting.id);
                            (None, None)
                        }
                    } else {
                        warn!("MarketData.app provider '{}' (ID: {}) is enabled but requires an API key, which was not found or resolved. Skipping.", setting.name, setting.id);
                        (None, None)
                    }
                }
                _ => {
                    warn!(
                        "Unknown market data provider ID: {}. Skipping.",
                        setting.id
                    );
                    (None, None)
                }
            };

            if let Some(p_arc) = provider {
                active_providers_with_priority.push((
                    setting.priority,
                    setting.id.clone(),
                    p_arc,
                    profiler,
                ));
                info!(
                    "Successfully configured and activated provider: {} (ID: {}) with priority {}",
                    setting.name, setting.id, setting.priority
                );
            }
        }

        active_providers_with_priority.sort_by_key(|k| k.0);

        let mut data_providers_map = HashMap::new();
        let mut ordered_data_provider_ids_vec = Vec::new();
        let mut asset_profilers_map = HashMap::new();
        let mut ordered_profiler_ids_vec = Vec::new();

        for (_priority, id, provider, profiler_opt) in active_providers_with_priority {
            data_providers_map.insert(id.clone(), provider);
            ordered_data_provider_ids_vec.push(id.clone());
            if let Some(profiler) = profiler_opt {
                asset_profilers_map.insert(id.clone(), profiler);
                if !ordered_profiler_ids_vec.contains(&id) {
                    ordered_profiler_ids_vec.push(id);
                }
            }
        }

        if !asset_profilers_map.contains_key(DATA_SOURCE_MANUAL) {
            let manual_profiler =
                Arc::new(ManualProvider::new()?) as Arc<dyn AssetProfiler + Send + Sync>;
            asset_profilers_map.insert(DATA_SOURCE_MANUAL.to_string(), manual_profiler);
            if !ordered_profiler_ids_vec.contains(&DATA_SOURCE_MANUAL.to_string()) {
                ordered_profiler_ids_vec.push(DATA_SOURCE_MANUAL.to_string());
            }
            info!("Ensured ManualProvider is available for asset profiling.");
        }

        if data_providers_map.is_empty() {
            warn!("No market data providers were successfully configured and enabled. Market data functionality will be limited.");
        }

        Ok(Self {
            data_providers: data_providers_map,
            ordered_data_provider_ids: ordered_data_provider_ids_vec,
            asset_profilers: asset_profilers_map,
            ordered_profiler_ids: ordered_profiler_ids_vec,
        })
    }

    pub fn get_provider(&self, id: &str) -> Option<&Arc<dyn MarketDataProvider + Send + Sync>> {
        self.data_providers.get(id)
    }

    pub fn default_provider(&self) -> Option<&Arc<dyn MarketDataProvider + Send + Sync>> {
        self.ordered_data_provider_ids
            .first()
            .and_then(|id| self.data_providers.get(id))
    }

    pub fn get_profiler(&self, id: &str) -> Option<&Arc<dyn AssetProfiler + Send + Sync>> {
        self.asset_profilers.get(id)
    }

    pub fn default_profiler(&self) -> Option<&Arc<dyn AssetProfiler + Send + Sync>> {
        self.ordered_profiler_ids
            .first()
            .and_then(|id| self.asset_profilers.get(id))
    }

    pub async fn latest_quote(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<ModelQuote, MarketDataError> {
        for provider_id in &self.ordered_data_provider_ids {
            if let Some(p) = self.data_providers.get(provider_id) {
                match p.get_latest_quote(symbol, fallback_currency.clone()).await {
                    Ok(q) => return Ok(q),
                    Err(e) => warn!(
                        "Provider '{}' failed to get latest quote for symbol '{}': {:?}. Trying next.",
                        provider_id, symbol, e
                    ),
                }
            }
        }
        Err(MarketDataError::NotFound(symbol.to_string()))
    }

    pub async fn historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        for provider_id in &self.ordered_data_provider_ids {
            if let Some(p) = self.data_providers.get(provider_id) {
                match p
                    .get_historical_quotes(symbol, start, end, fallback_currency.clone())
                    .await
                {
                    Ok(q_vec) if !q_vec.is_empty() => return Ok(q_vec),
                    Ok(_) => info!(
                        "Provider '{}' returned no historical quotes for symbol '{}'. Trying next.",
                        provider_id, symbol
                    ),
                    Err(e) => warn!(
                        "Provider '{}' failed to get historical quotes for symbol '{}': {:?}. Trying next.",
                        provider_id, symbol, e
                    ),
                }
            }
        }
        Err(MarketDataError::NotFound(symbol.to_string()))
    }

    pub async fn historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        if self.ordered_data_provider_ids.is_empty() {
            warn!("No data providers available for historical_quotes_bulk.");
            return Err(MarketDataError::ProviderExhausted(
                "No providers available".to_string(),
            ));
        }
        if let Some(default_provider_id) = self.ordered_data_provider_ids.first() {
            if let Some(p) = self.data_providers.get(default_provider_id) {
                return p
                    .get_historical_quotes_bulk(symbols_with_currencies, start, end)
                    .await;
            }
        }
        Err(MarketDataError::ProviderExhausted(
            "No providers available".to_string(),
        ))
    }

    pub async fn get_asset_profile(
        &self,
        symbol: &str,
    ) -> Result<super::models::AssetProfile, MarketDataError> {
        for profiler_id in &self.ordered_profiler_ids {
            if let Some(profiler) = self.asset_profilers.get(profiler_id) {
                match profiler.get_asset_profile(symbol).await {
                    Ok(profile) => return Ok(profile),
                    Err(e) => warn!(
                        "Profiler '{}' failed to get asset profile for symbol '{}': {:?}. Trying next.",
                        profiler_id, symbol, e
                    ),
                }
            }
        }
        if symbol.starts_with("$CASH") {
            if let Some(manual_profiler) = self.asset_profilers.get(DATA_SOURCE_MANUAL) {
                return manual_profiler.get_asset_profile(symbol).await;
            }
        }
        Err(MarketDataError::NotFound(symbol.to_string()))
    }

    pub async fn search_ticker(
        &self,
        query: &str,
    ) -> Result<Vec<QuoteSummary>, MarketDataError> {
        if let Some(default_provider_id) = self.ordered_data_provider_ids.first() {
            if let Some(profiler) = self.asset_profilers.get(default_provider_id) {
                return profiler.search_ticker(query).await;
            }
        }
        Err(MarketDataError::ProviderError(
            "Search ticker is not supported by any active provider".to_string(),
        ))
    }
}