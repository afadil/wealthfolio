use async_trait::async_trait;
use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use log::{debug, error};
use rust_decimal::Decimal;
use std::collections::btree_map::Entry as BTreeEntry;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::RwLock;

use super::market_data_constants::*;
use super::market_data_model::{
    ImportValidationStatus, LatestQuotePair, MarketDataProviderInfo, MarketDataProviderSetting,
    Quote, QuoteImport, QuoteRequest, QuoteSummary, UpdateMarketDataProviderSetting,
};
use super::market_data_traits::{MarketDataRepositoryTrait, MarketDataServiceTrait};
use super::providers::models::AssetProfile;
use crate::assets::assets_constants::CASH_ASSET_TYPE;
use crate::assets::assets_traits::AssetRepositoryTrait;
use crate::errors::Result;
use crate::market_data::providers::ProviderRegistry;
use crate::utils::time_utils;

const QUOTE_LOOKBACK_DAYS: i64 = 7;

#[derive(Debug)]
struct SymbolSyncPlanItem {
    symbol: String,
    currency: String,
    start: SystemTime,
}

pub struct MarketDataService {
    provider_registry: Arc<RwLock<ProviderRegistry>>,
    repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
    asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>,
}

#[async_trait]
impl MarketDataServiceTrait for MarketDataService {
    async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>> {
        self.provider_registry
            .read()
            .await
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
                .or_default()
                .push((quote_date, quote));
        }

        for (_symbol, symbol_quotes_tuples) in quotes_map.iter_mut() {
            symbol_quotes_tuples.sort_by(|a, b| b.0.cmp(&a.0));
        }

        Ok(quotes_map)
    }

    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile> {
        self.provider_registry
            .read()
            .await
            .get_asset_profile(symbol)
            .await
            .map_err(|e| e.into())
    }

    fn get_historical_quotes_for_symbol(&self, symbol: &str) -> Result<Vec<Quote>> {
        let mut quotes = self.repository.get_historical_quotes_for_symbol(symbol)?;
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

        self.provider_registry
            .read()
            .await
            .historical_quotes(symbol, start_time, end_time, "USD".to_string())
            .await
            .map_err(|e| e.into())
    }

    async fn sync_market_data(&self) -> Result<((), Vec<(String, String)>)> {
        debug!("Syncing market data.");
        let assets = self.asset_repository.list()?;
        let quote_requests: Vec<_> = assets
            .iter()
            .filter(|asset| {
                asset.asset_type.as_deref() != Some(CASH_ASSET_TYPE)
                    && asset.data_source != DATA_SOURCE_MANUAL
            })
            .map(|asset| QuoteRequest {
                symbol: asset.symbol.clone(),
                data_source: asset.data_source.as_str().into(),
                currency: asset.currency.clone(),
            })
            .collect();

        self.process_market_data_sync(quote_requests, false).await
    }

    async fn resync_market_data(
        &self,
        symbols: Option<Vec<String>>,
    ) -> Result<((), Vec<(String, String)>)> {
        debug!("Resyncing market data. Symbols: {:?}", symbols);
        let assets = match symbols {
            Some(syms) if !syms.is_empty() => self.asset_repository.list_by_symbols(&syms)?,
            _ => {
                debug!("No symbols provided or empty list. Fetching all assets.");
                self.asset_repository.list()?
            }
        };

        let quote_requests: Vec<_> = assets
            .iter()
            .filter(|asset| {
                asset.asset_type.as_deref() != Some(CASH_ASSET_TYPE)
                    && asset.data_source != DATA_SOURCE_MANUAL
            })
            .map(|asset| QuoteRequest {
                symbol: asset.symbol.clone(),
                data_source: asset.data_source.as_str().into(),
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

        if symbols.is_empty() {
            return Ok(Vec::new());
        }

        let manual_quotes = self
            .repository
            .get_all_historical_quotes_for_symbols_by_source(symbols, DATA_SOURCE_MANUAL)?;
        let manual_symbols: HashSet<String> =
            manual_quotes.iter().map(|q| q.symbol.clone()).collect();
        let mut all_fetched_quotes = manual_quotes;
        let other_symbols: HashSet<String> = symbols.difference(&manual_symbols).cloned().collect();

        if !other_symbols.is_empty() {
            let lookback_start_date = start_date - Duration::days(QUOTE_LOOKBACK_DAYS);
            let quotes = self.repository.get_historical_quotes_for_symbols_in_range(
                &other_symbols,
                lookback_start_date,
                end_date,
            )?;
            all_fetched_quotes.extend(quotes);
        }

        let filled_quotes =
            self.fill_missing_quotes(&all_fetched_quotes, symbols, start_date, end_date);

        Ok(filled_quotes)
    }

    async fn get_daily_quotes(
        &self,
        asset_ids: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>> {
        if asset_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let quotes_vec = self
            .repository
            .get_historical_quotes_for_symbols_in_range(asset_ids, start_date, end_date)?;

        let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();
        for quote in quotes_vec {
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
        let known_providers = vec![(DATA_SOURCE_YAHOO, "Yahoo Finance", "yahoo-finance.png")];

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

    async fn get_market_data_providers_settings(&self) -> Result<Vec<MarketDataProviderSetting>> {
        debug!("Fetching market data providers settings");
        self.repository.get_all_providers()
    }

    async fn update_market_data_provider_settings(
        &self,
        provider_id: String,
        priority: i32,
        enabled: bool,
    ) -> Result<MarketDataProviderSetting> {
        debug!(
            "Updating market data provider settings for provider id: {}",
            provider_id
        );
        let changes = UpdateMarketDataProviderSetting {
            priority: Some(priority),
            enabled: Some(enabled),
        };
        let updated_setting = self
            .repository
            .update_provider_settings(provider_id, changes)
            .await?;

        // Refresh the provider registry with the updated settings
        debug!("Refreshing provider registry after settings update");
        self.refresh_provider_registry().await?;

        Ok(updated_setting)
    }

    async fn import_quotes_from_csv(
        &self,
        quotes: Vec<QuoteImport>,
        overwrite: bool,
    ) -> Result<Vec<QuoteImport>> {
        debug!("🚀 SERVICE: import_quotes_from_csv called");
        debug!(
            "📊 Processing {} quotes, overwrite: {}",
            quotes.len(),
            overwrite
        );

        let mut results = Vec::new();
        let mut quotes_to_import = Vec::new();

        debug!("🔍 Starting quote validation and duplicate checking...");
        for (index, mut quote) in quotes.into_iter().enumerate() {
            debug!(
                "📋 Processing quote {}/{}: symbol={}, date={}",
                index + 1,
                results.len() + quotes_to_import.len() + 1,
                quote.symbol,
                quote.date
            );

            // Check if quote already exists
            let exists = self.repository.quote_exists(&quote.symbol, &quote.date)?;
            debug!("🔍 Quote exists check: {}", exists);

            if exists {
                if overwrite {
                    debug!("🔄 Quote exists but overwrite=true, will import");
                    quote.validation_status = ImportValidationStatus::Valid;
                    quotes_to_import.push(quote.clone());
                } else {
                    debug!("⚠️ Quote exists and overwrite=false, skipping");
                    quote.validation_status = ImportValidationStatus::Warning(
                        "Quote already exists, skipping".to_string(),
                    );
                }
            } else {
                debug!("✨ New quote, validating...");
                quote.validation_status = self.validate_quote_data(&quote);
                debug!("📋 Validation result: {:?}", quote.validation_status);
                if matches!(quote.validation_status, ImportValidationStatus::Valid) {
                    quotes_to_import.push(quote.clone());
                }
            }
            results.push(quote);
        }

        debug!(
            "📊 Validation complete: {} total, {} to import",
            results.len(),
            quotes_to_import.len()
        );

        // Convert to Quote structs and import
        debug!("🔄 Converting import quotes to database quotes...");
        let quotes_for_db: Vec<Quote> = quotes_to_import
            .iter()
            .enumerate()
            .filter_map(|(index, import_quote)| {
                match self.convert_import_quote_to_quote(import_quote) {
                    Ok(quote) => {
                        debug!("✅ Converted quote {}: {}", index + 1, quote.symbol);
                        Some(quote)
                    }
                    Err(e) => {
                        error!("❌ Failed to convert quote {}: {}", index + 1, e);
                        None
                    }
                }
            })
            .collect();

        debug!(
            "📦 Successfully converted {} quotes for database insertion",
            quotes_for_db.len()
        );

        if !quotes_for_db.is_empty() {
            debug!(
                "💾 Calling repository.bulk_upsert_quotes with {} quotes",
                quotes_for_db.len()
            );
            debug!(
                "🎯 Sample quote for DB: id={}, symbol={}, timestamp={}, data_source={:?}",
                quotes_for_db[0].id,
                quotes_for_db[0].symbol,
                quotes_for_db[0].timestamp,
                quotes_for_db[0].data_source
            );

            match self.repository.bulk_upsert_quotes(quotes_for_db).await {
                Ok(count) => {
                    debug!(
                        "✅ Successfully inserted/updated {} quotes in database",
                        count
                    );
                }
                Err(e) => {
                    error!("❌ Database insertion failed: {}", e);
                    return Err(e);
                }
            }
        } else {
            debug!("⚠️ No quotes to import after conversion");
        }

        debug!("✅ SERVICE: import_quotes_from_csv completed successfully");
        Ok(results)
    }

    async fn bulk_upsert_quotes(&self, quotes: Vec<Quote>) -> Result<usize> {
        self.repository.bulk_upsert_quotes(quotes).await
    }
}

impl MarketDataService {
    pub async fn new(
        repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
        asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>,
    ) -> Result<Self> {
        let provider_settings = repository.get_all_providers()?;
        // Be resilient on platforms where certain providers cannot initialize (e.g., mobile TLS differences).
        // Fall back to an empty registry (Manual provider only) instead of aborting app initialization.
        let registry = match ProviderRegistry::new(provider_settings).await {
            Ok(reg) => reg,
            Err(e) => {
                log::warn!(
                    "Provider registry initialization failed: {}. Falling back to empty registry.",
                    e
                );
                // Safe fallback: no external providers enabled
                ProviderRegistry::new(Vec::new()).await?
            }
        };
        let provider_registry = Arc::new(RwLock::new(registry));

        Ok(Self {
            provider_registry,
            repository,
            asset_repository,
        })
    }

    /// Refreshes the provider registry with the latest settings from the database
    async fn refresh_provider_registry(&self) -> Result<()> {
        debug!("Refreshing provider registry with latest settings");
        let provider_settings = self.repository.get_all_providers()?;
        let new_registry = ProviderRegistry::new(provider_settings).await?;

        // Replace the registry with the new one
        *self.provider_registry.write().await = new_registry;

        debug!("Provider registry refreshed successfully");
        Ok(())
    }

    fn fill_missing_quotes(
        &self,
        quotes: &[Quote],
        required_symbols: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Vec<Quote> {
        if required_symbols.is_empty() {
            return Vec::new();
        }

        let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();
        for quote in quotes {
            quotes_by_date
                .entry(quote.timestamp.date_naive())
                .or_default()
                .insert(quote.symbol.clone(), quote.clone());
        }

        let mut all_filled_quotes = Vec::new();
        let mut last_known_quotes: HashMap<String, Quote> = HashMap::new();
        let mut current_date = start_date.pred_opt().unwrap_or(start_date);
        let mut initial_lookback = 0;
        while initial_lookback < 365 * 10 {
            if let Some(daily_quotes) = quotes_by_date.get(&current_date) {
                for (symbol, quote) in daily_quotes {
                    if required_symbols.contains(symbol) && !last_known_quotes.contains_key(symbol)
                    {
                        last_known_quotes.insert(symbol.clone(), quote.clone());
                    }
                }
            }
            if last_known_quotes.len() == required_symbols.len() {
                break;
            }
            current_date = current_date.pred_opt().unwrap_or(current_date);
            if current_date == start_date.pred_opt().unwrap_or(start_date) {
                break;
            }
            initial_lookback += 1;
        }

        for current_date in time_utils::get_days_between(start_date, end_date) {
            if let Some(daily_quotes) = quotes_by_date.get(&current_date) {
                for (symbol, quote) in daily_quotes {
                    if required_symbols.contains(symbol) {
                        last_known_quotes.insert(symbol.clone(), quote.clone());
                    }
                }
            }

            for symbol in required_symbols {
                if let Some(last_quote) = last_known_quotes.get(symbol) {
                    let mut quote_for_today = last_quote.clone();
                    quote_for_today.timestamp =
                        Utc.from_utc_datetime(&current_date.and_hms_opt(12, 0, 0).unwrap());
                    all_filled_quotes.push(quote_for_today);
                } else {
                    debug!(
                        "No quote available for symbol '{}' on or before date {}",
                        symbol, current_date
                    );
                }
            }
        }

        all_filled_quotes
    }

    async fn process_market_data_sync(
        &self,
        quote_requests: Vec<QuoteRequest>,
        refetch_all: bool,
    ) -> Result<((), Vec<(String, String)>)> {
        if quote_requests.is_empty() {
            debug!("No syncable assets found matching the criteria. Skipping sync.");
            return Ok(((), Vec::new()));
        }

        let current_local_naive_date = Local::now().date_naive();
        let end_date_naive_local = current_local_naive_date.and_hms_opt(23, 59, 59).unwrap();
        let end_date: SystemTime = Utc
            .from_utc_datetime(
                &end_date_naive_local
                    .and_local_timezone(Local)
                    .unwrap()
                    .naive_utc(),
            )
            .into();

        let public_requests = quote_requests;
        let mut all_quotes = Vec::new();
        let mut failed_syncs = Vec::new();
        let symbols_with_currencies: Vec<(String, String)> = public_requests
            .iter()
            .map(|req| (req.symbol.clone(), req.currency.clone()))
            .collect();

        let sync_plan =
            self.calculate_sync_plan(refetch_all, &symbols_with_currencies, end_date)?;

        if sync_plan.is_empty() {
            debug!("All tracked symbols are already up to date; nothing to fetch from providers.");
        } else {
            let mut grouped_requests: BTreeMap<NaiveDateTime, (SystemTime, Vec<(String, String)>)> =
                BTreeMap::new();

            for plan in sync_plan {
                let SymbolSyncPlanItem {
                    symbol,
                    currency,
                    start,
                } = plan;
                let start_key = DateTime::<Utc>::from(start).naive_utc();
                match grouped_requests.entry(start_key) {
                    BTreeEntry::Occupied(mut entry) => entry.get_mut().1.push((symbol, currency)),
                    BTreeEntry::Vacant(entry) => {
                        entry.insert((start, vec![(symbol, currency)]));
                    }
                }
            }

            for (_, (start_time, group_symbols)) in grouped_requests.into_iter() {
                if group_symbols.is_empty() {
                    continue;
                }

                if start_time >= end_date {
                    debug!(
                        "Skipping sync for symbols {:?} because start time {:?} >= end time {:?}.",
                        group_symbols
                            .iter()
                            .map(|(symbol, _)| symbol.clone())
                            .collect::<Vec<_>>(),
                        DateTime::<Utc>::from(start_time),
                        DateTime::<Utc>::from(end_date),
                    );
                    continue;
                }

                let symbol_names: Vec<String> = group_symbols
                    .iter()
                    .map(|(symbol, _)| symbol.clone())
                    .collect();

                match self
                    .provider_registry
                    .read()
                    .await
                    .historical_quotes_bulk(&group_symbols, start_time, end_date)
                    .await
                {
                    Ok((quotes, provider_failures)) => {
                        debug!(
                            "Fetched {} quotes for symbols {:?} (start {}).",
                            quotes.len(),
                            symbol_names,
                            DateTime::<Utc>::from(start_time).format("%Y-%m-%d")
                        );
                        all_quotes.extend(quotes);
                        failed_syncs.extend(provider_failures);
                    }
                    Err(e) => {
                        error!(
                            "Failed to sync quotes for symbols {:?} starting {}: {}",
                            symbol_names,
                            DateTime::<Utc>::from(start_time).format("%Y-%m-%d"),
                            e
                        );
                        failed_syncs.extend(
                            symbol_names
                                .into_iter()
                                .map(|symbol| (symbol, e.to_string())),
                        );
                    }
                }
            }
        }

        if !all_quotes.is_empty() {
            debug!(
                "Attempting to save {} filled quotes to the repository.",
                all_quotes.len()
            );
            all_quotes.sort_by(|a, b| {
                a.symbol
                    .cmp(&b.symbol)
                    .then_with(|| a.timestamp.cmp(&b.timestamp))
                    .then_with(|| a.data_source.as_str().cmp(b.data_source.as_str()))
            });
            if let Err(e) = self.repository.save_quotes(&all_quotes).await {
                error!("Failed to save synced quotes to repository: {}", e);
                failed_syncs.push(("repository_save".to_string(), e.to_string()));
            } else {
                debug!("Successfully saved {} filled quotes.", all_quotes.len());
            }
        }

        Ok(((), failed_syncs))
    }

    fn calculate_sync_plan(
        &self,
        refetch_all: bool,
        symbols_with_currencies: &[(String, String)],
        end_time: SystemTime,
    ) -> Result<Vec<SymbolSyncPlanItem>> {
        if symbols_with_currencies.is_empty() {
            return Ok(Vec::new());
        }

        let end_date = DateTime::<Utc>::from(end_time).naive_utc().date();
        let default_history_days = DEFAULT_HISTORY_DAYS;
        let default_start_date = end_date - Duration::days(default_history_days);

        if refetch_all {
            let default_start_time: SystemTime = Utc
                .from_utc_datetime(&default_start_date.and_hms_opt(0, 0, 0).unwrap())
                .into();

            let plan = symbols_with_currencies
                .iter()
                .map(|(symbol, currency)| SymbolSyncPlanItem {
                    symbol: symbol.clone(),
                    currency: currency.clone(),
                    start: default_start_time,
                })
                .collect();
            return Ok(plan);
        }

        let symbols_for_latest: Vec<String> = symbols_with_currencies
            .iter()
            .map(|(sym, _)| sym.clone())
            .collect();

        let quotes_map = match self
            .repository
            .get_latest_quotes_for_symbols(&symbols_for_latest)
        {
            Ok(map) => map,
            Err(e) => {
                error!(
                    "Failed to get latest quotes for symbols {:?}: {}. Falling back to default history window.",
                    symbols_for_latest, e
                );
                HashMap::new()
            }
        };

        let mut plan = Vec::new();

        for (symbol, currency) in symbols_with_currencies {
            let start_date = match quotes_map.get(symbol) {
                Some(latest_quote) => {
                    let last_date = latest_quote.timestamp.date_naive();
                    if last_date >= end_date {
                        debug!(
                            "Symbol '{}' already has data through {} (end {}). Skipping fetch.",
                            symbol, last_date, end_date
                        );
                        continue;
                    }
                    last_date.succ_opt().unwrap_or(last_date)
                }
                None => default_start_date,
            };

            if start_date > end_date {
                debug!(
                    "Symbol '{}' is already synced through {} (end {}). Skipping fetch.",
                    symbol, start_date, end_date
                );
                continue;
            }

            let start_time: SystemTime = Utc
                .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap())
                .into();

            plan.push(SymbolSyncPlanItem {
                symbol: symbol.clone(),
                currency: currency.clone(),
                start: start_time,
            });
        }

        Ok(plan)
    }

    fn validate_quote_data(&self, quote: &QuoteImport) -> ImportValidationStatus {
        // Validate symbol
        if quote.symbol.trim().is_empty() {
            return ImportValidationStatus::Error("Symbol is required".to_string());
        }

        // Validate date format
        if let Err(_) = chrono::NaiveDate::parse_from_str(&quote.date, "%Y-%m-%d") {
            return ImportValidationStatus::Error(
                "Invalid date format. Expected YYYY-MM-DD".to_string(),
            );
        }

        // Validate close price (required)
        if quote.close <= Decimal::ZERO {
            return ImportValidationStatus::Error("Close price must be greater than 0".to_string());
        }

        // Validate OHLC logic
        if let (Some(open), Some(high), Some(low)) = (quote.open, quote.high, quote.low) {
            if high < low {
                return ImportValidationStatus::Error(
                    "High price cannot be less than low price".to_string(),
                );
            }
            if open > high || open < low {
                return ImportValidationStatus::Warning(
                    "Open price is outside high-low range".to_string(),
                );
            }
            if quote.close > high || quote.close < low {
                return ImportValidationStatus::Warning(
                    "Close price is outside high-low range".to_string(),
                );
            }
        }

        ImportValidationStatus::Valid
    }

    fn convert_import_quote_to_quote(&self, import_quote: &QuoteImport) -> Result<Quote> {
        use super::market_data_model::DataSource;

        let timestamp = chrono::NaiveDate::parse_from_str(&import_quote.date, "%Y-%m-%d")?
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_local_timezone(Utc)
            .unwrap();

        Ok(Quote {
            id: format!("{}_{}", import_quote.symbol, import_quote.date),
            symbol: import_quote.symbol.clone(),
            timestamp,
            open: import_quote.open.unwrap_or(import_quote.close),
            high: import_quote.high.unwrap_or(import_quote.close),
            low: import_quote.low.unwrap_or(import_quote.close),
            close: import_quote.close,
            adjclose: import_quote.close, // Assume no adjustment for imported data
            volume: import_quote.volume.unwrap_or(Decimal::ZERO),
            currency: import_quote.currency.clone(),
            data_source: DataSource::Manual,
            created_at: Utc::now(),
        })
    }
}
