use diesel::r2d2::{Pool, ConnectionManager};
use diesel::sqlite::SqliteConnection;
use log::{debug, error, info};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;
use chrono::{Duration, NaiveDate, TimeZone, Utc};

use crate::assets::assets_model::NewAsset;
use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::ProviderRegistry;

use super::market_data_errors::{MarketDataError, Result};
use super::market_data_model::{Quote, QuoteUpdate, QuoteSummary, QuoteRequest};
use super::market_data_repository::MarketDataRepository;
use super::market_data_constants::*;

pub struct MarketDataService {
    provider_registry: Arc<ProviderRegistry>,
    repository: MarketDataRepository,
}

impl MarketDataService {
    pub async fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Result<Self> {
        let provider_registry = Arc::new(ProviderRegistry::new().await?);
        
        Ok(Self {
            provider_registry,
            repository: MarketDataRepository::new(pool),
        })
    }

    pub async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>> {
        // Use the default provider (Yahoo) for symbol search
        self.provider_registry.default_provider()
            .search_ticker(query)
            .await
            .map_err(|e| MarketDataError::ProviderError(format!("Failed to search ticker for '{}': {}", query, e)))
    }

    pub fn get_latest_quote(&self, symbol: &str) -> Result<Quote> {
        self.repository.get_latest_quote(symbol)
    }

    pub fn get_latest_quotes(&self, symbols: &[String]) -> Result<HashMap<String, Quote>> {
        self.repository.get_latest_quotes(symbols)
    }

    pub fn get_all_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>> {
        let quotes = self.repository.get_all_quotes()?;
        let mut quotes_map: HashMap<String, Vec<(NaiveDate, Quote)>> = HashMap::new();

        for quote in quotes {
            let quote_date = quote.date.date();
            quotes_map
                .entry(quote.symbol.clone())
                .or_insert_with(Vec::new)
                .push((quote_date, quote));
        }

        // Sort quotes for each symbol by date in descending order
        for symbol_quotes in quotes_map.values_mut() {
            symbol_quotes.sort_by(|a, b| b.0.cmp(&a.0));
        }

        Ok(quotes_map)
    }

    pub async fn get_asset_info(&self, symbol: &str) -> Result<NewAsset> {
        // Try Yahoo first, then fall back to manual if needed
        match self.provider_registry.get_profiler(DataSource::Yahoo)
            .get_asset_profile(symbol)
            .await
        {
            Ok(asset) => Ok(asset),
            Err(_) => self.provider_registry
                .get_profiler(DataSource::Manual)
                .get_asset_profile(symbol)
                .await
                .map_err(|e| MarketDataError::ProviderError(format!("Failed to get symbol profile for {}: {}", symbol, e))),
        }
    }

    pub fn get_quote_history(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>> {
        self.repository.get_quote_history(symbol, start_date, end_date)
    }

    pub async fn refresh_quotes_for_symbols(&self, symbols: &[String]) -> Result<()> {
        debug!("Refreshing quotes for {} symbols", symbols.len());

        self.repository.delete_quotes_for_symbols(symbols)?;

        // Load assets for the given symbols
        let quote_requests = self.repository.get_quote_requests_by_symbols(symbols)?;

        // Sync quotes for these assets
        self.sync_quotes(&quote_requests).await
    }

    pub async fn get_symbol_history_from_provider(
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
        self.provider_registry.default_provider()
            .get_stock_history(symbol, start_time, end_time)
            .await
            .map_err(|e| MarketDataError::ProviderError(format!("Failed to fetch history for {}: {}", symbol, e)))
    }

    pub fn update_quote(&self, quote_update: QuoteUpdate) -> Result<()> {
        self.repository.update_quote(quote_update)
    }

    pub fn delete_quote(&self, quote_id: &str) -> Result<()> {
        self.repository.delete_quote(quote_id)
    }

    pub fn get_asset_currencies(&self) -> Result<HashMap<String, String>> {
        self.repository.get_asset_currencies()
    }

    pub async fn sync_quotes(&self, quote_requests: &[QuoteRequest]) -> Result<()> {
        info!("Syncing quotes for {} symbols...", quote_requests.len());
        let end_date = SystemTime::now();

        // Group requests by data source
        let (manual_requests, public_requests): (Vec<_>, Vec<_>) = quote_requests
            .iter()
            .cloned()
            .partition(|req| req.data_source == DataSource::Manual);

        let mut all_quotes = Vec::with_capacity(quote_requests.len() * 100); // Pre-allocate space
        let mut failed_requests = Vec::new();

        // Process manual quotes sequentially since they need database access
        for request in manual_requests {
            match self.sync_manual_quotes(&request).await {
                Ok(quotes) => all_quotes.extend(quotes),
                Err(e) => {
                    error!("Failed to sync manual quotes for symbol {}: {}", request.symbol, e);
                    failed_requests.push((request.symbol, e));
                }
            }
        }

        // Extract symbols for public requests
        let public_symbols: Vec<String> = public_requests.iter().map(|req| req.symbol.clone()).collect();

        // Fetch all public quotes in parallel if there are any
        if !public_symbols.is_empty() {
            // Get the start date for fetching (using the first symbol as reference)
            let start_date = match self.repository.get_last_quote_date(&public_symbols[0])? {
                Some(last_sync_date) => {
                    Utc.from_utc_datetime(&(last_sync_date - Duration::days(1))).into()
                }
                None => {
                    let five_years_ago = Utc::now().naive_utc() - Duration::days(DEFAULT_HISTORY_DAYS);
                    Utc.from_utc_datetime(&five_years_ago).into()
                }
            };

            // Use Yahoo provider for bulk history
            match self.provider_registry.get_provider(DataSource::Yahoo)
                .get_stock_history_bulk(&public_symbols, start_date, end_date)
                .await
            {
                Ok(quotes) => all_quotes.extend(quotes),
                Err(e) => {
                    error!("Failed to sync public quotes batch: {}", e);
                    return Err(MarketDataError::ProviderError(e.to_string()));
                }
            }
        }

        // Insert all successfully fetched quotes in batches with proper error handling
        if !all_quotes.is_empty() {
            // Sort quotes to prevent deadlocks
            all_quotes.sort_by(|a, b| {
                a.symbol
                    .cmp(&b.symbol)
                    .then(a.date.cmp(&b.date))
                    .then(a.data_source.as_str().cmp(b.data_source.as_str()))
            });

            // Process in smaller batches to prevent memory issues
            for chunk in all_quotes.chunks(DEFAULT_QUOTE_BATCH_SIZE) {
                match self.repository.insert_quotes(chunk) {
                    Ok(_) => debug!("Successfully inserted {} quotes", chunk.len()),
                    Err(e) => {
                        error!("Failed to insert quotes batch: {}", e);
                        // Don't fail the entire sync for a single batch failure
                        failed_requests.push((chunk[0].symbol.clone(), e));
                    }
                }
            }
        }

        // If we had any failures, return them as part of the error message
        if !failed_requests.is_empty() {
            return Err(MarketDataError::ProviderError(format!(
                "Sync completed with errors for the following symbols: {:?}",
                failed_requests
            )));
        }

        Ok(())
    }

    async fn sync_manual_quotes(&self, request: &QuoteRequest) -> Result<Vec<Quote>> {
        debug!("Syncing manual quotes for symbol {}", request.symbol);

        // Load existing manual quotes for the symbol
        let mut manual_quotes = self.repository.get_quotes_by_source(&request.symbol, DATA_SOURCE_MANUAL)?;

        if manual_quotes.is_empty() {
            debug!("No manual quotes found for symbol {}", request.symbol);
            return Ok(Vec::new());
        }

        // Sort quotes by date
        manual_quotes.sort_by(|a, b| a.date.cmp(&b.date));

        let today = Utc::now().naive_utc().date();
        let first_quote_date = manual_quotes[0].date.date();
        let days_between = today.signed_duration_since(first_quote_date).num_days() as usize + 1;
        let mut quotes = Vec::with_capacity(days_between);

        // Create an iterator over quote dates and prices
        let mut quote_changes: Vec<(NaiveDate, f64)> = vec![(first_quote_date, manual_quotes[0].close)];
        quote_changes.push((today, manual_quotes.last().unwrap().close));

        // Pop the first manual quote since we've already used it for the initial price
        let mut remaining_quotes = manual_quotes;
        remaining_quotes.remove(0); // Remove the first quote since we used it for the initial price

        // Generate quotes for each day between the first quote and today
        for window in quote_changes.windows(2) {
            let (current_date, mut current_price) = window[0];
            let next_date = window[1].0;
            let mut date = current_date;

            while date <= next_date {
                // Check if we have a manual quote for this date
                if let Some(pos) = remaining_quotes.iter().position(|q| q.date.date() == date) {
                    let manual_quote = remaining_quotes.remove(pos);
                    quotes.push(manual_quote.clone());
                    current_price = manual_quote.close;
                } else {
                    // No manual quote for this date, create one with the current price
                    quotes.push(Quote {
                        id: format!("{}_{}", date.format("%Y%m%d"), request.symbol),
                        symbol: request.symbol.clone(),
                        date: date.and_hms_opt(16, 0, 0).unwrap(),
                        open: current_price,
                        high: current_price,
                        low: current_price,
                        close: current_price,
                        adjclose: current_price,
                        volume: 0.0, // Set to 0 since volume isn't meaningful for manual quotes
                        data_source: DataSource::Manual,
                        created_at: Utc::now().naive_utc(),
                        currency: Some("USD".to_string()), // Default to USD for manual quotes
                    });
                }
                date += Duration::days(1);
            }
        }

        debug!(
            "Generated {} quotes for symbol {}",
            quotes.len(),
            request.symbol
        );
        Ok(quotes)
    }

    pub fn add_quote(&self, quote: &Quote) -> Result<Quote> {
        self.repository.insert_quote(quote)
    }

    pub fn get_all_quote_requests(&self) -> Result<Vec<QuoteRequest>> {
        self.repository.get_all_quote_requests()
    }

    pub async fn sync_all_quotes(&self) -> Result<()> {
        info!("Starting sync for all quotes...");
        
        // Get all quote requests from the repository
        let quote_requests = self.get_all_quote_requests()?;
        
        if quote_requests.is_empty() {
            info!("No assets found to sync quotes for");
            return Ok(());
        }
        
        info!("Found {} assets to sync quotes for", quote_requests.len());
        
        // Use the existing sync_quotes function to perform the sync
        self.sync_quotes(&quote_requests).await
    }
}
