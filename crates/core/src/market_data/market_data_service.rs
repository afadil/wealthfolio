use async_trait::async_trait;
use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use log::{debug, error, info, warn};
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
use super::quote_sync_state_model::{QuoteSyncState, SyncCategory, SymbolSyncPlan};
use super::QuoteSyncStateRepositoryTrait;
use crate::accounts::AccountRepositoryTrait;
use crate::activities::ActivityRepositoryTrait;
use crate::assets::{AssetRepositoryTrait, CASH_ASSET_TYPE, FOREX_ASSET_TYPE};
use crate::errors::Result;
use crate::market_data::providers::ProviderRegistry;
use crate::portfolio::snapshot::SnapshotRepositoryTrait;
use crate::secrets::SecretStore;
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
    secret_store: Arc<dyn SecretStore>,
    // Sync state dependencies
    sync_state_repository: Arc<dyn QuoteSyncStateRepositoryTrait>,
    snapshot_repository: Arc<dyn SnapshotRepositoryTrait>,
    activity_repository: Arc<dyn ActivityRepositoryTrait>,
    account_repository: Arc<dyn AccountRepositoryTrait>,
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
        let provider_symbol = self
            .asset_repository
            .get_by_id(symbol)
            .ok()
            .and_then(|asset| asset.quote_symbol)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| symbol.to_string());

        debug!(
            "Getting symbol history for {} from {} to {}",
            provider_symbol, start_date, end_date
        );
        let start_time: SystemTime = Utc
            .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap())
            .into();
        let end_time: SystemTime = Utc
            .from_utc_datetime(&end_date.and_hms_opt(23, 59, 59).unwrap())
            .into();

        let mut quotes = self
            .provider_registry
            .read()
            .await
            .historical_quotes(&provider_symbol, start_time, end_time, "USD".to_string())
            .await?;

        if provider_symbol != symbol {
            for quote in quotes.iter_mut() {
                quote.symbol = symbol.to_string();
                quote.id = format!("{}_{}", quote.timestamp.format("%Y%m%d"), symbol);
            }
        }

        Ok(quotes)
    }

    async fn sync_market_data(&self) -> Result<((), Vec<(String, String)>)> {
        debug!("Syncing market data with optimized sync.");

        // First, refresh the sync state from holdings and activities
        if let Err(e) = self.refresh_sync_state().await {
            warn!(
                "Failed to refresh quote sync state: {}. Falling back to legacy sync.",
                e
            );
            return self.legacy_sync_market_data().await;
        }

        // Get the optimized sync plan
        match self.get_sync_plan() {
            Ok(sync_plans) => {
                if sync_plans.is_empty() {
                    info!("No symbols need syncing based on optimized plan");
                    return Ok(((), Vec::new()));
                }

                info!(
                    "Using optimized sync plan: {} symbols to sync",
                    sync_plans.len()
                );
                for plan in &sync_plans {
                    debug!(
                        "Sync plan for {}: {:?} from {} to {}",
                        plan.symbol, plan.category, plan.start_date, plan.end_date
                    );
                }
                self.sync_with_plan_internal(sync_plans).await
            }
            Err(e) => {
                warn!(
                    "Failed to get sync plan: {}. Falling back to legacy sync.",
                    e
                );
                self.legacy_sync_market_data().await
            }
        }
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
                quote_symbol: asset.quote_symbol.clone(),
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

    // --- Quote Sync State Methods ---

    async fn refresh_sync_state(&self) -> Result<()> {
        info!("Refreshing quote sync state...");

        let sync_states = self.build_sync_states().await?;

        if !sync_states.is_empty() {
            let count = self
                .sync_state_repository
                .upsert_batch(&sync_states)
                .await?;
            info!("Updated {} quote sync states", count);
        }

        Ok(())
    }

    fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>> {
        let states = self
            .sync_state_repository
            .get_symbols_needing_sync(CLOSED_POSITION_GRACE_PERIOD_DAYS)?;
        let today = Utc::now().date_naive();

        // Get asset info for symbol mappings and currencies
        let assets = self.asset_repository.list()?;
        let asset_info: HashMap<String, (Option<String>, String)> = assets
            .iter()
            .map(|a| {
                (
                    a.symbol.clone(),
                    (a.quote_symbol.clone(), a.currency.clone()),
                )
            })
            .collect();

        let mut plans = Vec::new();

        for state in states {
            let category = state.determine_category(CLOSED_POSITION_GRACE_PERIOD_DAYS);

            // Skip closed positions
            if matches!(category, SyncCategory::Closed) {
                continue;
            }

            let (quote_symbol, currency) = asset_info
                .get(&state.symbol)
                .cloned()
                .unwrap_or((None, "USD".to_string()));

            let (start_date, end_date) = match &category {
                SyncCategory::Active => {
                    // Sync from last quote date (or first activity - buffer) to today
                    let start = state
                        .last_quote_date
                        .map(|d| d.succ_opt().unwrap_or(d))
                        .or_else(|| {
                            state
                                .first_activity_date
                                .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                        })
                        .unwrap_or_else(|| today - Duration::days(QUOTE_HISTORY_BUFFER_DAYS));
                    (start, today)
                }
                SyncCategory::New => {
                    // New symbol - fetch from first activity - buffer to today
                    let start = state
                        .first_activity_date
                        .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                        .unwrap_or_else(|| today - Duration::days(QUOTE_HISTORY_BUFFER_DAYS));
                    (start, today)
                }
                SyncCategory::NeedsBackfill => {
                    // Backfill from first activity - buffer to earliest quote
                    let start = state
                        .first_activity_date
                        .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                        .unwrap_or(today);
                    let end = state.earliest_quote_date.unwrap_or(today);
                    (start, end)
                }
                SyncCategory::RecentlyClosed => {
                    // Continue syncing from last quote to today (within grace period)
                    let start = state
                        .last_quote_date
                        .map(|d| d.succ_opt().unwrap_or(d))
                        .unwrap_or(today);
                    (start, today)
                }
                SyncCategory::Closed => continue, // Already filtered above
            };

            // Skip if start is after end
            if start_date > end_date {
                debug!(
                    "Skipping {} - start date {} is after end date {}",
                    state.symbol, start_date, end_date
                );
                continue;
            }

            plans.push(SymbolSyncPlan {
                symbol: state.symbol.clone(),
                category,
                start_date,
                end_date,
                priority: state.sync_priority,
                data_source: state.data_source.clone(),
                quote_symbol,
                currency,
            });
        }

        // Sort by priority (highest first)
        plans.sort_by(|a, b| b.priority.cmp(&a.priority));

        info!("Generated sync plan with {} symbols to sync", plans.len());

        Ok(plans)
    }

    async fn handle_activity_date_change(
        &self,
        symbol: &str,
        old_date: Option<NaiveDate>,
        new_date: NaiveDate,
    ) -> Result<()> {
        info!(
            "Handling activity date change for {}: {:?} -> {}",
            symbol, old_date, new_date
        );

        // Get or create sync state for this symbol
        let existing = self.sync_state_repository.get_by_symbol(symbol)?;

        if let Some(mut state) = existing {
            // Check if this creates a backfill need
            let needs_backfill = state
                .earliest_quote_date
                .map(|earliest| new_date - Duration::days(QUOTE_HISTORY_BUFFER_DAYS) < earliest)
                .unwrap_or(false);

            if needs_backfill {
                info!(
                    "Activity date change for {} requires backfill (new date {} before earliest quote)",
                    symbol, new_date
                );
                state.sync_priority = SyncCategory::NeedsBackfill.default_priority();
            }

            // Update activity dates
            state.update_activity_dates(Some(new_date), Some(new_date));

            self.sync_state_repository.upsert(&state).await?;
        } else {
            // Symbol not tracked yet - this shouldn't happen normally
            // but handle gracefully
            warn!(
                "Activity date changed for untracked symbol {}. Creating sync state.",
                symbol
            );

            let asset = self.asset_repository.get_by_id(symbol).ok();
            let data_source = asset
                .as_ref()
                .map(|a| a.data_source.clone())
                .unwrap_or_else(|| "YAHOO".to_string());

            let mut state = QuoteSyncState::new(symbol.to_string(), data_source);
            state.first_activity_date = Some(new_date);
            state.last_activity_date = Some(new_date);
            state.sync_priority = SyncCategory::New.default_priority();

            self.sync_state_repository.upsert(&state).await?;
        }

        Ok(())
    }

    async fn handle_new_activity(&self, symbol: &str, activity_date: NaiveDate) -> Result<()> {
        // Skip cash symbols
        if symbol.is_empty() || symbol.starts_with("$CASH") {
            return Ok(());
        }

        info!(
            "Handling new activity for symbol {} on {}",
            symbol, activity_date
        );

        let existing = self.sync_state_repository.get_by_symbol(symbol)?;

        if let Some(mut state) = existing {
            // Check if this activity date is earlier than what we have
            let is_earlier = state
                .first_activity_date
                .map(|first| activity_date < first)
                .unwrap_or(true);

            if is_earlier {
                // Check if we need backfill
                let needs_backfill = state
                    .earliest_quote_date
                    .map(|earliest| {
                        activity_date - Duration::days(QUOTE_HISTORY_BUFFER_DAYS) < earliest
                    })
                    .unwrap_or(false);

                if needs_backfill {
                    info!(
                        "New activity for {} requires backfill (date {} before earliest quote)",
                        symbol, activity_date
                    );
                    state.sync_priority = SyncCategory::NeedsBackfill.default_priority();
                }
            }

            // Update activity dates
            state.update_activity_dates(Some(activity_date), Some(activity_date));

            // Mark as active if it was closed
            if !state.is_active {
                state.mark_active();
            }

            self.sync_state_repository.upsert(&state).await?;
        } else {
            // New symbol - create sync state
            info!("Creating new sync state for symbol {}", symbol);

            let asset = self.asset_repository.get_by_id(symbol).ok();
            let data_source = asset
                .as_ref()
                .map(|a| a.data_source.clone())
                .unwrap_or_else(|| "YAHOO".to_string());

            // Skip manual data source symbols
            if data_source == DATA_SOURCE_MANUAL {
                debug!("Skipping manual data source symbol {}", symbol);
                return Ok(());
            }

            let mut state = QuoteSyncState::new(symbol.to_string(), data_source);
            state.first_activity_date = Some(activity_date);
            state.last_activity_date = Some(activity_date);
            state.is_active = true;
            state.sync_priority = SyncCategory::New.default_priority();

            self.sync_state_repository.upsert(&state).await?;
        }

        Ok(())
    }

    async fn handle_activity_deleted(&self, symbol: &str) -> Result<()> {
        // Skip cash symbols
        if symbol.is_empty() || symbol.starts_with("$CASH") {
            return Ok(());
        }

        info!("Handling activity deletion for symbol {}", symbol);

        // Get all activities for this symbol to recalculate dates
        let activities = self.activity_repository.get_activities()?;
        let symbol_activities: Vec<_> = activities
            .iter()
            .filter(|a| a.asset_id.as_deref() == Some(symbol))
            .collect();

        if symbol_activities.is_empty() {
            // No more activities for this symbol - delete sync state
            info!(
                "No more activities for symbol {}, deleting sync state",
                symbol
            );
            self.sync_state_repository.delete(symbol).await?;
            return Ok(());
        }

        // Recalculate first and last activity dates
        let mut first_date: Option<NaiveDate> = None;
        let mut last_date: Option<NaiveDate> = None;

        for activity in &symbol_activities {
            let date = activity.activity_date.date_naive();

            first_date = Some(match first_date {
                Some(existing) if date < existing => date,
                Some(existing) => existing,
                None => date,
            });

            last_date = Some(match last_date {
                Some(existing) if date > existing => date,
                Some(existing) => existing,
                None => date,
            });
        }

        // Update sync state with recalculated dates
        if let Some(mut state) = self.sync_state_repository.get_by_symbol(symbol)? {
            state.first_activity_date = first_date;
            state.last_activity_date = last_date;
            self.sync_state_repository.upsert(&state).await?;
            info!(
                "Updated sync state for {} with dates {:?} to {:?}",
                symbol, first_date, last_date
            );
        }

        Ok(())
    }

    async fn delete_sync_state(&self, symbol: &str) -> Result<()> {
        info!("Deleting sync state for symbol {}", symbol);
        self.sync_state_repository.delete(symbol).await
    }

    fn get_symbols_needing_sync(&self) -> Result<Vec<QuoteSyncState>> {
        self.sync_state_repository
            .get_symbols_needing_sync(CLOSED_POSITION_GRACE_PERIOD_DAYS)
    }
}

impl MarketDataService {
    pub async fn new(
        repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
        asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>,
        secret_store: Arc<dyn SecretStore>,
        sync_state_repository: Arc<dyn QuoteSyncStateRepositoryTrait>,
        snapshot_repository: Arc<dyn SnapshotRepositoryTrait>,
        activity_repository: Arc<dyn ActivityRepositoryTrait>,
        account_repository: Arc<dyn AccountRepositoryTrait>,
    ) -> Result<Self> {
        let provider_settings = repository.get_all_providers()?;
        // Be resilient on platforms where certain providers cannot initialize (e.g., mobile TLS differences).
        // Fall back to an empty registry (Manual provider only) instead of aborting app initialization.
        let registry = match ProviderRegistry::new(provider_settings, secret_store.clone()).await {
            Ok(reg) => reg,
            Err(e) => {
                log::warn!(
                    "Provider registry initialization failed: {}. Falling back to empty registry.",
                    e
                );
                // Safe fallback: no external providers enabled
                ProviderRegistry::new(Vec::new(), secret_store.clone()).await?
            }
        };
        let provider_registry = Arc::new(RwLock::new(registry));

        Ok(Self {
            provider_registry,
            repository,
            asset_repository,
            secret_store,
            sync_state_repository,
            snapshot_repository,
            activity_repository,
            account_repository,
        })
    }

    /// Refreshes the provider registry with the latest settings from the database
    async fn refresh_provider_registry(&self) -> Result<()> {
        debug!("Refreshing provider registry with latest settings");
        let provider_settings = self.repository.get_all_providers()?;
        let new_registry =
            ProviderRegistry::new(provider_settings, self.secret_store.clone()).await?;

        // Replace the registry with the new one
        *self.provider_registry.write().await = new_registry;

        debug!("Provider registry refreshed successfully");
        Ok(())
    }

    /// Legacy sync method - syncs all assets without optimization
    async fn legacy_sync_market_data(&self) -> Result<((), Vec<(String, String)>)> {
        debug!("Using legacy sync market data (fallback).");
        let assets = self.asset_repository.list()?;
        let quote_requests: Vec<_> = assets
            .iter()
            .filter(|asset| {
                asset.asset_type.as_deref() != Some(CASH_ASSET_TYPE)
                    && asset.data_source != DATA_SOURCE_MANUAL
            })
            .map(|asset| QuoteRequest {
                symbol: asset.symbol.clone(),
                quote_symbol: asset.quote_symbol.clone(),
                data_source: asset.data_source.as_str().into(),
                currency: asset.currency.clone(),
            })
            .collect();

        self.process_market_data_sync(quote_requests, false).await
    }

    /// Internal sync with plan implementation
    async fn sync_with_plan_internal(
        &self,
        sync_plans: Vec<SymbolSyncPlan>,
    ) -> Result<((), Vec<(String, String)>)> {
        if sync_plans.is_empty() {
            debug!("No symbols to sync in the provided plan.");
            return Ok(((), Vec::new()));
        }

        debug!(
            "Syncing market data with optimized plan: {} symbols",
            sync_plans.len()
        );

        // Convert sync plans to quote requests
        let quote_requests: Vec<QuoteRequest> = sync_plans
            .iter()
            .map(|plan| QuoteRequest {
                symbol: plan.symbol.clone(),
                quote_symbol: plan.quote_symbol.clone(),
                data_source: plan.data_source.as_str().into(),
                currency: plan.currency.clone(),
            })
            .collect();

        // Build a map of symbol to start date from the sync plans
        let symbol_start_dates: HashMap<String, NaiveDate> = sync_plans
            .iter()
            .map(|plan| (plan.symbol.clone(), plan.start_date))
            .collect();

        // Process using existing infrastructure but with custom start dates
        self.process_market_data_sync_with_dates(quote_requests, symbol_start_dates)
            .await
    }

    /// Process market data sync with custom start dates per symbol
    async fn process_market_data_sync_with_dates(
        &self,
        quote_requests: Vec<QuoteRequest>,
        symbol_start_dates: HashMap<String, NaiveDate>,
    ) -> Result<((), Vec<(String, String)>)> {
        if quote_requests.is_empty() {
            debug!("No syncable assets found matching the criteria. Skipping sync.");
            return Ok(((), Vec::new()));
        }

        let today = Utc::now().date_naive();
        let end_date_naive_utc = today
            .and_hms_opt(23, 59, 59)
            .expect("valid end-of-day time");
        let end_date: SystemTime = Utc.from_utc_datetime(&end_date_naive_utc).into();

        let mut all_quotes = Vec::new();
        let mut failed_syncs = Vec::new();

        let symbol_to_fetch_symbol: HashMap<String, String> = quote_requests
            .iter()
            .map(|req| {
                let fetch_symbol = req
                    .quote_symbol
                    .as_ref()
                    .map(|value| value.trim())
                    .filter(|value| !value.is_empty())
                    .unwrap_or(req.symbol.as_str())
                    .to_string();
                (req.symbol.clone(), fetch_symbol)
            })
            .collect();

        // Group requests by start date for efficient batch processing
        let mut grouped_requests: BTreeMap<NaiveDate, Vec<(String, String)>> = BTreeMap::new();

        for req in &quote_requests {
            let start_date = symbol_start_dates
                .get(&req.symbol)
                .copied()
                .unwrap_or(today);

            grouped_requests
                .entry(start_date)
                .or_default()
                .push((req.symbol.clone(), req.currency.clone()));
        }

        for (start_date, group_symbols) in grouped_requests.into_iter() {
            if group_symbols.is_empty() {
                continue;
            }

            let start_time: SystemTime = Utc
                .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap())
                .into();

            if start_time >= end_date {
                debug!(
                    "Skipping sync for symbols {:?} because start time {:?} >= end time {:?}.",
                    group_symbols
                        .iter()
                        .map(|(symbol, _)| symbol.clone())
                        .collect::<Vec<_>>(),
                    start_date,
                    today,
                );
                continue;
            }

            let symbol_names: Vec<String> = group_symbols
                .iter()
                .map(|(symbol, _)| symbol.clone())
                .collect();

            let mut fetch_symbols: Vec<(String, String)> = Vec::new();
            let mut fetch_key_to_symbols: HashMap<(String, String), Vec<String>> = HashMap::new();
            let mut fetch_symbol_to_symbols: HashMap<String, Vec<String>> = HashMap::new();
            let mut seen_fetch_keys: HashSet<(String, String)> = HashSet::new();

            for (symbol, currency) in &group_symbols {
                let fetch_symbol = symbol_to_fetch_symbol
                    .get(symbol)
                    .cloned()
                    .unwrap_or_else(|| symbol.clone());
                fetch_key_to_symbols
                    .entry((fetch_symbol.clone(), currency.clone()))
                    .or_default()
                    .push(symbol.clone());
                fetch_symbol_to_symbols
                    .entry(fetch_symbol.clone())
                    .or_default()
                    .push(symbol.clone());

                if seen_fetch_keys.insert((fetch_symbol.clone(), currency.clone())) {
                    fetch_symbols.push((fetch_symbol, currency.clone()));
                }
            }

            match self
                .provider_registry
                .read()
                .await
                .historical_quotes_bulk(&fetch_symbols, start_time, end_date)
                .await
            {
                Ok((quotes, provider_failures)) => {
                    let mut remapped_quotes: Vec<Quote> = Vec::with_capacity(quotes.len());

                    for quote in quotes {
                        match fetch_symbol_to_symbols.get(&quote.symbol) {
                            Some(target_symbols) if !target_symbols.is_empty() => {
                                if target_symbols.len() == 1 && target_symbols[0] == quote.symbol {
                                    remapped_quotes.push(quote);
                                    continue;
                                }

                                for target_symbol in target_symbols {
                                    let mut remapped = quote.clone();
                                    if remapped.symbol != *target_symbol {
                                        remapped.symbol = target_symbol.clone();
                                    }
                                    remapped.id = format!(
                                        "{}_{}",
                                        remapped.timestamp.format("%Y%m%d"),
                                        remapped.symbol
                                    );
                                    remapped_quotes.push(remapped);
                                }
                            }
                            _ => remapped_quotes.push(quote),
                        }
                    }

                    let remapped_failures: Vec<(String, String)> = provider_failures
                        .into_iter()
                        .flat_map(|(failed_symbol, currency)| {
                            fetch_key_to_symbols
                                .get(&(failed_symbol.clone(), currency.clone()))
                                .map(|targets| {
                                    targets
                                        .iter()
                                        .cloned()
                                        .map(|target| (target, currency.clone()))
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_else(|| vec![(failed_symbol, currency)])
                        })
                        .collect();

                    debug!(
                        "Fetched {} quotes for symbols {:?} (start {}).",
                        remapped_quotes.len(),
                        symbol_names,
                        start_date
                    );
                    all_quotes.extend(remapped_quotes);
                    failed_syncs.extend(remapped_failures);
                }
                Err(e) => {
                    error!(
                        "Failed to sync quotes for symbols {:?} starting {}: {}",
                        symbol_names, start_date, e
                    );
                    failed_syncs.extend(
                        symbol_names
                            .into_iter()
                            .map(|symbol| (symbol, e.to_string())),
                    );
                }
            }
        }

        if !all_quotes.is_empty() {
            debug!(
                "Attempting to save {} quotes to the repository.",
                all_quotes.len()
            );
            all_quotes.sort_by(|a, b| {
                a.symbol
                    .cmp(&b.symbol)
                    .then_with(|| a.timestamp.cmp(&b.timestamp))
                    .then_with(|| a.data_source.as_str().cmp(b.data_source.as_str()))
            });

            // Track latest and earliest quote dates per symbol for sync state update
            let mut symbol_quote_ranges: HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)> =
                HashMap::new();
            for quote in &all_quotes {
                let date = quote.timestamp.date_naive();
                symbol_quote_ranges
                    .entry(quote.symbol.clone())
                    .and_modify(|(earliest, latest)| {
                        if earliest.map(|e| date < e).unwrap_or(true) {
                            *earliest = Some(date);
                        }
                        if latest.map(|l| date > l).unwrap_or(true) {
                            *latest = Some(date);
                        }
                    })
                    .or_insert((Some(date), Some(date)));
            }

            if let Err(e) = self.repository.save_quotes(&all_quotes).await {
                error!("Failed to save synced quotes to repository: {}", e);
                failed_syncs.push(("repository_save".to_string(), e.to_string()));
            } else {
                debug!("Successfully saved {} quotes.", all_quotes.len());

                // Update sync state for each symbol with the new quote date ranges
                for (symbol, (earliest, latest)) in symbol_quote_ranges {
                    if let Some(latest_date) = latest {
                        if let Err(e) = self
                            .sync_state_repository
                            .update_after_sync(&symbol, latest_date, earliest)
                            .await
                        {
                            warn!(
                                "Failed to update sync state for {} after sync: {}",
                                symbol, e
                            );
                        }
                    }
                }
            }
        }

        Ok(((), failed_syncs))
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

        let current_utc_naive_date = Utc::now().date_naive();
        let end_date_naive_utc = current_utc_naive_date
            .and_hms_opt(23, 59, 59)
            .expect("valid end-of-day time");
        let end_date: SystemTime = Utc.from_utc_datetime(&end_date_naive_utc).into();

        let public_requests = quote_requests;
        let mut all_quotes = Vec::new();
        let mut failed_syncs = Vec::new();
        let symbols_with_currencies: Vec<(String, String)> = public_requests
            .iter()
            .map(|req| (req.symbol.clone(), req.currency.clone()))
            .collect();
        let symbol_to_fetch_symbol: HashMap<String, String> = public_requests
            .iter()
            .map(|req| {
                let fetch_symbol = req
                    .quote_symbol
                    .as_ref()
                    .map(|value| value.trim())
                    .filter(|value| !value.is_empty())
                    .unwrap_or(req.symbol.as_str())
                    .to_string();
                (req.symbol.clone(), fetch_symbol)
            })
            .collect();

        let sync_plan =
            self.calculate_sync_plan_for_symbols(refetch_all, &symbols_with_currencies, end_date)?;

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

                let mut fetch_symbols: Vec<(String, String)> = Vec::new();
                let mut fetch_key_to_symbols: HashMap<(String, String), Vec<String>> =
                    HashMap::new();
                let mut fetch_symbol_to_symbols: HashMap<String, Vec<String>> = HashMap::new();
                let mut seen_fetch_keys: HashSet<(String, String)> = HashSet::new();

                for (symbol, currency) in &group_symbols {
                    let fetch_symbol = symbol_to_fetch_symbol
                        .get(symbol)
                        .cloned()
                        .unwrap_or_else(|| symbol.clone());
                    fetch_key_to_symbols
                        .entry((fetch_symbol.clone(), currency.clone()))
                        .or_default()
                        .push(symbol.clone());
                    fetch_symbol_to_symbols
                        .entry(fetch_symbol.clone())
                        .or_default()
                        .push(symbol.clone());

                    if seen_fetch_keys.insert((fetch_symbol.clone(), currency.clone())) {
                        fetch_symbols.push((fetch_symbol, currency.clone()));
                    }
                }

                match self
                    .provider_registry
                    .read()
                    .await
                    .historical_quotes_bulk(&fetch_symbols, start_time, end_date)
                    .await
                {
                    Ok((quotes, provider_failures)) => {
                        let mut remapped_quotes: Vec<Quote> = Vec::with_capacity(quotes.len());

                        for quote in quotes {
                            match fetch_symbol_to_symbols.get(&quote.symbol) {
                                Some(target_symbols) if !target_symbols.is_empty() => {
                                    if target_symbols.len() == 1
                                        && target_symbols[0] == quote.symbol
                                    {
                                        remapped_quotes.push(quote);
                                        continue;
                                    }

                                    for target_symbol in target_symbols {
                                        let mut remapped = quote.clone();
                                        if remapped.symbol != *target_symbol {
                                            remapped.symbol = target_symbol.clone();
                                        }
                                        remapped.id = format!(
                                            "{}_{}",
                                            remapped.timestamp.format("%Y%m%d"),
                                            remapped.symbol
                                        );
                                        remapped_quotes.push(remapped);
                                    }
                                }
                                _ => remapped_quotes.push(quote),
                            }
                        }

                        let remapped_failures: Vec<(String, String)> = provider_failures
                            .into_iter()
                            .flat_map(|(failed_symbol, currency)| {
                                fetch_key_to_symbols
                                    .get(&(failed_symbol.clone(), currency.clone()))
                                    .map(|targets| {
                                        targets
                                            .iter()
                                            .cloned()
                                            .map(|target| (target, currency.clone()))
                                            .collect::<Vec<_>>()
                                    })
                                    .unwrap_or_else(|| vec![(failed_symbol, currency)])
                            })
                            .collect();

                        debug!(
                            "Fetched {} quotes for symbols {:?} (start {}).",
                            remapped_quotes.len(),
                            symbol_names,
                            DateTime::<Utc>::from(start_time).format("%Y-%m-%d")
                        );
                        all_quotes.extend(remapped_quotes);
                        failed_syncs.extend(remapped_failures);
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

            // Track latest and earliest quote dates per symbol for sync state update
            let mut symbol_quote_ranges: HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)> =
                HashMap::new();
            for quote in &all_quotes {
                let date = quote.timestamp.date_naive();
                symbol_quote_ranges
                    .entry(quote.symbol.clone())
                    .and_modify(|(earliest, latest)| {
                        if earliest.map(|e| date < e).unwrap_or(true) {
                            *earliest = Some(date);
                        }
                        if latest.map(|l| date > l).unwrap_or(true) {
                            *latest = Some(date);
                        }
                    })
                    .or_insert((Some(date), Some(date)));
            }

            if let Err(e) = self.repository.save_quotes(&all_quotes).await {
                error!("Failed to save synced quotes to repository: {}", e);
                failed_syncs.push(("repository_save".to_string(), e.to_string()));
            } else {
                debug!("Successfully saved {} filled quotes.", all_quotes.len());

                // Update sync state for each symbol with the new quote date ranges
                for (symbol, (earliest, latest)) in symbol_quote_ranges {
                    if let Some(latest_date) = latest {
                        if let Err(e) = self
                            .sync_state_repository
                            .update_after_sync(&symbol, latest_date, earliest)
                            .await
                        {
                            warn!(
                                "Failed to update sync state for {} after sync: {}",
                                symbol, e
                            );
                        }
                    }
                }
            }
        }

        Ok(((), failed_syncs))
    }

    fn calculate_sync_plan_for_symbols(
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

        // Get sync states to determine start dates based on first_activity_date
        let symbols_list: Vec<String> = symbols_with_currencies
            .iter()
            .map(|(sym, _)| sym.clone())
            .collect();

        let sync_states = self
            .sync_state_repository
            .get_by_symbols(&symbols_list)
            .unwrap_or_default();

        if refetch_all {
            // For refetch_all, use first_activity_date - buffer, or fall back to default
            let mut plan = Vec::new();
            for (symbol, currency) in symbols_with_currencies {
                let start_date = sync_states
                    .get(symbol)
                    .and_then(|state| state.first_activity_date)
                    .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                    .unwrap_or(default_start_date);

                let start_time: SystemTime = Utc
                    .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap())
                    .into();

                plan.push(SymbolSyncPlanItem {
                    symbol: symbol.clone(),
                    currency: currency.clone(),
                    start: start_time,
                });
            }
            return Ok(plan);
        }

        let quotes_map = match self
            .repository
            .get_latest_quotes_for_symbols(&symbols_list)
        {
            Ok(map) => map,
            Err(e) => {
                error!(
                    "Failed to get latest quotes for symbols {:?}: {}. Falling back to default history window.",
                    symbols_list, e
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
                        // Re-fetch the latest day to pick up intraday adjustments Yahoo publishes.
                        end_date
                    } else {
                        last_date.succ_opt().unwrap_or(last_date)
                    }
                }
                None => {
                    // No quotes yet - use first_activity_date - buffer, or fall back to default
                    sync_states
                        .get(symbol)
                        .and_then(|state| state.first_activity_date)
                        .map(|d| d - Duration::days(QUOTE_HISTORY_BUFFER_DAYS))
                        .unwrap_or(default_start_date)
                }
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
        if chrono::NaiveDate::parse_from_str(&quote.date, "%Y-%m-%d").is_err() {
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

    // --- Sync State Helper Methods ---

    /// Get all active account IDs
    fn get_active_account_ids(&self) -> Result<Vec<String>> {
        let accounts = self.account_repository.list(Some(true), None)?;
        Ok(accounts.into_iter().map(|a| a.id).collect())
    }

    /// Calculate first and last activity dates per symbol from all activities
    fn calculate_activity_dates_per_symbol(
        &self,
    ) -> Result<HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)>> {
        let activities = self.activity_repository.get_activities()?;

        let mut dates_map: HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)> = HashMap::new();

        for activity in activities {
            let symbol = match &activity.asset_id {
                Some(s) => s,
                None => continue, // Skip activities without asset_id (pure cash movements)
            };
            if symbol.is_empty() || symbol.starts_with("$CASH") {
                continue;
            }

            let activity_date = activity.activity_date.date_naive();

            dates_map
                .entry(symbol.clone())
                .and_modify(|(first, last)| {
                    // Update first date if this is earlier
                    match first {
                        Some(existing) if activity_date < *existing => {
                            *first = Some(activity_date);
                        }
                        None => {
                            *first = Some(activity_date);
                        }
                        _ => {}
                    }
                    // Update last date if this is later
                    match last {
                        Some(existing) if activity_date > *existing => {
                            *last = Some(activity_date);
                        }
                        None => {
                            *last = Some(activity_date);
                        }
                        _ => {}
                    }
                })
                .or_insert((Some(activity_date), Some(activity_date)));
        }

        Ok(dates_map)
    }

    /// Get symbols with open positions from latest snapshots
    fn get_symbols_with_open_positions(&self) -> Result<HashSet<String>> {
        let account_ids = self.get_active_account_ids()?;
        if account_ids.is_empty() {
            return Ok(HashSet::new());
        }

        let snapshots = self
            .snapshot_repository
            .get_all_latest_snapshots(&account_ids)?;

        let mut active_symbols = HashSet::new();
        for snapshot in snapshots.values() {
            for position in snapshot.positions.values() {
                if !position.quantity.is_zero() && position.quantity > Decimal::ZERO {
                    active_symbols.insert(position.asset_id.clone());
                }
            }
        }

        // Filter out cash positions
        active_symbols.retain(|s| !s.starts_with("$CASH"));

        Ok(active_symbols)
    }

    /// Get quote date range for each symbol from the quotes table
    fn get_quote_date_ranges(
        &self,
    ) -> Result<HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)>> {
        // Get all symbols from assets
        let assets = self.asset_repository.list()?;
        let symbols: Vec<String> = assets.iter().map(|a| a.symbol.clone()).collect();

        if symbols.is_empty() {
            return Ok(HashMap::new());
        }

        // For each symbol, get the date range of quotes
        let latest_quotes = self.repository.get_latest_quotes_for_symbols(&symbols)?;

        let mut ranges: HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)> = HashMap::new();

        for (symbol, quote) in latest_quotes {
            let latest_date = quote.timestamp.date_naive();
            // We only have latest quote easily available
            // earliest would require another query, but for now we track it via sync state updates
            ranges.insert(symbol, (None, Some(latest_date)));
        }

        Ok(ranges)
    }

    /// Build or update sync state for all relevant symbols
    async fn build_sync_states(&self) -> Result<Vec<QuoteSyncState>> {
        info!("Building sync states from holdings and activities...");

        // 1. Get symbols with open positions
        let active_symbols = self.get_symbols_with_open_positions()?;
        debug!(
            "Found {} active symbols with open positions",
            active_symbols.len()
        );

        // 2. Get activity date ranges per symbol
        let activity_dates = self.calculate_activity_dates_per_symbol()?;
        debug!("Found activity dates for {} symbols", activity_dates.len());

        // 3. Get existing sync states
        let existing_states = self.sync_state_repository.get_all()?;
        let existing_map: HashMap<String, QuoteSyncState> = existing_states
            .into_iter()
            .map(|s| (s.symbol.clone(), s))
            .collect();

        // 4. Get quote date ranges
        let quote_ranges = self.get_quote_date_ranges()?;

        // 5. Get asset data sources and collect FOREX assets
        let assets = self.asset_repository.list()?;
        let asset_data_sources: HashMap<String, String> = assets
            .iter()
            .map(|a| (a.symbol.clone(), a.data_source.clone()))
            .collect();

        // Collect FOREX assets that need syncing (non-manual data source)
        let forex_symbols: HashSet<String> = assets
            .iter()
            .filter(|a| {
                a.asset_type.as_deref() == Some(FOREX_ASSET_TYPE)
                    && a.data_source != DATA_SOURCE_MANUAL
            })
            .map(|a| a.symbol.clone())
            .collect();
        debug!("Found {} FOREX symbols to sync", forex_symbols.len());

        // 6. Combine all symbols
        let mut all_symbols: HashSet<String> = HashSet::new();
        all_symbols.extend(active_symbols.iter().cloned());
        all_symbols.extend(activity_dates.keys().cloned());
        all_symbols.extend(existing_map.keys().cloned());
        // Include FOREX assets so FX rates are synced even without activities
        all_symbols.extend(forex_symbols.iter().cloned());

        // Filter out manual data source symbols and cash
        all_symbols.retain(|s| {
            !s.starts_with("$CASH")
                && asset_data_sources
                    .get(s)
                    .map(|ds| ds != DATA_SOURCE_MANUAL)
                    .unwrap_or(true)
        });

        let today = Utc::now().date_naive();
        let mut sync_states = Vec::new();

        for symbol in all_symbols {
            // FOREX assets are always considered active since they're needed for currency conversion
            let is_forex = forex_symbols.contains(&symbol);
            let is_active = active_symbols.contains(&symbol) || is_forex;
            let (first_activity, last_activity) = activity_dates
                .get(&symbol)
                .cloned()
                .unwrap_or((None, None));
            let (earliest_quote, latest_quote) =
                quote_ranges.get(&symbol).cloned().unwrap_or((None, None));
            let data_source = asset_data_sources
                .get(&symbol)
                .cloned()
                .unwrap_or_else(|| "YAHOO".to_string());

            let mut state = if let Some(existing) = existing_map.get(&symbol) {
                let mut state = existing.clone();

                // Update activity dates if they've changed
                if first_activity.is_some() || last_activity.is_some() {
                    state.update_activity_dates(first_activity, last_activity);
                }

                // Update active status
                if is_active && !state.is_active {
                    state.mark_active();
                } else if !is_active && state.is_active {
                    // Position was closed
                    state.mark_closed(last_activity.unwrap_or(today));
                }

                // Update quote dates if newer
                if let Some(latest) = latest_quote {
                    if state.last_quote_date.map(|d| latest > d).unwrap_or(true) {
                        state.last_quote_date = Some(latest);
                    }
                }

                state
            } else {
                // New symbol - create state
                let mut state = QuoteSyncState::new(symbol.clone(), data_source);
                state.is_active = is_active;
                state.first_activity_date = first_activity;
                state.last_activity_date = last_activity;
                state.last_quote_date = latest_quote;
                state.earliest_quote_date = earliest_quote;

                if !is_active && last_activity.is_some() {
                    state.position_closed_date = last_activity;
                }

                state
            };

            // Update priority based on category
            let category = state.determine_category(CLOSED_POSITION_GRACE_PERIOD_DAYS);
            state.sync_priority = category.default_priority();

            sync_states.push(state);
        }

        Ok(sync_states)
    }
}
