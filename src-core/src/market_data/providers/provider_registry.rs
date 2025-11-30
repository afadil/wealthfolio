use crate::market_data::market_data_constants::{
    DATA_SOURCE_ALPHA_VANTAGE, DATA_SOURCE_MANUAL, DATA_SOURCE_MARKET_DATA_APP,
    DATA_SOURCE_METAL_PRICE_API, DATA_SOURCE_VN_MARKET, DATA_SOURCE_YAHOO,
};
use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::market_data_model::{
    MarketDataProviderSetting, Quote as ModelQuote, QuoteSummary, QuoteRequest, DataSource,
};
use std::collections::{HashMap, HashSet};
use log::{debug, info, warn, error};
use crate::market_data::providers::alpha_vantage_provider::AlphaVantageProvider;
use crate::market_data::providers::manual_provider::ManualProvider;
use crate::market_data::providers::market_data_provider::{AssetProfiler, MarketDataProvider};
use crate::market_data::providers::marketdata_app_provider::MarketDataAppProvider;
use crate::market_data::providers::metal_price_api_provider::MetalPriceApiProvider;
use crate::market_data::providers::yahoo_provider::YahooProvider;
use crate::market_data::providers::vn_market_provider::VnMarketProvider;
use crate::secrets::SecretManager;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::sync::Arc;
use std::time::SystemTime;

type DbPool = Pool<ConnectionManager<SqliteConnection>>;

pub struct ProviderRegistry {
    data_providers: HashMap<String, Arc<dyn MarketDataProvider + Send + Sync>>,
    ordered_data_provider_ids: Vec<String>,
    asset_profilers: HashMap<String, Arc<dyn AssetProfiler + Send + Sync>>,
    ordered_profiler_ids: Vec<String>,
}

impl ProviderRegistry {
    /// Create a new provider registry without DB pool (VN gold cache disabled)
    pub async fn new(
        provider_settings: Vec<MarketDataProviderSetting>,
    ) -> Result<Self, MarketDataError> {
        Self::with_pool(provider_settings, None).await
    }

    /// Create a new provider registry with optional DB pool for VN gold cache
    pub async fn with_pool(
        provider_settings: Vec<MarketDataProviderSetting>,
        pool: Option<Arc<DbPool>>,
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

            let api_key = if provider_id_str != DATA_SOURCE_YAHOO {
                match SecretManager::get_secret(provider_id_str) {
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
                DATA_SOURCE_ALPHA_VANTAGE => {
                    if let Some(key) = api_key {
                        if !key.is_empty() {
                            let p = Arc::new(AlphaVantageProvider::new(key));
                            (
                                Some(p.clone() as Arc<dyn MarketDataProvider + Send + Sync>),
                                Some(p as Arc<dyn AssetProfiler + Send + Sync>),
                            )
                        } else {
                            warn!("AlphaVantage provider '{}' (ID: {}) is enabled but API key is empty. Skipping.", setting.name, setting.id);
                            (None, None)
                        }
                    } else {
                        warn!("AlphaVantage provider '{}' (ID: {}) is enabled but requires an API key, which was not found or resolved. Skipping.", setting.name, setting.id);
                        (None, None)
                    }
                }
                DATA_SOURCE_METAL_PRICE_API => {
                    if let Some(key) = api_key {
                        if !key.is_empty() {
                            let p = Arc::new(MetalPriceApiProvider::new(key));
                            (
                                Some(p.clone() as Arc<dyn MarketDataProvider + Send + Sync>),
                                Some(p as Arc<dyn AssetProfiler + Send + Sync>),
                            )
                        } else {
                            warn!("MetalPriceApi provider '{}' (ID: {}) is enabled but API key is empty. Skipping.", setting.name, setting.id);
                            (None, None)
                        }
                    } else {
                        warn!("MetalPriceApi provider '{}' (ID: {}) is enabled but requires an API key, which was not found or resolved. Skipping.", setting.name, setting.id);
                        (None, None)
                    }
                }
                DATA_SOURCE_VN_MARKET => {
                    // Use pool for VN gold cache if available
                    let p = if let Some(ref db_pool) = pool {
                        Arc::new(VnMarketProvider::with_pool((**db_pool).clone()))
                    } else {
                        Arc::new(VnMarketProvider::new())
                    };
                    (
                        Some(p.clone() as Arc<dyn MarketDataProvider + Send + Sync>),
                        Some(p as Arc<dyn AssetProfiler + Send + Sync>),
                    )
                }
                _ => {
                    warn!("Unknown market data provider ID: {}. Skipping.", setting.id);
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

    pub fn get_enabled_providers(
        &self,
    ) -> Vec<(&String, &Arc<dyn MarketDataProvider + Send + Sync>)> {
        self.ordered_data_provider_ids
            .iter()
            .filter_map(|id| self.data_providers.get(id).map(|p| (id, p)))
            .collect()
    }

    pub fn get_enabled_profilers(&self) -> Vec<(&String, &Arc<dyn AssetProfiler + Send + Sync>)> {
        self.ordered_profiler_ids
            .iter()
            .filter_map(|id| self.asset_profilers.get(id).map(|p| (id, p)))
            .collect()
    }

    /// Get the ordered list of profiler IDs by priority
    pub fn get_ordered_profiler_ids(&self) -> &[String] {
        &self.ordered_profiler_ids
    }

    pub async fn historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        for (provider_id, p) in self.get_enabled_providers() {
            match p
                .get_historical_quotes(symbol, start, end, fallback_currency.clone())
                .await
            {
                Ok(q_vec) if !q_vec.is_empty() => return Ok(q_vec),
                Ok(_) => info!(
                    "Provider '{}' returned no historical quotes for symbol '{}'. Trying next.",
                    provider_id, symbol
                ),
                Err(MarketDataError::NoData) => {
                    info!(
                        "Provider '{}' reported no data for symbol '{}'. Stopping.",
                        provider_id, symbol
                    );
                    return Ok(vec![]);
                }
                Err(e) => warn!(
                    "Provider '{}' failed to get historical quotes for symbol '{}': {:?}. Trying next.",
                    provider_id, symbol, e
                ),
            }
        }
        Err(MarketDataError::NotFound(symbol.to_string()))
    }

    pub async fn historical_quotes_bulk(
        &self,
        quote_requests: &[QuoteRequest],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        if self.ordered_data_provider_ids.is_empty() {
            warn!("No data providers available for historical_quotes_bulk.");
            return Ok((vec![], quote_requests.iter().map(|req| (req.symbol.clone(), req.currency.clone())).collect()));
        }

        let mut all_quotes = Vec::new();
        let mut remaining_requests = quote_requests.to_vec();

        // Group symbols by their explicit data_source to avoid unnecessary API calls
        let provider_symbol_assignments = self.assign_symbols_to_providers(&quote_requests);

        for (provider_id, provider) in self.get_enabled_providers() {
            if remaining_requests.is_empty() {
                break;
            }

            // Get requests that this provider should handle based on explicit data_source
            let provider_requests = provider_symbol_assignments
                .get(provider_id)
                .map(|requests| requests.iter().filter(|req| remaining_requests.iter().any(|rreq| rreq.symbol == req.symbol && rreq.data_source == req.data_source)).cloned().collect::<Vec<_>>())
                .unwrap_or_else(Vec::new);

            if provider_requests.is_empty() {
                debug!("No requests assigned to provider '{}'", provider_id);
                continue;
            }

            info!(
                "Using provider '{}' to fetch bulk historical quotes for {} assigned requests ({} total remaining).",
                provider_id,
                provider_requests.len(),
                remaining_requests.len()
            );

            let symbols_with_currencies: Vec<(String, String)> = provider_requests
                .iter()
                .map(|req| (req.symbol.clone(), req.currency.clone()))
                .collect();

            match provider
                .get_historical_quotes_bulk(&symbols_with_currencies, start, end)
                .await
            {
                Ok((quotes, failed)) => {
                    debug!("Successfully fetched {} public quotes.", quotes.len());
                    if !failed.is_empty() {
                        warn!(
                            "Provider '{}' failed to fetch data for {} symbols. Retrying with next provider.",
                            provider_id,
                            failed.len()
                        );
                        // Keep failed requests for next provider
                    } else {
                        // Remove successfully fetched requests from remaining list
                        let successfully_fetched_symbols: HashSet<String> = quotes.iter().map(|q| q.symbol.clone()).collect();
                        remaining_requests.retain(|req| !successfully_fetched_symbols.contains(&req.symbol));
                    }
                    all_quotes.extend(quotes);
                }
                Err(e) => {
                    error!(
                        "Provider '{}' failed completely: {:?}. All assigned requests will be retried with next provider.",
                        provider_id, e
                    );
                }
            }
        }

        if !remaining_requests.is_empty() {
            warn!(
                "After trying all providers, failed to fetch data for {:?} requests.",
                remaining_requests.iter().map(|req| (req.symbol.clone(), req.data_source.clone())).collect::<Vec<_>>()
            );
        }

        // Return any remaining requests as failures
        let final_failures = remaining_requests
            .into_iter()
            .map(|req| {
                let symbol = req.symbol.clone();
                (symbol, format!("No provider could fetch data for symbol {} with data_source {:?}", req.symbol, req.data_source))
            })
            .collect();

        Ok((all_quotes, final_failures))
    }    fn assign_symbols_to_providers(
        &self,
        quote_requests: &[QuoteRequest],
    ) -> HashMap<String, Vec<QuoteRequest>> {
        let mut assignments: HashMap<String, Vec<QuoteRequest>> = HashMap::new();

        for quote_request in quote_requests {
            let provider_id = match quote_request.data_source {
                DataSource::Yahoo => DATA_SOURCE_YAHOO.to_string(),
                DataSource::AlphaVantage => DATA_SOURCE_ALPHA_VANTAGE.to_string(),
                DataSource::MetalPriceApi => DATA_SOURCE_METAL_PRICE_API.to_string(),
                DataSource::MarketDataApp => DATA_SOURCE_MARKET_DATA_APP.to_string(),
                DataSource::VnMarket => DATA_SOURCE_VN_MARKET.to_string(),
                DataSource::Manual => {
                    warn!("Manual data source requested for sync, skipping: {}", quote_request.symbol);
                    continue;
                }
            };

            assignments
                .entry(provider_id)
                .or_insert_with(Vec::new)
                .push(quote_request.clone());
        }

        assignments
    }



    pub async fn get_asset_profile(
        &self,
        symbol: &str,
    ) -> Result<super::models::AssetProfile, MarketDataError> {
        for (profiler_id, profiler) in self.get_enabled_profilers() {
            match profiler.get_asset_profile(symbol).await {
                Ok(profile) => return Ok(profile),
                Err(e) => warn!(
                    "Profiler '{}' failed to get asset profile for symbol '{}': {:?}. Trying next.",
                    profiler_id, symbol, e
                ),
            }
        }
        if symbol.starts_with("$CASH") {
            if let Some(manual_profiler) = self.asset_profilers.get(DATA_SOURCE_MANUAL) {
                return manual_profiler.get_asset_profile(symbol).await;
            }
        }
        Err(MarketDataError::NotFound(symbol.to_string()))
    }

    /// Search all providers in parallel and return combined results with provider IDs
    pub async fn search_ticker_parallel(
            &self,
            query: &str,
        ) -> Result<Vec<(String, QuoteSummary)>, MarketDataError> {
        use futures::future::join_all;

        let profilers = self.get_enabled_profilers();

        // Create futures for all profilers
        let search_futures: Vec<_> = profilers
            .iter()
            .map(|(provider_id, profiler)| {
            let id = (*provider_id).clone();
            let query_str = query.to_string();
        let profiler_clone = Arc::clone(profiler);

        async move {
                    match profiler_clone.search_ticker(&query_str).await {
                Ok(results) => {
                info!("Provider '{}' found {} results for '{}'", id, results.len(), query_str);
            // Tag each result with provider ID for priority sorting
        results.into_iter().map(|r| (id.clone(), r)).collect::<Vec<_>>()
        }
        Err(e) => {
            debug!("Provider '{}' search failed: {:?}", id, e);
            vec![]
        }
        }
        }
        })
        .collect();

        // Execute all searches in parallel
        let all_results = join_all(search_futures).await;

        // Flatten results: Vec<Vec<(provider_id, QuoteSummary)>> -> Vec<(provider_id, QuoteSummary)>
        let combined: Vec<(String, QuoteSummary)> = all_results
        .into_iter()
        .flatten()
            .collect();

        info!("Parallel search completed: {} total results from all providers", combined.len());
        Ok(combined)
        }
}
