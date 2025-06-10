use async_trait::async_trait;
use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use log::{debug, error};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::SystemTime;

use super::market_data_constants::*;
use super::market_data_model::{LatestQuotePair, Quote, QuoteRequest, QuoteSummary, MarketDataProviderInfo};
use super::market_data_traits::{MarketDataRepositoryTrait, MarketDataServiceTrait};
use super::providers::models::AssetProfile;
use crate::assets::assets_constants::CASH_ASSET_TYPE;
use crate::assets::assets_traits::AssetRepositoryTrait;
use crate::errors::Result;
use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::ProviderRegistry;

pub struct MarketDataService {
    provider_registry: Arc<ProviderRegistry>,
    repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
    asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>,
}

#[async_trait]
impl MarketDataServiceTrait for MarketDataService {
    async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>> {
        // Use the default provider (Yahoo) for symbol search
        self.provider_registry
            .default_provider()
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
        if symbol.starts_with("$CASH") {
            // Use manual provider for $CASH-
            self.provider_registry
                .get_profiler(DataSource::Manual)
                .get_asset_profile(symbol)
                .await
                .map_err(|e| e.into())
        } else {
            // Try Yahoo first, then fall back to manual if needed
            match self
                .provider_registry
                .get_profiler(DataSource::Yahoo)
                .get_asset_profile(symbol)
                .await
            {
                Ok(asset) => Ok(asset),
                Err(_) => self
                    .provider_registry
                    .get_profiler(DataSource::Manual)
                    .get_asset_profile(symbol)
                    .await
                    .map_err(|e| e.into()),
            }
        }
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

        // Use the default provider (Yahoo) for history
        self.provider_registry
            .default_provider()
            .get_historical_quotes(symbol, start_time, end_time, "USD".to_string())
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
        let latest_sync_dates_by_source = self.repository.get_latest_sync_dates_by_source()?;

        let mut providers_info = Vec::new();

        // Define known providers statically or load from config
        // For now, hardcoding based on existing frontend and common data sources
        let known_providers = vec![
            (DATA_SOURCE_YAHOO, "Yahoo Finance", "yahoo-finance.png"),
        ];

        for (id, name, logo_filename) in known_providers {
            let last_synced_naive: Option<NaiveDateTime> = latest_sync_dates_by_source
                .get(id)
                .and_then(|opt_dt| *opt_dt);

            let last_synced_utc: Option<DateTime<Utc>> = 
                last_synced_naive.map(|naive_dt| Utc.from_utc_datetime(&naive_dt));

            providers_info.push(MarketDataProviderInfo {
                id: id.to_string(),
                name: name.to_string(),
                logo_filename: logo_filename.to_string(),
                last_synced_date: last_synced_utc,
            });
        }
        
        debug!("Market data providers info: {:?}", providers_info);
        Ok(providers_info)
    }
}

impl MarketDataService {
    pub async fn new(
        repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
        asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>, // Add asset_repository param
    ) -> Result<Self> {
        let provider_registry = Arc::new(ProviderRegistry::new().await?);

        Ok(Self {
            provider_registry,
            repository,
            asset_repository,
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
            let start_date_time =
                self.calculate_sync_start_time(refetch_all, &symbols_with_currencies)?;

            match self
                .provider_registry
                .get_provider(DataSource::Yahoo)
                .get_historical_quotes_bulk(
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

       
        // Insert all successfully fetched and filled quotes
        if !all_quotes.is_empty() {
            debug!(
                "Attempting to save {} filled quotes to the repository.",
                all_quotes.len()
            );
            // Sort before saving might help with consistency or performance depending on DB indexing
            all_quotes.sort_by(|a, b| {
                a.symbol
                    .cmp(&b.symbol)
                    .then(a.timestamp.cmp(&b.timestamp))
                    .then(a.data_source.as_str().cmp(b.data_source.as_str()))
            });
            if let Err(e) = self.repository.save_quotes(&all_quotes).await {
                // Save the filled quotes
                error!("Failed to save synced quotes to repository: {}", e);
                // Consider how to handle partial saves or repository errors. Maybe add all symbols as failed.
                // For now, just log the error.
                failed_syncs.push(("repository_save".to_string(), e.to_string()));
            } else {
                debug!(
                    "Successfully saved {} filled quotes.",
                    all_quotes.len()
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
