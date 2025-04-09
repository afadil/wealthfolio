use async_trait::async_trait;
use chrono::{Duration, NaiveDate, TimeZone, Utc};
use log::{debug, error, info};
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;

use super::market_data_constants::*;
use super::market_data_errors::MarketDataError;
use super::market_data_model::{Quote, QuoteRequest, QuoteSummary, LatestQuotePair};
use super::market_data_traits::{MarketDataRepositoryTrait, MarketDataServiceTrait};
use super::providers::models::AssetProfile;
use crate::errors::Result;
use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::ProviderRegistry;

pub struct MarketDataService {
    provider_registry: Arc<ProviderRegistry>,
    repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
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
        self.repository.get_historical_quotes_for_symbol(symbol)
    }

    fn add_quote(&self, quote: &Quote) -> Result<Quote> {
        self.repository.save_quote(quote)
    }

    fn update_quote(&self, quote: Quote) -> Result<Quote> {
        self.repository.save_quote(&quote)
    }

    fn delete_quote(&self, quote_id: &str) -> Result<()> {
        self.repository.delete_quote(quote_id)
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

    async fn sync_quotes(&self, quote_requests: &[QuoteRequest], refetch_all: bool) -> Result<()> {
        info!(
            "Syncing quotes for {} symbols..., with refetch all: {}",
            quote_requests.len(),
            refetch_all
        );
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
                    error!(
                        "Failed to sync manual quotes for symbol {}: {}",
                        request.symbol, e
                    );
                    failed_requests.push((request.symbol.clone(), e));
                }
            }
        }

        // Extract symbols for public requests
        let public_symbols_with_currencies: Vec<(String, String)> = public_requests
            .iter()
            .map(|req| (req.symbol.clone(), req.currency.clone()))
            .collect();

        // Fetch all public quotes in parallel if there are any
        if !public_symbols_with_currencies.is_empty() {
            // Get the start date for fetching based on refetch_all parameter
            let start_date = if refetch_all {
                let default_history_days = DEFAULT_HISTORY_DAYS;
                Utc.from_utc_datetime(
                    &(Utc::now().naive_utc() - Duration::days(default_history_days)),
                )
                .into()
            } else {
                // Extract just the symbols for querying latest quotes
                let symbols: Vec<String> = public_symbols_with_currencies
                    .iter()
                    .map(|(sym, _)| sym.clone())
                    .collect();

                // Get the latest quotes for all symbols
                match self.repository.get_latest_quotes_for_symbols(&symbols) {
                    Ok(quotes_map) => {
                        if quotes_map.is_empty() {
                            // No quotes found for any symbol, use default history
                            let default_history_days = DEFAULT_HISTORY_DAYS;
                            Utc.from_utc_datetime(
                                &(Utc::now().naive_utc() - Duration::days(default_history_days)),
                            )
                            .into()
                        } else {
                            // Find the minimum date among all latest quotes
                            let min_date = quotes_map
                                .values()
                                .map(|quote| quote.date)
                                .min()
                                .unwrap_or_else(|| Utc::now().naive_utc());

                            // Subtract one day to ensure overlap
                            Utc.from_utc_datetime(&(min_date - Duration::days(1)))
                                .into()
                        }
                    }
                    Err(_) => {
                        // Error getting latest quotes, use default history
                        let default_history_days = DEFAULT_HISTORY_DAYS;
                        Utc.from_utc_datetime(
                            &(Utc::now().naive_utc() - Duration::days(default_history_days)),
                        )
                        .into()
                    }
                }
            };

            // Use Yahoo provider for bulk history
            match self
                .provider_registry
                .get_provider(DataSource::Yahoo)
                .get_historical_quotes_bulk(&public_symbols_with_currencies, start_date, end_date)
                .await
            {
                Ok(quotes) => all_quotes.extend(quotes),
                Err(e) => {
                    error!("Failed to sync public quotes batch: {}", e);
                    return Err(MarketDataError::ProviderError(e.to_string()).into());
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

            // Save all quotes in a single transaction with internal batching
            self.repository.save_quotes(&all_quotes)?;
        }

        // If we had any failures, return them as part of the error message
        if !failed_requests.is_empty() {
            return Err(MarketDataError::ProviderError(format!(
                "Sync completed with errors for the following symbols: {:?}",
                failed_requests
            ))
            .into());
        }

        Ok(())
    }
}

impl MarketDataService {
    pub async fn new(repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>) -> Result<Self> {
        let provider_registry = Arc::new(ProviderRegistry::new().await?);

        Ok(Self {
            provider_registry,
            repository,
        })
    }

    async fn sync_manual_quotes(&self, request: &QuoteRequest) -> Result<Vec<Quote>> {
        debug!("Syncing manual quotes for symbol {}", request.symbol);

        // Load existing manual quotes for the symbol
        let mut manual_quotes = self
            .repository
            .get_quotes_by_source(&request.symbol, DATA_SOURCE_MANUAL)?;

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
        let mut quote_changes: Vec<(NaiveDate, Decimal)> =
            vec![(first_quote_date, manual_quotes[0].close.clone())];
        quote_changes.push((today, manual_quotes.last().unwrap().close.clone()));

        // Pop the first manual quote since we've already used it for the initial price
        let mut remaining_quotes = manual_quotes;
        remaining_quotes.remove(0); // Remove the first quote since we used it for the initial price

        // Generate quotes for each day between the first quote and today
        for window in quote_changes.windows(2) {
            let (current_date, mut current_price) = (window[0].0, window[0].1.clone());
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
                        open: current_price.clone(),
                        high: current_price.clone(),
                        low: current_price.clone(),
                        close: current_price.clone(),
                        adjclose: current_price.clone(),
                        volume: Decimal::ZERO,
                        data_source: DataSource::Manual,
                        created_at: Utc::now().naive_utc(),
                        currency: request.currency.clone(),
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
}
