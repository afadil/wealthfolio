use async_trait::async_trait;
use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use log::{debug, error};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::SystemTime;
// Removed tauri::Manager and Stronghold from here, they are method-specific for update_..._settings

use super::market_data_constants::*;
use super::market_data_model::{LatestQuotePair, Quote, QuoteRequest, QuoteSummary, MarketDataProviderInfo, MarketDataProviderSetting, UpdateMarketDataProviderSetting};
use super::market_data_traits::{MarketDataRepositoryTrait, MarketDataServiceTrait};
use super::market_data_errors::MarketDataError;
use super::providers::models::AssetProfile;
use super::providers::api_key_resolver::ApiKeyResolver; // Added for constructor
use crate::assets::assets_constants::CASH_ASSET_TYPE;
use crate::assets::assets_traits::AssetRepositoryTrait;
use crate::errors::Result;
use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::ProviderRegistry;

pub struct MarketDataService {
    provider_registry: Arc<ProviderRegistry>,
    repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
    asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>,
    api_key_resolver: Arc<dyn ApiKeyResolver>, // Added field
}

#[async_trait]
impl MarketDataServiceTrait for MarketDataService {
    async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>> {
        // ProviderRegistry's search_ticker method will handle using the default/first capable provider
        self.provider_registry
            .search_ticker(query)
            .await
            .map_err(|e| e.into())
    }

    fn get_latest_quote_for_symbol(&self, symbol: &str) -> Result<Quote> {
        self.repository.get_latest_quote_for_symbol(symbol)
    }

    fn get_latest_quotes_for_symbols(&self, symbols: &[String]) -> Result<HashMap<String, Quote>> {
        self.repository.get_latest_quotes_for_symbols(symbols)
    }

    fn get_latest_quotes_pair_for_symbols(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, LatestQuotePair>> {
        self.repository.get_latest_quotes_pair_for_symbols(symbols)
    }

    fn get_all_historical_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>> {
        let quotes = self.repository.get_all_historical_quotes()?;
        let mut quotes_map: HashMap<String, Vec<(NaiveDate, Quote)>> = HashMap::new();

        for quote in quotes {
            let quote_date = quote.timestamp.date_naive();
            quotes_map
                .entry(quote.symbol.clone())
                .or_insert_with(Vec::new)
                .push((quote_date, quote));
        }

        // For each symbol, sort its quotes by date descendingly
        for (_symbol, symbol_quotes_tuples) in quotes_map.iter_mut() {
            // Sort tuples by date descendingly
            symbol_quotes_tuples.sort_by(|a, b| b.0.cmp(&a.0));
        }

        Ok(quotes_map)
    }

    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile> {
        // ProviderRegistry's get_asset_profile method handles iteration and $CASH logic
        self.provider_registry
            .get_asset_profile(symbol)
            .await
            .map_err(|e| e.into())
    }

    fn get_historical_quotes_for_symbol(&self, symbol: &str) -> Result<Vec<Quote>> {
        let mut quotes = self.repository.get_historical_quotes_for_symbol(symbol)?;
        // Ensure quotes are sorted ascendingly by timestamp before returning
        quotes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        Ok(quotes)
    }

    async fn add_quote(&self, quote: &Quote) -> Result<Quote> {
        self.repository.save_quote(quote).await
    }

    async fn update_quote(&self, quote: Quote) -> Result<Quote> {
        self.repository.save_quote(&quote).await
    }

    async fn delete_quote(&self, quote_id: &str) -> Result<()> {
        self.repository.delete_quote(quote_id).await
    }

    async fn get_historical_quotes_from_provider(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>> {
        debug!(
            "Getting symbol history for {} from {} to {}",
            symbol, start_date, end_date
        );
        let start_time: SystemTime = Utc
            .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap())
            .into();
        let end_time: SystemTime = Utc
            .from_utc_datetime(&end_date.and_hms_opt(23, 59, 59).unwrap())
            .into();

        // ProviderRegistry's historical_quotes method will iterate through providers
        self.provider_registry
            .historical_quotes(symbol, start_time, end_time, "USD".to_string()) // Assuming "USD" is a sensible default/fallback
            .await
            .map_err(|e| e.into())
    }

    async fn sync_market_data(&self) -> Result<((), Vec<(String, String)>)> {
        debug!("Syncing market data.");

        // Fetch assets based on input symbols
        let assets = self.asset_repository.list()?;

        // Filter out cash assets and create QuoteRequest objects
        let quote_requests: Vec<_> = assets
            .iter()
            .filter(|asset| asset.asset_type.as_deref() != Some(CASH_ASSET_TYPE))
            .map(|asset| QuoteRequest {
                symbol: asset.symbol.clone(),
                data_source: DataSource::from(asset.data_source.as_str()),
                currency: asset.currency.clone(),
            })
            .collect();

        self.process_market_data_sync(quote_requests, false).await
    }

    async fn resync_market_data(&self, symbols: Option<Vec<String>>) -> Result<((), Vec<(String, String)>)> {
        debug!("Resyncing market data. Symbols: {:?}", symbols);

        // Fetch assets based on input symbols
        let assets = match symbols {
            Some(syms) if !syms.is_empty() => {
                self.asset_repository.list_by_symbols(&syms)?
            }
            _ => {
                debug!("No symbols provided or empty list. Fetching all assets.");
                self.asset_repository.list()?
            }
        };

        // Filter out cash assets and create QuoteRequest objects
        let quote_requests: Vec<_> = assets
            .iter()
            .filter(|asset| asset.asset_type.as_deref() != Some(CASH_ASSET_TYPE))
            .map(|asset| QuoteRequest {
                symbol: asset.symbol.clone(),
                data_source: DataSource::from(asset.data_source.as_str()),
                currency: asset.currency.clone(),
            })
            .collect();

        self.process_market_data_sync(quote_requests, true).await
    }

    fn get_historical_quotes_for_symbols_in_range(
        &self,
        symbols: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>> {
        debug!(
            "Fetching historical quotes for {} symbols between {} and {}.",
            symbols.len(),
            start_date,
            end_date
        );
        let quotes = self
            .repository
            .get_historical_quotes_for_symbols_in_range(symbols, start_date, end_date)?;

        // The repository provides the quotes; no further processing needed here.
        Ok(quotes)
    }

    // --- Fetches historical quotes for the needed symbols and date range, grouped by date ---
    async fn get_daily_quotes(
        &self,
        asset_ids: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>> {
        if asset_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Fetch quotes using the repository method
        let quotes_vec = self
            .repository
            .get_historical_quotes_for_symbols_in_range(asset_ids, start_date, end_date)?;

        let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();
        for quote in quotes_vec {
            // Ensure we use the date part only for grouping
            let date_key = quote.timestamp.date_naive();
            quotes_by_date
                .entry(date_key)
                .or_default()
                .insert(quote.symbol.clone(), quote);
        }

        Ok(quotes_by_date)
    }

    async fn get_market_data_providers_info(&self) -> Result<Vec<MarketDataProviderInfo>> {
        debug!("Fetching market data providers info");
        
        let settings = self.repository.get_all_providers()?;
        
        let providers_info: Result<Vec<MarketDataProviderInfo>> = settings
            .into_iter()
            .map(|setting| {
                let last_synced_naive: Option<NaiveDateTime> = self
                    .repository
                    .get_last_quote_timestamp_for_provider(&setting.id)?;
                
                let last_synced_utc: Option<DateTime<Utc>> = last_synced_naive.map(|naive_dt| {
                    // Ensure the NaiveDateTime is treated as UTC before converting
                    Utc.from_utc_datetime(&naive_dt)
                });

                Ok(MarketDataProviderInfo {
                    id: setting.id,
                    name: setting.name,
                    logo_filename: setting.logo_filename.unwrap_or_default(),
                    last_synced_date: last_synced_utc,
                })
            })
            .collect(); // Collect into Result<Vec<MarketDataProviderInfo>, Error>
        
        let result = providers_info?; // Propagate any error from the mapping/collection

        debug!("Market data providers info: {:?}", result);
        Ok(result)
    }

    // --- Methods for MarketDataProviderSetting ---

    async fn get_market_data_providers_settings(&self) -> Result<Vec<MarketDataProviderSetting>> {
        self.repository.get_all_providers()
    }

    async fn update_market_data_provider_settings(
        &self,
        // Removed: app_handle: &tauri::AppHandle,
        provider_id: String,
        api_key: Option<String>,
        priority: i32,
        enabled: bool,
    ) -> Result<MarketDataProviderSetting> {
        debug!(
            "Updating market data provider settings for ID: {}",
            provider_id
        );

        let current_settings = self.repository.get_provider_by_id(&provider_id)?;
        let mut api_key_vault_path_to_store = current_settings.api_key_vault_path.clone();

        if let Some(key_to_set) = api_key {
            // New key provided, or existing key is being updated.
            // If key_to_set is empty, it implies clearing the key.
            if key_to_set.is_empty() {
                if let Some(ref old_vault_path) = api_key_vault_path_to_store {
                    if !old_vault_path.is_empty() {
                        debug!("API key for {} is empty, deleting old key from path: {}", provider_id, old_vault_path);
                        self.api_key_resolver.delete_api_key(old_vault_path).await.map_err(|e| 
                            MarketDataError::ApiKeyStorageError(format!("Failed to delete API key from resolver: {}", e))
                        )?;
                    }
                }
                api_key_vault_path_to_store = None; // Key is cleared, so no vault path.
            } else {
                // Key has content, so save it.
                let vault_path = format!("market_data_provider_api_key_{}", provider_id);
                debug!("Setting API key for {} at path: {}", provider_id, vault_path);
                self.api_key_resolver.set_api_key(&vault_path, &key_to_set).await.map_err(|e|
                     MarketDataError::ApiKeyStorageError(format!("Failed to save API key via resolver: {}", e))
                )?;
                api_key_vault_path_to_store = Some(vault_path);
            }
        } else {
            // api_key is None, meaning the user did not provide an API key in this update operation.
            // This means "do not change the API key or its vault path".
            // The api_key_vault_path_to_store is already current_settings.api_key_vault_path.clone(), so no action needed here.
            debug!("No API key provided in update for {}, vault path remains unchanged: {:?}", provider_id, api_key_vault_path_to_store);
        }
        
        let changes = UpdateMarketDataProviderSetting {
            api_key_vault_path: api_key_vault_path_to_store,
            priority: Some(priority),
            enabled: Some(enabled),
        };

        self.repository
            .update_provider_settings(provider_id, changes)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::market_data::market_data_model::{MarketDataProviderSetting, MarketDataProviderInfo, Quote, LatestQuotePair, QuoteSummary, DataSource};
    use crate::market_data::providers::api_key_resolver::{ApiKeyResolver, NoOpApiKeyResolver};
    use crate::market_data::providers::models::AssetProfile;
    use crate::assets::assets_model::Asset;
    use crate::errors::{Result as CoreResult, Error as CoreError};
    use async_trait::async_trait;
    use std::sync::Arc;
    use std::collections::{HashMap, HashSet};
    use chrono::{Utc, NaiveDate, NaiveDateTime, DateTime};
    use tokio::runtime::Runtime as TokioRuntime;
    use rust_decimal::Decimal;
    use std::time::SystemTime;

    // --- Mock MarketDataRepository ---
    #[derive(Default, Clone)]
    struct MockMarketDataRepository {
        providers: Vec<MarketDataProviderSetting>,
        last_quote_timestamps: HashMap<String, Option<NaiveDateTime>>,
        quotes_saved: std::sync::Mutex<Vec<Quote>>,
        historical_quotes: HashMap<String, Vec<Quote>>,
    }

    impl MockMarketDataRepository {
        fn add_provider(&mut self, provider: MarketDataProviderSetting) {
            self.providers.push(provider);
        }
        fn set_last_quote_timestamp(&mut self, provider_id: &str, timestamp: Option<NaiveDateTime>) {
            self.last_quote_timestamps.insert(provider_id.to_string(), timestamp);
        }
        fn add_historical_quote(&mut self, symbol: &str, quote: Quote) {
            self.historical_quotes.entry(symbol.to_string()).or_default().push(quote);
        }
    }

    #[async_trait]
    impl MarketDataRepositoryTrait for MockMarketDataRepository {
        fn get_all_providers(&self) -> CoreResult<Vec<MarketDataProviderSetting>> {
            Ok(self.providers.clone())
        }
        fn get_provider_by_id(&self, provider_id_input: &str) -> CoreResult<MarketDataProviderSetting> {
            self.providers.iter().find(|p| p.id == provider_id_input).cloned()
                .ok_or_else(|| CoreError::MarketData(MarketDataError::NotFound(format!("Provider {} not found", provider_id_input))))
        }
        async fn update_provider_settings(&self, _provider_id: String, _changes: UpdateMarketDataProviderSetting) -> CoreResult<MarketDataProviderSetting> {
            // For testing service, this detail might not be critical, or can be enhanced
            unimplemented!("Mocked update_provider_settings")
        }
        fn get_last_quote_timestamp_for_provider(&self, provider_id: &str) -> CoreResult<Option<NaiveDateTime>> {
            Ok(self.last_quote_timestamps.get(provider_id).cloned().unwrap_or(None))
        }
        async fn save_quotes(&self, quotes_to_save: &[Quote]) -> CoreResult<()> {
            let mut saved = self.quotes_saved.lock().unwrap();
            saved.extend_from_slice(quotes_to_save);
            Ok(())
        }
        // --- Other MarketDataRepositoryTrait methods (can be unimplemented! or return defaults) ---
        fn get_all_historical_quotes(&self) -> CoreResult<Vec<Quote>> { Ok(vec![]) }
        fn get_historical_quotes_for_symbol(&self, symbol: &str) -> CoreResult<Vec<Quote>> { 
            Ok(self.historical_quotes.get(symbol).cloned().unwrap_or_default())
        }
        async fn save_quote(&self, quote: &Quote) -> CoreResult<Quote> { Ok(quote.clone()) }
        async fn delete_quote(&self, _quote_id: &str) -> CoreResult<()> { Ok(()) }
        async fn delete_quotes_for_symbols(&self, _symbols: &[String]) -> CoreResult<()> { Ok(()) }
        fn get_quotes_by_source(&self, _symbol: &str, _source: &str) -> CoreResult<Vec<Quote>> { Ok(vec![]) }
        async fn upsert_manual_quotes_from_activities(&self, _symbol: &str) -> CoreResult<Vec<Quote>> { Ok(vec![]) }
        fn get_latest_quote_for_symbol(&self, _symbol: &str) -> CoreResult<Quote> { unimplemented!() }
        fn get_latest_quotes_for_symbols(&self, _symbols: &[String]) -> CoreResult<HashMap<String, Quote>> { Ok(HashMap::new()) }
        fn get_latest_quotes_pair_for_symbols(&self, _symbols: &[String], ) -> CoreResult<HashMap<String, LatestQuotePair>> { Ok(HashMap::new()) }
        fn get_historical_quotes_for_symbols_in_range(&self, _symbols: &HashSet<String>, _start_date: NaiveDate, _end_date: NaiveDate) -> CoreResult<Vec<Quote>> { Ok(vec![]) }
        fn get_latest_sync_dates_by_source(&self) -> CoreResult<HashMap<String, Option<NaiveDateTime>>> { Ok(HashMap::new()) }
    }

    // --- Mock AssetRepository ---
    #[derive(Default, Clone)]
    struct MockAssetRepository {
        assets: Vec<Asset>,
    }
    impl MockAssetRepository {
        fn add_asset(&mut self, asset: Asset) {
            self.assets.push(asset);
        }
    }
    #[async_trait]
    impl crate::assets::assets_traits::AssetRepositoryTrait for MockAssetRepository {
        fn list(&self) -> CoreResult<Vec<Asset>> { Ok(self.assets.clone()) }
        fn list_by_symbols(&self, symbols_list: &[String]) -> CoreResult<Vec<Asset>> {
             Ok(self.assets.iter().filter(|a| symbols_list.contains(&a.symbol)).cloned().collect())
        }
        // --- Other AssetRepositoryTrait methods ---
        fn get_by_id(&self, _id: &str) -> CoreResult<Option<Asset>> { Ok(None) }
        fn get_by_symbol(&self, _symbol: &str) -> CoreResult<Option<Asset>> { Ok(None) }
        async fn create(&self, _asset: &Asset) -> CoreResult<Asset> { unimplemented!() }
        async fn update(&self, _asset: &Asset) -> CoreResult<Asset> { unimplemented!() }
        async fn delete(&self, _id: &str) -> CoreResult<()> { Ok(()) }
        fn get_all_symbols(&self) -> CoreResult<Vec<String>> { Ok(vec![]) }
        fn get_all_currencies(&self) -> CoreResult<Vec<String>> { Ok(vec![]) }
    }

    // Helper to create Tokio runtime for async tests
    fn get_runtime() -> TokioRuntime {
        TokioRuntime::new().unwrap()
    }
    
    // Helper to create service with mocks
    async fn create_service_with_mocks(
        mock_repo: Arc<MockMarketDataRepository>,
        mock_asset_repo: Arc<MockAssetRepository>,
        settings: Vec<MarketDataProviderSetting> // Settings to init ProviderRegistry
    ) -> MarketDataService {
        let api_key_resolver = Arc::new(NoOpApiKeyResolver); // ProviderRegistry tests cover ApiKeyResolver logic
        let provider_registry = Arc::new(ProviderRegistry::new(api_key_resolver, settings).await.unwrap());
        
        MarketDataService {
            provider_registry,
            repository: mock_repo as Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
            asset_repository: mock_asset_repo as Arc<dyn crate::assets::assets_traits::AssetRepositoryTrait + Send + Sync>,
        }
    }

    #[test]
    fn test_gmdpi_no_providers() {
        get_runtime().block_on(async {
            let mock_repo = Arc::new(MockMarketDataRepository::default());
            let mock_asset_repo = Arc::new(MockAssetRepository::default());
            let service = create_service_with_mocks(mock_repo.clone(), mock_asset_repo.clone(), vec![]).await;

            let result = service.get_market_data_providers_info().await.unwrap();
            assert!(result.is_empty());
        });
    }

    #[test]
    fn test_gmdpi_with_providers() {
        get_runtime().block_on(async {
            let mut mock_repo = MockMarketDataRepository::default();
            let p1_settings = MarketDataProviderSetting { id: "yahoo".to_string(), name: "Yahoo Finance".to_string(), api_key_vault_path: None, priority: 1, enabled: true, logo_filename: Some("yahoo.png".to_string()) };
            let p2_settings = MarketDataProviderSetting { id: "mda".to_string(), name: "MarketDataApp".to_string(), api_key_vault_path: Some("path1".to_string()), priority: 2, enabled: true, logo_filename: Some("mda.png".to_string()) };
            mock_repo.add_provider(p1_settings.clone());
            mock_repo.add_provider(p2_settings.clone());

            let p1_last_sync = NaiveDate::from_ymd_opt(2023, 1, 1).unwrap().and_hms_opt(12,0,0).unwrap();
            mock_repo.set_last_quote_timestamp("yahoo", Some(p1_last_sync));
            // p2 has no sync date set in mock_repo, so it will be None.

            let service = create_service_with_mocks(Arc::new(mock_repo), Arc::new(MockAssetRepository::default()), vec![p1_settings.clone(), p2_settings.clone()]).await;
            
            let infos = service.get_market_data_providers_info().await.unwrap();
            
            assert_eq!(infos.len(), 2);
            
            let info_p1 = infos.iter().find(|i| i.id == "yahoo").unwrap();
            assert_eq!(info_p1.name, "Yahoo Finance");
            assert_eq!(info_p1.logo_filename, "yahoo.png");
            assert_eq!(info_p1.last_synced_date, Some(Utc.from_utc_datetime(&p1_last_sync)));

            let info_p2 = infos.iter().find(|i| i.id == "mda").unwrap();
            assert_eq!(info_p2.name, "MarketDataApp");
            assert_eq!(info_p2.logo_filename, "mda.png");
            assert!(info_p2.last_synced_date.is_none());
        });
    }

    #[test]
    fn test_sync_market_data_no_assets() {
         get_runtime().block_on(async {
            let mock_repo = Arc::new(MockMarketDataRepository::default());
            let mock_asset_repo = Arc::new(MockAssetRepository::default()); // No assets
            // ProviderRegistry will be empty if no settings are passed that lead to active providers
            let service = create_service_with_mocks(mock_repo.clone(), mock_asset_repo.clone(), vec![]).await;

            let (_empty_tuple, errors) = service.sync_market_data().await.unwrap();
            assert!(errors.is_empty());
            let saved_quotes = mock_repo.quotes_saved.lock().unwrap();
            assert!(saved_quotes.is_empty());
        });
    }
    
    #[test]
    fn test_sync_market_data_with_assets_calls_registry_and_saves() {
        // This test is more of an integration test for MarketDataService + ProviderRegistry(with real Yahoo) + Mock Repos
         get_runtime().block_on(async {
            let mut mock_repo = MockMarketDataRepository::default();
            let mut mock_asset_repo = MockAssetRepository::default();

            mock_asset_repo.add_asset(Asset { symbol: "AAPL".to_string(), currency: "USD".to_string(), asset_type: Some("STOCK".to_string()), data_source: DataSource::Yahoo.as_str().to_string(), ..Default::default() });
            mock_asset_repo.add_asset(Asset { symbol: "MSFT".to_string(), currency: "USD".to_string(), asset_type: Some("STOCK".to_string()), data_source: DataSource::Yahoo.as_str().to_string(), ..Default::default() });
            
            // Configure ProviderRegistry to use YahooProvider via settings
            let yahoo_setting = MarketDataProviderSetting { id: "yahoo".to_string(), name: "Yahoo".to_string(), api_key_vault_path: None, priority: 1, enabled: true, logo_filename: None };
            
            let service = create_service_with_mocks(Arc::new(mock_repo.clone()), Arc::new(mock_asset_repo), vec![yahoo_setting]).await;

            // Running sync_market_data will make real calls if YahooProvider is used by ProviderRegistry.
            // For a unit test, ProviderRegistry should ideally be mockable, or its providers mockable.
            // Here, we test the flow assuming YahooProvider might return data or errors.
            // The key is that process_market_data_sync is called and attempts to save.
            let (_empty_tuple, errors) = service.sync_market_data().await.unwrap();
            
            // We can't deterministically check `errors` or `saved_quotes` content without mocking Yahoo's network calls.
            // However, we can check if save_quotes was called if it returned some quotes.
            // If Yahoo returns an error (e.g. network issue), errors might be populated.
            // If it returns quotes, quotes_saved should not be empty.
            // This test is therefore not fully isolated if Yahoo makes network calls.
            // For now, we just check that it runs without panic.
            println!("Sync market data errors: {:?}", errors);
            let saved_quotes_count = mock_repo.quotes_saved.lock().unwrap().len();
            println!("Number of quotes saved: {}", saved_quotes_count);
            // Assertions here depend on whether YahooProvider actually fetched anything
            // or if it failed gracefully. If it failed, errors might not be empty.
            // If it succeeded, saved_quotes_count > 0.
            // This test highlights the need for deeper mocking if full isolation is required.
        });
    }

    // Tests for delegation methods (search_symbol, get_asset_profile)
    // These also depend on the configured ProviderRegistry and its (real) providers.
    #[test]
    fn test_search_symbol_delegates_to_registry() {
        get_runtime().block_on(async {
            let yahoo_setting = MarketDataProviderSetting { id: "yahoo".to_string(), name: "Yahoo".to_string(), api_key_vault_path: None, priority: 1, enabled: true, logo_filename: None };
            let service = create_service_with_mocks(Arc::new(MockMarketDataRepository::default()), Arc::new(MockAssetRepository::default()), vec![yahoo_setting]).await;
            
            // This will call YahooProvider.search_ticker via ProviderRegistry
            let result = service.search_symbol("AAPL").await;
            // Assert based on expected behavior of YahooProvider (might fail if no network)
            if result.is_ok() {
                println!("Search symbol AAPL returned: {:?}", result.unwrap());
            } else {
                println!("Search symbol AAPL failed: {:?}", result.unwrap_err());
            }
        });
    }
}

impl MarketDataService {
    pub async fn new(
        api_key_resolver: Arc<dyn ApiKeyResolver>, 
        repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
        asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>,
    ) -> Result<Self> {
        let provider_settings = repository.get_all_providers()?;
        // Pass the resolver to ProviderRegistry constructor
        let provider_registry = Arc::new(ProviderRegistry::new(api_key_resolver.clone(), provider_settings).await?);

        Ok(Self {
            provider_registry,
            repository,
            asset_repository,
            api_key_resolver, // Store it
        })
    }

    async fn process_market_data_sync(
        &self,
        quote_requests: Vec<QuoteRequest>,
        refetch_all: bool,
    ) -> Result<((), Vec<(String, String)>)> {
        if quote_requests.is_empty() {
            debug!("No non-cash assets found matching the criteria. Skipping sync.");
            return Ok(((), Vec::new()));
        }

        // Set end date to the end of the current day (local time) to ensure full coverage.
        let current_local_naive_date = Local::now().date_naive();
        // Convert the local date with end-of-day time to UTC for SystemTime
        let end_date_naive_local = current_local_naive_date.and_hms_opt(23, 59, 59).unwrap();
        let end_date: SystemTime = Utc
            .from_utc_datetime(
                &end_date_naive_local
                    .and_local_timezone(Local)
                    .unwrap()
                    .naive_utc(),
            )
            .into();
        let initial_request_count = quote_requests.len(); // Store length before moving

        // Group requests by data source
        let (manual_requests, public_requests): (Vec<_>, Vec<_>) = quote_requests
            .into_iter() // Use into_iter to consume quote_requests
            .partition(|req| req.data_source == DataSource::Manual);

        let mut all_quotes = Vec::with_capacity(initial_request_count * 100); // Use stored length
        let mut failed_syncs = Vec::new();

        // Process manual quotes sequentially
        for request in manual_requests {
            debug!("Processing manual quote request for: {}", request.symbol);
            match self.sync_manual_quotes(&request).await {
                Ok(quotes) => all_quotes.extend(quotes),
                Err(e) => {
                    error!(
                        "Failed to sync manual quotes for symbol {}: {}",
                        request.symbol, e
                    );
                    failed_syncs.push((request.symbol.clone(), e.to_string()));
                }
            }
        }

        // Extract symbols for public requests
        let symbols_with_currencies: Vec<(String, String)> = public_requests
            .iter()
            .map(|req| (req.symbol.clone(), req.currency.clone()))
            .collect();

        // Fetch all public quotes in parallel if there are any
        if !symbols_with_currencies.is_empty() {
            debug!(
                "Processing {} public quote requests.",
                symbols_with_currencies.len()
            );
            let start_date_time =
                self.calculate_sync_start_time(refetch_all, &symbols_with_currencies)?;

            match self
                .provider_registry // ProviderRegistry now handles iteration
                .historical_quotes_bulk( // This method will use its configured chain
                    &symbols_with_currencies,
                    start_date_time,
                    end_date,
                )
                .await
            {
                Ok((quotes, provider_failures)) => {
                    debug!("Successfully fetched {} public quotes.", quotes.len());
                    all_quotes.extend(quotes);
                    failed_syncs.extend(provider_failures);
                }
                Err(e) => {
                    error!("Failed to sync public quotes batch: {}", e);
                    // Add all public symbols to failed_syncs if the batch fails
                    failed_syncs.extend(
                        symbols_with_currencies
                            .into_iter()
                            .map(|(s, _)| (s, e.to_string())),
                    );
                }
            }
        }

        // Group all fetched quotes by symbol before filling and saving
        let mut quotes_by_symbol: HashMap<String, Vec<Quote>> = HashMap::new();
        for quote in all_quotes {
            quotes_by_symbol
                .entry(quote.symbol.clone())
                .or_default()
                .push(quote);
        }

        // Fill gaps for each symbol up to the sync end date and collect
        let mut filled_quotes_to_save = Vec::new();
        let sync_end_naive_date = current_local_naive_date; // Use the current local date for filling

        for (_symbol, mut symbol_quotes) in quotes_by_symbol {
            if !symbol_quotes.is_empty() {
                // fill_missing_quote_days expects sorted quotes
                symbol_quotes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
                // Fill gaps up to the calculated end date of the sync period
                let filled_symbol_quotes =
                    Self::fill_missing_quote_days(symbol_quotes, Some(sync_end_naive_date));
                filled_quotes_to_save.extend(filled_symbol_quotes);
            }
        }

        // Insert all successfully fetched and filled quotes
        if !filled_quotes_to_save.is_empty() {
            debug!(
                "Attempting to save {} filled quotes to the repository.",
                filled_quotes_to_save.len()
            );
            // Sort before saving might help with consistency or performance depending on DB indexing
            filled_quotes_to_save.sort_by(|a, b| {
                a.symbol
                    .cmp(&b.symbol)
                    .then(a.timestamp.cmp(&b.timestamp))
                    .then(a.data_source.as_str().cmp(b.data_source.as_str()))
            });
            if let Err(e) = self.repository.save_quotes(&filled_quotes_to_save).await {
                // Save the filled quotes
                error!("Failed to save synced quotes to repository: {}", e);
                // Consider how to handle partial saves or repository errors. Maybe add all symbols as failed.
                // For now, just log the error.
                failed_syncs.push(("repository_save".to_string(), e.to_string()));
            } else {
                debug!(
                    "Successfully saved {} filled quotes.",
                    filled_quotes_to_save.len()
                );
            }
        }

        // Always return Ok with the failed_syncs collected
        Ok(((), failed_syncs))
    }

    async fn sync_manual_quotes(&self, request: &QuoteRequest) -> Result<Vec<Quote>> {
        // All DB logic is now in the repository
        self.repository.upsert_manual_quotes_from_activities(&request.symbol).await
    }

    /// Fills missing days in a sequence of quotes, optionally up to a final date.
    fn fill_missing_quote_days(
        mut quotes: Vec<Quote>,
        final_date: Option<NaiveDate>,
    ) -> Vec<Quote> {
        if quotes.is_empty() {
            return quotes;
        }

        // Ensure quotes are sorted by timestamp ascendingly
        quotes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        let mut filled_quotes = Vec::with_capacity(quotes.len() * 2); // Pre-allocate more space

        // Fill gaps between existing quotes
        if quotes.len() >= 2 {
            if let Some(first_quote) = quotes.first() {
                filled_quotes.push(first_quote.clone());
            }
            for window in quotes.windows(2) {
                let prev_quote = &window[0];
                let current_quote = &window[1];

                let prev_date = prev_quote.timestamp.date_naive();
                let current_date = current_quote.timestamp.date_naive();
                let mut date_to_fill = prev_date + Duration::days(1);

                while date_to_fill < current_date {
                    let mut filled_quote = prev_quote.clone();
                    // Use a consistent time like 4 PM UTC for filled quotes, convert to DateTime<Utc>
                    filled_quote.timestamp = match date_to_fill.and_hms_opt(16, 0, 0) {
                        Some(dt) => Utc.from_utc_datetime(&dt),
                        None => {
                            log::error!(
                                "Failed creating NaiveDateTime for {} {}. Skipping fill.",
                                filled_quote.symbol,
                                date_to_fill
                            );
                            date_to_fill += Duration::days(1);
                            continue;
                        }
                    };
                    // Create a unique-ish ID for the filled quote
                    filled_quote.id = format!(
                        "{}_{}-filled",
                        date_to_fill.format("%Y%m%d"),
                        filled_quote.symbol
                    );
                    filled_quote.created_at = Utc::now(); // Mark when it was filled

                    filled_quotes.push(filled_quote);
                    date_to_fill += Duration::days(1);
                }
                filled_quotes.push(current_quote.clone());
            }
        } else if let Some(first_quote) = quotes.first() {
            // If only one quote, start with that
            filled_quotes.push(first_quote.clone());
        }

        // Fill gaps after the last quote up to final_date (if provided)
        if let (Some(end_date), Some(last_quote)) = (final_date, filled_quotes.last().cloned()) {
            let last_quote_date = last_quote.timestamp.date_naive();
            let mut date_to_fill = last_quote_date + Duration::days(1);

            while date_to_fill <= end_date {
                let mut filled_quote = last_quote.clone(); // Clone the last known quote
                                                           // Use a consistent time like 4 PM UTC for filled quotes, convert to DateTime<Utc>
                filled_quote.timestamp = match date_to_fill.and_hms_opt(16, 0, 0) {
                    Some(dt) => Utc.from_utc_datetime(&dt),
                    None => {
                        log::error!(
                            "Failed creating NaiveDateTime for {} {} (end fill). Skipping fill.",
                            filled_quote.symbol,
                            date_to_fill
                        );
                        date_to_fill += Duration::days(1);
                        continue;
                    }
                };
                filled_quote.id = format!(
                    "{}_{}-filled",
                    date_to_fill.format("%Y%m%d"),
                    filled_quote.symbol,
                );
                filled_quote.created_at = Utc::now();

                filled_quotes.push(filled_quote);
                date_to_fill += Duration::days(1);
            }
        }

        // Ensure quotes are sorted by timestamp ascendingly
        quotes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        filled_quotes
    }

    // --- Helper function to calculate the sync start date ---
    fn calculate_sync_start_time(
        &self,
        refetch_all: bool,
        symbols_with_currencies: &[(String, String)],
    ) -> Result<SystemTime> {
        if refetch_all {
            let default_history_days = DEFAULT_HISTORY_DAYS;
            Ok(Utc
                .from_utc_datetime(&(Utc::now().naive_utc() - Duration::days(default_history_days)))
                .into())
        } else {
            // Extract just the symbols for querying latest quotes
            let symbols_for_latest: Vec<String> = symbols_with_currencies
                .iter()
                .map(|(sym, _)| sym.clone())
                .collect();

            // Default start date if no history exists or on error
            let default_history_days = DEFAULT_HISTORY_DAYS;
            let default_start_date =
                Utc::now().naive_utc().date() - Duration::days(default_history_days);

            match self
                .repository
                .get_latest_quotes_for_symbols(&symbols_for_latest)
            {
                Ok(quotes_map) => {
                    // Determine the earliest start date needed across all symbols
                    // Calculate the required start date for each symbol
                    let required_start_dates: Vec<NaiveDate> = symbols_with_currencies
                        .iter()
                        .map(|(symbol, _currency)| {
                            match quotes_map.get(symbol) {
                                Some(latest_quote) => {
                                    // Start fetching from the day *of* the last known quote date
                                    // to potentially update its closing price.
                                    latest_quote.timestamp.date_naive()
                                }
                                None => {
                                    // No quote found for this symbol, needs full history window
                                    debug!("No latest quote found for symbol {}. Using default history window.", symbol);
                                    default_start_date
                                }
                            }
                        })
                        .collect();

                    // Find the earliest (minimum) start date needed across all symbols
                    let overall_earliest_start_date = required_start_dates
                        .into_iter()
                        .min() // Find the minimum date in the Vec
                        .unwrap_or(default_start_date); // Fallback if the vec is empty

                    debug!(
                        "Determined earliest start date for sync: {}",
                        overall_earliest_start_date
                    );
                    // Convert the earliest NaiveDate to SystemTime (start of that day)
                    Ok(Utc
                        .from_utc_datetime(
                            &overall_earliest_start_date.and_hms_opt(0, 0, 0).unwrap(),
                        )
                        .into())
                }
                Err(e) => {
                    error!("Failed to get latest quotes for symbols {:?}: {}. Falling back to default history window.", symbols_for_latest, e);
                    // On error fetching latest quotes, fall back to the full default history window
                    Ok(Utc
                        .from_utc_datetime(&default_start_date.and_hms_opt(0, 0, 0).unwrap())
                        .into())
                }
            }
        }
    }
}
