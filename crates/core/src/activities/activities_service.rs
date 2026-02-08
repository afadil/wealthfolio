use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use log::debug;
use rust_decimal::Decimal;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::accounts::{Account, AccountServiceTrait};
use crate::activities::activities_constants::{
    classify_import_activity, is_garbage_symbol, requires_symbol, ImportSymbolDisposition,
    ACTIVITY_TYPE_TRANSFER_IN, ACTIVITY_TYPE_TRANSFER_OUT,
};
use crate::activities::activities_errors::ActivityError;
use crate::activities::activities_model::*;
use crate::activities::csv_parser::{self, ParseConfig, ParsedCsvResult};
use crate::activities::idempotency::compute_idempotency_key;
use crate::activities::{ActivityRepositoryTrait, ActivityServiceTrait};
use crate::assets::{
    parse_crypto_pair_symbol, parse_symbol_with_exchange_suffix, AssetKind, AssetServiceTrait,
    InstrumentType, QuoteMode,
};
use crate::events::{DomainEvent, DomainEventSink, NoOpDomainEventSink};
use crate::fx::currency::{get_normalization_rule, normalize_amount, resolve_currency};
use crate::fx::FxServiceTrait;
use crate::quotes::{DataSource, Quote, QuoteServiceTrait};
use crate::sync::{
    ImportRun, ImportRunMode, ImportRunRepositoryTrait, ImportRunSummary, ImportRunType, ReviewMode,
};
use crate::Result;
use log::warn;
use uuid::Uuid;

/// Service for managing activities
pub struct ActivityService {
    activity_repository: Arc<dyn ActivityRepositoryTrait>,
    account_service: Arc<dyn AccountServiceTrait>,
    asset_service: Arc<dyn AssetServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
    quote_service: Arc<dyn QuoteServiceTrait>,
    import_run_repository: Option<Arc<dyn ImportRunRepositoryTrait>>,
    event_sink: Arc<dyn DomainEventSink>,
}

impl ActivityService {
    /// Creates a new ActivityService instance with injected dependencies
    pub fn new(
        activity_repository: Arc<dyn ActivityRepositoryTrait>,
        account_service: Arc<dyn AccountServiceTrait>,
        asset_service: Arc<dyn AssetServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
    ) -> Self {
        Self {
            activity_repository,
            account_service,
            asset_service,
            fx_service,
            quote_service,
            import_run_repository: None,
            event_sink: Arc::new(NoOpDomainEventSink),
        }
    }

    /// Creates a new ActivityService instance with import run tracking support
    pub fn with_import_run_repository(
        activity_repository: Arc<dyn ActivityRepositoryTrait>,
        account_service: Arc<dyn AccountServiceTrait>,
        asset_service: Arc<dyn AssetServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
        import_run_repository: Arc<dyn ImportRunRepositoryTrait>,
    ) -> Self {
        Self {
            activity_repository,
            account_service,
            asset_service,
            fx_service,
            quote_service,
            import_run_repository: Some(import_run_repository),
            event_sink: Arc::new(NoOpDomainEventSink),
        }
    }

    /// Sets the domain event sink for this service.
    ///
    /// Events are emitted after successful mutations (create, update, delete).
    pub fn with_event_sink(mut self, event_sink: Arc<dyn DomainEventSink>) -> Self {
        self.event_sink = event_sink;
        self
    }

    fn get_base_currency_or_usd(&self) -> String {
        resolve_currency(&[
            self.account_service.get_base_currency().as_deref().unwrap_or(""),
        ])
    }

    fn resolve_activity_currency(
        &self,
        activity_currency: &str,
        asset_currency: Option<&str>,
        account_currency: &str,
    ) -> String {
        resolve_currency(&[
            activity_currency,
            asset_currency.unwrap_or(""),
            account_currency,
            self.account_service.get_base_currency().as_deref().unwrap_or(""),
        ])
    }

    /// Resolves (symbol, currency) pairs to exchange MICs in batch.
    /// Uses the activity-level currency to rank exchange results correctly.
    /// First checks existing assets in the database, then falls back to quote service.
    async fn resolve_symbols_batch(
        &self,
        symbol_currency_pairs: HashSet<(String, String)>,
    ) -> HashMap<(String, String), Option<String>> {
        let mut cache: HashMap<(String, String), Option<String>> = HashMap::new();

        if symbol_currency_pairs.is_empty() {
            return cache;
        }

        // 1. Get all existing assets and build a lookup map (case-insensitive)
        let existing_assets = self.asset_service.get_assets().unwrap_or_default();
        let existing_map: HashMap<String, Option<String>> = existing_assets
            .into_iter()
            .filter_map(|a| {
                let symbol = a.display_code.or(a.instrument_symbol)?;
                Some((symbol.to_lowercase(), a.instrument_exchange_mic))
            })
            .collect();

        // 2. Check each symbol against existing assets first
        let mut missing: Vec<(String, String)> = Vec::new();

        for (symbol, currency) in &symbol_currency_pairs {
            if symbol.trim().is_empty() {
                cache.insert((symbol.clone(), currency.clone()), None);
                continue;
            }
            if let Some(exchange_mic) = existing_map.get(&symbol.to_lowercase()) {
                cache.insert((symbol.clone(), currency.clone()), exchange_mic.clone());
            } else {
                missing.push((symbol.clone(), currency.clone()));
            }
        }

        // 3. Resolve missing symbols via quote service using the activity currency
        for (symbol, currency) in missing {
            let results = self
                .quote_service
                .search_symbol_with_currency(&symbol, Some(&currency))
                .await
                .unwrap_or_default();

            let exchange_mic = results.first().and_then(|r| r.exchange_mic.clone());
            cache.insert((symbol, currency), exchange_mic);
        }

        cache
    }

    /// Convenience wrapper: resolves symbols using a single currency for all.
    /// Used by callers where per-activity currency isn't available (broker sync, prepare).
    async fn resolve_symbols_batch_single_currency(
        &self,
        symbols: HashSet<String>,
        currency: &str,
    ) -> HashMap<String, Option<String>> {
        let pairs: HashSet<(String, String)> = symbols
            .into_iter()
            .map(|s| (s, currency.to_string()))
            .collect();
        self.resolve_symbols_batch(pairs)
            .await
            .into_iter()
            .map(|((sym, _), mic)| (sym, mic))
            .collect()
    }

    /// Creates a manual quote from activity data when quote_mode is MANUAL.
    /// This ensures the asset has a price point on the activity date.
    async fn create_manual_quote_from_activity(
        &self,
        asset_id: &str,
        unit_price: Decimal,
        currency: &str,
        activity_date: &str,
    ) -> Result<()> {
        // Parse activity date
        let timestamp = if let Ok(dt) = DateTime::parse_from_rfc3339(activity_date) {
            dt.with_timezone(&Utc)
        } else if let Ok(date) = NaiveDate::parse_from_str(activity_date, "%Y-%m-%d") {
            Utc.from_utc_datetime(&date.and_hms_opt(12, 0, 0).unwrap())
        } else {
            debug!(
                "Could not parse activity date '{}' for manual quote creation",
                activity_date
            );
            return Ok(());
        };

        // Generate quote ID: YYYYMMDD_ASSETID
        let date_part = timestamp.format("%Y%m%d").to_string();
        let quote_id = format!("{}_{}", date_part, asset_id.to_uppercase());

        let quote = Quote {
            id: quote_id,
            asset_id: asset_id.to_string(),
            timestamp,
            open: unit_price,
            high: unit_price,
            low: unit_price,
            close: unit_price,
            adjclose: unit_price,
            volume: Decimal::ZERO,
            currency: currency.to_string(),
            data_source: DataSource::Manual,
            created_at: Utc::now(),
            notes: None,
        };

        match self.quote_service.update_quote(quote).await {
            Ok(_) => {
                debug!(
                    "Created manual quote for asset {} on {} at price {}",
                    asset_id, activity_date, unit_price
                );
            }
            Err(e) => {
                // Log but don't fail the activity creation
                debug!(
                    "Failed to create manual quote for asset {}: {}",
                    asset_id, e
                );
            }
        }

        Ok(())
    }

    /// Parses CSV content with the given configuration.
    pub fn parse_csv(&self, content: &[u8], config: &ParseConfig) -> Result<ParsedCsvResult> {
        csv_parser::parse_csv(content, config)
    }
}

impl ActivityService {
    /// Infers the asset kind and instrument type from symbol, exchange, and hints.
    /// Returns (AssetKind, Option<InstrumentType>).
    fn infer_asset_kind(
        &self,
        symbol: &str,
        exchange_mic: Option<&str>,
        asset_kind_hint: Option<&str>,
    ) -> (AssetKind, Option<InstrumentType>) {
        // 1. If explicit hint is provided, use it
        if let Some(hint) = asset_kind_hint {
            match hint.to_uppercase().as_str() {
                "SECURITY" | "INVESTMENT" | "EQUITY" => {
                    return (AssetKind::Investment, Some(InstrumentType::Equity))
                }
                "CRYPTO" => return (AssetKind::Investment, Some(InstrumentType::Crypto)),
                "FX_RATE" | "FX" => return (AssetKind::Fx, Some(InstrumentType::Fx)),
                "OPTION" | "OPT" => {
                    return (AssetKind::Investment, Some(InstrumentType::Option))
                }
                "COMMODITY" | "CMDTY" | "METAL" => {
                    return (AssetKind::Investment, Some(InstrumentType::Metal))
                }
                "PROPERTY" | "PROP" => return (AssetKind::Property, None),
                "VEHICLE" | "VEH" => return (AssetKind::Vehicle, None),
                "COLLECTIBLE" | "COLL" => return (AssetKind::Collectible, None),
                "PRECIOUS_METAL" | "PREC" => return (AssetKind::PreciousMetal, None),
                "PRIVATE_EQUITY" | "PEQ" => return (AssetKind::PrivateEquity, None),
                "LIABILITY" | "LIAB" => return (AssetKind::Liability, None),
                "OTHER" | "ALT" => return (AssetKind::Other, None),
                _ => {} // Fall through to inference
            }
        }

        // 2. Crypto pair pattern (e.g., BTC-USD, ETH-CAD) — checked before
        //    exchange_mic because brokers may attach their MIC to crypto pairs
        let upper_symbol = symbol.to_uppercase();
        if let Some((_base, quote)) = upper_symbol.rsplit_once('-') {
            let quote = quote.trim();
            let crypto_quotes = [
                "USD", "CAD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "HKD", "SGD", "CNY",
                "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "MXN", "BRL", "KRW", "INR",
                "ZAR", "BTC", "ETH", "USDT", "USDC", "DAI", "BUSD", "USDP", "TUSD", "FDUSD",
            ];
            if crypto_quotes.contains(&quote) {
                return (AssetKind::Investment, Some(InstrumentType::Crypto));
            }
        }

        // 3. If exchange MIC is provided, it's an equity
        if exchange_mic.is_some() {
            return (AssetKind::Investment, Some(InstrumentType::Equity));
        }

        // 4. Common crypto symbols heuristic (no MIC, bare symbol like BTC, ETH)
        let common_crypto = [
            "BTC", "ETH", "XRP", "LTC", "BCH", "ADA", "DOT", "LINK", "XLM", "DOGE", "UNI",
            "SOL", "AVAX", "MATIC", "ATOM", "ALGO", "VET", "FIL", "TRX", "ETC", "XMR", "AAVE",
            "MKR", "COMP", "SNX", "YFI", "SUSHI", "CRV",
        ];
        if common_crypto.contains(&upper_symbol.as_str()) {
            return (AssetKind::Investment, Some(InstrumentType::Crypto));
        }

        // 5. Default to equity (most common case)
        (AssetKind::Investment, Some(InstrumentType::Equity))
    }

    /// Finds an existing asset by instrument fields, searching all assets.
    fn find_existing_asset_id(
        &self,
        symbol: &str,
        exchange_mic: Option<&str>,
        instrument_type: Option<&InstrumentType>,
    ) -> Option<String> {
        let assets = self.asset_service.get_assets().unwrap_or_default();
        let upper_symbol = symbol.to_uppercase();
        for asset in &assets {
            if let (Some(ref a_symbol), Some(ref a_type)) =
                (&asset.instrument_symbol, &asset.instrument_type)
            {
                let type_matches = instrument_type.map_or(true, |t| t == a_type);
                let symbol_matches = a_symbol.to_uppercase() == upper_symbol;
                let mic_matches = match (exchange_mic, &asset.instrument_exchange_mic) {
                    (Some(mic), Some(a_mic)) => mic.eq_ignore_ascii_case(a_mic),
                    (None, None) => true,
                    _ => false,
                };
                if type_matches && symbol_matches && mic_matches {
                    return Some(asset.id.clone());
                }
            }
        }
        None
    }

    async fn prepare_new_activity(&self, mut activity: NewActivity) -> Result<NewActivity> {
        let account: Account = self.account_service.get_account(&activity.account_id)?;
        let base_ccy = self.account_service.get_base_currency().unwrap_or_default();
        let account_currency = resolve_currency(&[&account.currency, &base_ccy]);

        let currency = resolve_currency(&[&activity.currency, &account_currency, &base_ccy]);

        // Extract asset fields from nested `asset` object
        let symbol = activity.get_symbol_code().map(|s| s.to_string());
        let exchange_mic = activity.get_exchange_mic().map(|s| s.to_string());
        let asset_kind_hint = activity.get_kind_hint().map(|s| s.to_string());
        let asset_name = activity.get_name().map(|s| s.to_string());
        let quote_mode = activity.get_quote_mode().map(|s| s.to_string());

        let inferred = symbol.as_deref().map(|s| {
            self.infer_asset_kind(s, exchange_mic.as_deref(), asset_kind_hint.as_deref())
        });
        let inferred_instrument_type = inferred.as_ref().and_then(|(_, it)| it.clone());

        // Crypto/FX assets don't have exchange MICs — clear any that leaked from frontend
        let is_crypto = inferred_instrument_type.as_ref() == Some(&InstrumentType::Crypto);
        let exchange_mic = if is_crypto { None } else { exchange_mic };

        // Use asset currency for crypto pairs (e.g., BTC-USD -> USD) instead of activity currency.
        let asset_currency = if is_crypto {
            symbol
                .as_deref()
                .and_then(parse_crypto_pair_symbol)
                .map(|(_, quote)| quote)
                .unwrap_or_else(|| currency.clone())
        } else {
            currency.clone()
        };

        // Resolve asset_id:
        // 1. If symbol is provided, search existing assets or prepare for creation
        // 2. If only asset.id is provided (UUID), use it directly
        // 3. Cash activities: no asset
        let resolved_asset_id = if let Some(ref sym) = symbol {
            if !sym.is_empty() {
                // Strip Yahoo suffix (e.g. GOOG.TO → GOOG + XTSE)
                let (base_symbol, suffix_mic) = parse_symbol_with_exchange_suffix(sym);
                let effective_mic = if is_crypto {
                    None
                } else {
                    exchange_mic
                        .clone()
                        .or_else(|| suffix_mic.map(|s| s.to_string()))
                };

                // For crypto pairs (e.g. BTC-USD), normalize to base symbol (BTC)
                let normalized_symbol = if is_crypto {
                    parse_crypto_pair_symbol(base_symbol)
                        .map(|(base, _)| base)
                        .unwrap_or_else(|| base_symbol.to_string())
                } else {
                    base_symbol.to_string()
                };

                // Look up existing asset by instrument fields
                let existing_id = self.find_existing_asset_id(
                    &normalized_symbol,
                    effective_mic.as_deref(),
                    inferred_instrument_type.as_ref(),
                );

                if let Some(id) = existing_id {
                    Some(id)
                } else {
                    // Create new asset with generated UUID
                    let new_id = Uuid::new_v4().to_string();
                    let metadata = crate::assets::AssetMetadata {
                        name: asset_name.clone(),
                        kind: inferred.as_ref().map(|(k, _)| k.clone()),
                        instrument_exchange_mic: effective_mic.clone(),
                        instrument_symbol: Some(normalized_symbol.clone()),
                        instrument_type: inferred_instrument_type.clone(),
                        display_code: Some(normalized_symbol.clone()),
                    };
                    self.asset_service
                        .get_or_create_minimal_asset(
                            &new_id,
                            Some(asset_currency.clone()),
                            Some(metadata),
                            quote_mode.clone(),
                        )
                        .await?;
                    Some(new_id)
                }
            } else {
                None
            }
        } else if let Some(asset_id) = activity.get_symbol_id().filter(|s| !s.is_empty()) {
            // Existing asset_id provided (UUID from frontend)
            Some(asset_id.to_string())
        } else if !requires_symbol(&activity.activity_type) {
            None // Symbol-optional types have no asset when symbol is absent
        } else {
            return Err(ActivityError::InvalidData(
                "Symbol-required activities need either asset_id or symbol".to_string(),
            )
            .into());
        };

        // Update activity's asset with resolved asset_id
        if let Some(ref resolved_id) = resolved_asset_id {
            match activity.symbol.as_mut() {
                Some(asset) => asset.id = Some(resolved_id.clone()),
                None => {
                    activity.symbol = Some(SymbolInput {
                        id: Some(resolved_id.clone()),
                        ..Default::default()
                    });
                }
            }
        }

        // Process asset if asset_id is resolved
        if let Some(ref asset_id) = resolved_asset_id {
            let metadata = crate::assets::AssetMetadata {
                name: asset_name.clone(),
                kind: inferred.as_ref().map(|(k, _)| k.clone()),
                instrument_exchange_mic: exchange_mic.clone(),
                instrument_symbol: symbol.as_deref().map(|s| {
                    parse_symbol_with_exchange_suffix(s).0.to_string()
                }),
                instrument_type: inferred_instrument_type.clone(),
                display_code: symbol.as_deref().map(|s| {
                    parse_symbol_with_exchange_suffix(s).0.to_string()
                }),
            };
            let asset = self
                .asset_service
                .get_or_create_minimal_asset(
                    asset_id,
                    Some(asset_currency.clone()),
                    Some(metadata),
                    quote_mode.clone(),
                )
                .await?;

            // Update asset quote mode if specified (for existing assets that need mode change)
            if let Some(ref mode) = quote_mode {
                let requested_mode = mode.to_uppercase();
                let current_mode = asset.quote_mode.as_db_str();
                if requested_mode != current_mode {
                    self.asset_service
                        .update_quote_mode(&asset.id, &requested_mode)
                        .await?;
                }

                // Create manual quote for MANUAL mode assets
                if requested_mode == "MANUAL" {
                    if let Some(unit_price) = activity.unit_price {
                        self.create_manual_quote_from_activity(
                            asset_id,
                            unit_price,
                            &currency,
                            &activity.activity_date,
                        )
                        .await?;
                    }
                }
            }

            if activity.currency.is_empty() {
                activity.currency = asset.quote_ccy.clone();
            }

            // Register FX pair for activity currency if different from account currency
            if activity.currency != account_currency {
                self.fx_service
                    .register_currency_pair(activity.currency.as_str(), account_currency.as_str())
                    .await?;
            }

            // Register FX pair for asset currency if different from account currency
            if asset.quote_ccy != account_currency && asset.quote_ccy != activity.currency {
                self.fx_service
                    .register_currency_pair(asset.quote_ccy.as_str(), account_currency.as_str())
                    .await?;
            }
        } else {
            // For pure cash movements without asset, just register FX if needed
            if activity.currency.is_empty() {
                activity.currency =
                    self.resolve_activity_currency("", None, &account_currency);
            }

            if activity.currency != account_currency {
                self.fx_service
                    .register_currency_pair(activity.currency.as_str(), account_currency.as_str())
                    .await?;
            }
        }

        // Normalize minor currency units (e.g., GBp -> GBP) and convert amounts
        if get_normalization_rule(&activity.currency).is_some() {
            if let Some(unit_price) = activity.unit_price {
                let (normalized_price, _) = normalize_amount(unit_price, &activity.currency);
                activity.unit_price = Some(normalized_price);
            }
            if let Some(amount) = activity.amount {
                let (normalized_amount, _) = normalize_amount(amount, &activity.currency);
                activity.amount = Some(normalized_amount);
            }
            if let Some(fee) = activity.fee {
                let (normalized_fee, normalized_currency) =
                    normalize_amount(fee, &activity.currency);
                activity.fee = Some(normalized_fee);
                activity.currency = normalized_currency.to_string();
            } else {
                let (_, normalized_currency) = normalize_amount(Decimal::ZERO, &activity.currency);
                activity.currency = normalized_currency.to_string();
            }
        }

        // Compute idempotency key for deduplication
        if let Ok(date) = DateTime::parse_from_rfc3339(&activity.activity_date)
            .map(|dt| dt.with_timezone(&Utc))
            .or_else(|_| {
                NaiveDate::parse_from_str(&activity.activity_date, "%Y-%m-%d").map(|d| {
                    Utc.from_utc_datetime(&d.and_hms_opt(0, 0, 0).unwrap_or_default())
                })
            })
        {
            let key = compute_idempotency_key(
                &activity.account_id,
                &activity.activity_type,
                &date,
                activity.get_symbol_id(),
                activity.quantity,
                activity.unit_price,
                activity.amount,
                &activity.currency,
                None,
                activity.notes.as_deref(),
            );
            activity.idempotency_key = Some(key);
        }

        Ok(activity)
    }

    async fn prepare_update_activity(
        &self,
        mut activity: ActivityUpdate,
    ) -> Result<ActivityUpdate> {
        let account: Account = self.account_service.get_account(&activity.account_id)?;
        let base_ccy = self.account_service.get_base_currency().unwrap_or_default();
        let account_currency = resolve_currency(&[&account.currency, &base_ccy]);
        let currency = resolve_currency(&[&activity.currency, &account_currency]);

        // Extract asset fields
        let symbol = activity.get_symbol_code().map(|s| s.to_string());
        let exchange_mic = activity.get_exchange_mic().map(|s| s.to_string());
        let asset_kind_hint = activity.get_kind_hint().map(|s| s.to_string());
        let asset_name = activity.get_name().map(|s| s.to_string());
        let quote_mode = activity.get_quote_mode().map(|s| s.to_string());

        let inferred = symbol.as_deref().map(|s| {
            self.infer_asset_kind(s, exchange_mic.as_deref(), asset_kind_hint.as_deref())
        });
        let inferred_instrument_type = inferred.as_ref().and_then(|(_, it)| it.clone());

        // Use asset currency for crypto pairs
        let is_crypto = inferred_instrument_type.as_ref() == Some(&InstrumentType::Crypto);
        let asset_currency = if is_crypto {
            symbol
                .as_deref()
                .and_then(parse_crypto_pair_symbol)
                .map(|(_, quote)| quote)
                .unwrap_or_else(|| currency.clone())
        } else {
            currency.clone()
        };

        // Resolve asset_id (same logic as prepare_new_activity)
        let resolved_asset_id = if let Some(ref sym) = symbol {
            if !sym.is_empty() {
                let (base_symbol, suffix_mic) = parse_symbol_with_exchange_suffix(sym);
                let effective_mic = exchange_mic
                    .clone()
                    .or_else(|| suffix_mic.map(|s| s.to_string()));

                let existing_id = self.find_existing_asset_id(
                    base_symbol,
                    effective_mic.as_deref(),
                    inferred_instrument_type.as_ref(),
                );

                if let Some(id) = existing_id {
                    Some(id)
                } else {
                    let new_id = Uuid::new_v4().to_string();
                    let metadata = crate::assets::AssetMetadata {
                        name: asset_name.clone(),
                        kind: inferred.as_ref().map(|(k, _)| k.clone()),
                        instrument_exchange_mic: effective_mic.clone(),
                        instrument_symbol: Some(base_symbol.to_string()),
                        instrument_type: inferred_instrument_type.clone(),
                        display_code: Some(base_symbol.to_string()),
                    };
                    self.asset_service
                        .get_or_create_minimal_asset(
                            &new_id,
                            Some(asset_currency.clone()),
                            Some(metadata),
                            quote_mode.clone(),
                        )
                        .await?;
                    Some(new_id)
                }
            } else {
                None
            }
        } else if let Some(asset_id) = activity.get_symbol_id().filter(|s| !s.is_empty()) {
            Some(asset_id.to_string())
        } else if !requires_symbol(&activity.activity_type) {
            None
        } else {
            return Err(ActivityError::InvalidData(
                "Symbol-required activities need either asset_id or symbol".to_string(),
            )
            .into());
        };

        // Update activity's asset with resolved asset_id
        if let Some(ref resolved_id) = resolved_asset_id {
            match activity.symbol.as_mut() {
                Some(asset) => asset.id = Some(resolved_id.clone()),
                None => {
                    activity.symbol = Some(SymbolInput {
                        id: Some(resolved_id.clone()),
                        ..Default::default()
                    });
                }
            }
        }

        // Process asset if asset_id is resolved
        if let Some(ref asset_id) = resolved_asset_id {
            let metadata = crate::assets::AssetMetadata {
                name: asset_name.clone(),
                kind: inferred.as_ref().map(|(k, _)| k.clone()),
                instrument_exchange_mic: exchange_mic.clone(),
                instrument_symbol: symbol.as_deref().map(|s| {
                    parse_symbol_with_exchange_suffix(s).0.to_string()
                }),
                instrument_type: inferred_instrument_type.clone(),
                display_code: symbol.as_deref().map(|s| {
                    parse_symbol_with_exchange_suffix(s).0.to_string()
                }),
            };
            let asset = self
                .asset_service
                .get_or_create_minimal_asset(
                    asset_id,
                    Some(asset_currency.clone()),
                    Some(metadata),
                    quote_mode.clone(),
                )
                .await?;

            // Update asset quote mode if specified
            if let Some(ref mode) = quote_mode {
                let requested_mode = mode.to_uppercase();
                let current_mode = asset.quote_mode.as_db_str();
                if requested_mode != current_mode {
                    self.asset_service
                        .update_quote_mode(&asset.id, &requested_mode)
                        .await?;
                }

                if requested_mode == "MANUAL" {
                    if let Some(Some(unit_price)) = activity.unit_price {
                        self.create_manual_quote_from_activity(
                            asset_id,
                            unit_price,
                            &currency,
                            &activity.activity_date,
                        )
                        .await?;
                    }
                }
            }

            if activity.currency.is_empty() {
                activity.currency = asset.quote_ccy.clone();
            }

            if activity.currency != account_currency {
                self.fx_service
                    .register_currency_pair(activity.currency.as_str(), account_currency.as_str())
                    .await?;
            }

            if asset.quote_ccy != account_currency && asset.quote_ccy != activity.currency {
                self.fx_service
                    .register_currency_pair(asset.quote_ccy.as_str(), account_currency.as_str())
                    .await?;
            }
        } else {
            if activity.currency.is_empty() {
                activity.currency =
                    self.resolve_activity_currency("", None, &account_currency);
            }

            if activity.currency != account_currency {
                self.fx_service
                    .register_currency_pair(activity.currency.as_str(), account_currency.as_str())
                    .await?;
            }
        }

        // Normalize minor currency units
        if get_normalization_rule(&activity.currency).is_some() {
            if let Some(Some(unit_price)) = activity.unit_price {
                let (normalized_price, _) = normalize_amount(unit_price, &activity.currency);
                activity.unit_price = Some(Some(normalized_price));
            }
            if let Some(Some(amount)) = activity.amount {
                let (normalized_amount, _) = normalize_amount(amount, &activity.currency);
                activity.amount = Some(Some(normalized_amount));
            }
            if let Some(Some(fee)) = activity.fee {
                let (normalized_fee, normalized_currency) =
                    normalize_amount(fee, &activity.currency);
                activity.fee = Some(Some(normalized_fee));
                activity.currency = normalized_currency.to_string();
            } else {
                let (_, normalized_currency) =
                    normalize_amount(rust_decimal::Decimal::ZERO, &activity.currency);
                activity.currency = normalized_currency.to_string();
            }
        }

        Ok(activity)
    }

    /// Builds an AssetSpec from a NewActivity.
    /// Returns None for cash activities that don't need an asset.
    fn build_asset_spec(
        &self,
        activity: &NewActivity,
        account: &Account,
        symbol_mic_cache: &HashMap<String, Option<String>>,
    ) -> Result<Option<crate::assets::AssetSpec>> {
        use crate::assets::{parse_crypto_pair_symbol, AssetSpec};

        let base_ccy = self.account_service.get_base_currency().unwrap_or_default();
        let account_currency = resolve_currency(&[&account.currency, &base_ccy]);

        let symbol = match activity.get_symbol_code() {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => {
                // No symbol provided - check if we have an asset_id directly (UUID)
                if let Some(asset_id) = activity.get_symbol_id() {
                    if !asset_id.is_empty() {
                        // asset_id is a UUID; look up the existing asset to build spec
                        let currency = if !activity.currency.is_empty() {
                            activity.currency.clone()
                        } else {
                            account_currency.clone()
                        };

                        let quote_mode = activity.get_quote_mode().and_then(|s| {
                            match s.to_uppercase().as_str() {
                                "MARKET" => Some(QuoteMode::Market),
                                "MANUAL" => Some(QuoteMode::Manual),
                                _ => None,
                            }
                        });

                        return Ok(Some(AssetSpec {
                            id: Some(asset_id.to_string()),
                            display_code: None,
                            instrument_symbol: None,
                            instrument_exchange_mic: None,
                            instrument_type: None,
                            quote_ccy: currency,
                            kind: AssetKind::Investment,
                            quote_mode,
                            name: activity.get_name().map(|s| s.to_string()),
                        }));
                    }
                }
                // Symbol-optional types with no symbol → no asset needed
                if !requires_symbol(&activity.activity_type) {
                    return Ok(None);
                }
                return Err(ActivityError::InvalidData(
                    "Symbol-required activity needs symbol or asset_id".to_string(),
                )
                .into());
            }
        };

        // Strip Yahoo suffix from symbol (e.g. GOOG.TO → GOOG + XTSE)
        let (base_symbol, suffix_mic) = parse_symbol_with_exchange_suffix(&symbol);

        // Get exchange MIC: prefer explicit value, then cache, then suffix-derived
        let exchange_mic = activity
            .get_exchange_mic()
            .map(|s| s.to_string())
            .or_else(|| symbol_mic_cache.get(&symbol).cloned().flatten())
            .or_else(|| suffix_mic.map(|s| s.to_string()));

        // Determine currency
        let currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account_currency.clone()
        };

        // Infer asset kind and instrument type using base symbol
        let (kind, instrument_type) =
            self.infer_asset_kind(base_symbol, exchange_mic.as_deref(), activity.get_kind_hint());

        // Crypto/FX assets don't have exchange MICs — clear any that leaked from frontend/suffix
        let is_crypto = instrument_type.as_ref() == Some(&InstrumentType::Crypto);
        let exchange_mic = if is_crypto { None } else { exchange_mic };

        // For crypto, use the quote currency from the pair if available
        let asset_currency = if is_crypto {
            parse_crypto_pair_symbol(base_symbol)
                .map(|(_, quote)| quote)
                .unwrap_or_else(|| currency.clone())
        } else {
            currency.clone()
        };

        // For crypto pairs (e.g. BTC-USD), normalize to base symbol (BTC)
        let normalized_symbol = if is_crypto {
            parse_crypto_pair_symbol(base_symbol)
                .map(|(base, _)| base)
                .unwrap_or_else(|| base_symbol.to_string())
        } else {
            base_symbol.to_string()
        };

        // Look up existing asset by instrument fields to get its UUID
        let existing_id = self.find_existing_asset_id(
            &normalized_symbol,
            exchange_mic.as_deref(),
            instrument_type.as_ref(),
        );

        // Parse quote mode if provided
        let quote_mode = activity.get_quote_mode().and_then(|s| {
            match s.to_uppercase().as_str() {
                "MARKET" => Some(QuoteMode::Market),
                "MANUAL" => Some(QuoteMode::Manual),
                _ => None,
            }
        });

        Ok(Some(AssetSpec {
            id: existing_id,
            display_code: Some(normalized_symbol.clone()),
            instrument_symbol: Some(normalized_symbol.clone()),
            instrument_exchange_mic: exchange_mic,
            instrument_type,
            quote_ccy: asset_currency,
            kind,
            quote_mode,
            name: activity.get_name().map(|s| s.to_string()),
        }))
    }

    /// Validates currency codes on an activity, marking invalid if malformed.
    fn validate_currency(&self, activity: &mut ActivityImport, account_currency: &str) {
        if activity.currency.is_empty() {
            activity.is_valid = false;
            let mut errors = activity.errors.take().unwrap_or_default();
            errors
                .entry("currency".to_string())
                .or_default()
                .push("Activity currency is missing in the import data.".to_string());
            activity.errors = Some(errors);
        } else if activity.currency != account_currency {
            let from = account_currency;
            let to = &activity.currency;
            if from.len() != 3
                || !from.chars().all(|c| c.is_alphabetic())
                || to.len() != 3
                || !to.chars().all(|c| c.is_alphabetic())
            {
                activity.is_valid = false;
                let mut errors = activity.errors.take().unwrap_or_default();
                errors
                    .entry("currency".to_string())
                    .or_default()
                    .push(format!("Invalid currency code: {} or {}", from, to));
                activity.errors = Some(errors);
            }
        }
    }
}

#[async_trait::async_trait]
impl ActivityServiceTrait for ActivityService {
    fn get_activity(&self, activity_id: &str) -> Result<Activity> {
        self.activity_repository.get_activity(activity_id)
    }

    /// Retrieves all activities
    fn get_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_activities()
    }

    /// Retrieves activities by account ID
    fn get_activities_by_account_id(&self, account_id: &str) -> Result<Vec<Activity>> {
        self.activity_repository
            .get_activities_by_account_id(account_id)
    }

    /// Retrieves activities by account IDs
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>> {
        self.activity_repository
            .get_activities_by_account_ids(account_ids)
    }

    /// Retrieves all trading activities
    fn get_trading_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_trading_activities()
    }

    /// Retrieves all income activities
    fn get_income_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_income_activities()
    }

    /// Searches activities with various filters and pagination
    fn search_activities(
        &self,
        page: i64,
        page_size: i64,
        account_id_filter: Option<Vec<String>>,
        activity_type_filter: Option<Vec<String>>,
        asset_id_keyword: Option<String>,
        sort: Option<Sort>,
        needs_review_filter: Option<bool>,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
    ) -> Result<ActivitySearchResponse> {
        self.activity_repository.search_activities(
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
            needs_review_filter,
            date_from,
            date_to,
        )
    }

    /// Creates a new activity
    async fn create_activity(&self, activity: NewActivity) -> Result<Activity> {
        let prepared = self.prepare_new_activity(activity).await?;
        let created = self.activity_repository.create_activity(prepared).await?;

        // Emit domain event after successful creation
        let account_ids = vec![created.account_id.clone()];
        let asset_ids = created.asset_id.clone().into_iter().collect();
        let currencies = vec![created.currency.clone()];
        self.event_sink
            .emit(DomainEvent::activities_changed(
                account_ids,
                asset_ids,
                currencies,
            ));

        Ok(created)
    }

    /// Updates an existing activity
    async fn update_activity(&self, activity: ActivityUpdate) -> Result<Activity> {
        // Get the existing activity BEFORE the update to capture old account_id and asset_id
        // This ensures we emit events for both old and new locations if they changed
        let existing = self.activity_repository.get_activity(&activity.id)?;

        let prepared = self.prepare_update_activity(activity).await?;
        let updated = self.activity_repository.update_activity(prepared).await?;

        // Emit domain event after successful update
        // Include BOTH old and new account_ids and asset_ids (if they differ)
        let mut account_ids_set: HashSet<String> = HashSet::new();
        let mut asset_ids_set: HashSet<String> = HashSet::new();
        let mut currencies_set: HashSet<String> = HashSet::new();

        // Add old values
        account_ids_set.insert(existing.account_id.clone());
        if let Some(ref old_asset_id) = existing.asset_id {
            asset_ids_set.insert(old_asset_id.clone());
        }
        currencies_set.insert(existing.currency.clone());

        // Add new values
        account_ids_set.insert(updated.account_id.clone());
        if let Some(ref new_asset_id) = updated.asset_id {
            asset_ids_set.insert(new_asset_id.clone());
        }
        currencies_set.insert(updated.currency.clone());

        let account_ids: Vec<String> = account_ids_set.into_iter().collect();
        let asset_ids: Vec<String> = asset_ids_set.into_iter().collect();
        let currencies: Vec<String> = currencies_set.into_iter().collect();
        self.event_sink
            .emit(DomainEvent::activities_changed(
                account_ids,
                asset_ids,
                currencies,
            ));

        Ok(updated)
    }

    /// Deletes an activity
    async fn delete_activity(&self, activity_id: String) -> Result<Activity> {
        let deleted = self
            .activity_repository
            .delete_activity(activity_id)
            .await?;

        // Emit domain event after successful deletion
        let account_ids = vec![deleted.account_id.clone()];
        let asset_ids = deleted.asset_id.clone().into_iter().collect();
        let currencies = vec![deleted.currency.clone()];
        self.event_sink
            .emit(DomainEvent::activities_changed(
                account_ids,
                asset_ids,
                currencies,
            ));

        Ok(deleted)
    }

    async fn bulk_mutate_activities(
        &self,
        mut request: ActivityBulkMutationRequest,
    ) -> Result<ActivityBulkMutationResult> {
        let mut errors: Vec<ActivityBulkMutationError> = Vec::new();
        let mut prepared_creates: Vec<NewActivity> = Vec::new();
        let mut prepared_updates: Vec<ActivityUpdate> = Vec::new();
        let mut valid_delete_ids: Vec<String> = Vec::new();

        // Capture OLD account_ids and asset_ids BEFORE updates/deletes for proper event emission
        // This ensures that when an activity moves accounts or changes assets, both old and new locations get recalculated
        let mut old_account_ids: HashSet<String> = HashSet::new();
        let mut old_asset_ids: HashSet<String> = HashSet::new();
        let mut old_currencies: HashSet<String> = HashSet::new();

        // Use prepare_activities for all creates at once
        if !request.creates.is_empty() {
            // Get account from first create (all creates in a bulk request typically share the same account)
            let account_id = &request.creates[0].account_id;
            let account = self.account_service.get_account(account_id)?;

            // Store temp_ids for error reporting (prepare_activities uses indices)
            let temp_ids: Vec<Option<String>> = request.creates.iter().map(|a| a.id.clone()).collect();

            let prepare_result = self.prepare_activities(request.creates, &account).await?;

            // Convert preparation errors to bulk mutation errors
            for (idx, error) in prepare_result.errors {
                errors.push(ActivityBulkMutationError {
                    id: temp_ids.get(idx).cloned().flatten(),
                    action: "create".to_string(),
                    message: error,
                });
            }

            // Extract prepared activities
            prepared_creates = prepare_result
                .prepared
                .into_iter()
                .map(|p| p.activity)
                .collect();
        }

        // Batch resolve symbols for updates that don't have exchange_mic
        let update_symbols_to_resolve: HashSet<String> = request
            .updates
            .iter()
            .filter_map(|a| {
                let symbol = a.get_symbol_code();
                let has_mic = a.get_exchange_mic().is_some();
                let is_cash = symbol.map(|s| s.starts_with("CASH:")).unwrap_or(false);
                if symbol.is_some() && !has_mic && !is_cash {
                    symbol.map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect();

        let update_symbol_mic_cache = if !update_symbols_to_resolve.is_empty() {
            let base_currency = self.get_base_currency_or_usd();
            self.resolve_symbols_batch_single_currency(update_symbols_to_resolve, &base_currency)
                .await
        } else {
            HashMap::new()
        };

        // Update updates with resolved exchange_mic
        for activity in &mut request.updates {
            if let Some(symbol) = activity.get_symbol_code() {
                let has_mic = activity.get_exchange_mic().is_some();
                if !has_mic {
                    if let Some(mic) = update_symbol_mic_cache.get(symbol).cloned().flatten() {
                        if let Some(ref mut asset) = activity.symbol {
                            asset.exchange_mic = Some(mic);
                        }
                    }
                }
            }
        }

        // For updates: capture OLD values before preparing the update
        for update_request in request.updates {
            let target_id = update_request.id.clone();
            // Get the existing activity to capture old account_id and asset_id
            match self.activity_repository.get_activity(&target_id) {
                Ok(existing) => {
                    old_account_ids.insert(existing.account_id.clone());
                    if let Some(ref asset_id) = existing.asset_id {
                        old_asset_ids.insert(asset_id.clone());
                    }
                    old_currencies.insert(existing.currency.clone());
                }
                Err(_) => {
                    // Activity doesn't exist - will fail during prepare_update_activity
                }
            }
            match self.prepare_update_activity(update_request).await {
                Ok(prepared) => prepared_updates.push(prepared),
                Err(err) => {
                    errors.push(ActivityBulkMutationError {
                        id: Some(target_id),
                        action: "update".to_string(),
                        message: err.to_string(),
                    });
                }
            }
        }

        // For deletes: capture OLD values before deletion
        for delete_id in request.delete_ids {
            match self.activity_repository.get_activity(&delete_id) {
                Ok(existing) => {
                    // Capture old values for event emission
                    old_account_ids.insert(existing.account_id.clone());
                    if let Some(ref asset_id) = existing.asset_id {
                        old_asset_ids.insert(asset_id.clone());
                    }
                    old_currencies.insert(existing.currency.clone());
                    valid_delete_ids.push(delete_id.clone());
                }
                Err(err) => {
                    errors.push(ActivityBulkMutationError {
                        id: Some(delete_id),
                        action: "delete".to_string(),
                        message: err.to_string(),
                    });
                }
            }
        }

        if !errors.is_empty() {
            let outcome = ActivityBulkMutationResult {
                errors,
                ..Default::default()
            };
            return Ok(outcome);
        }

        let mut persisted = self
            .activity_repository
            .bulk_mutate_activities(prepared_creates, prepared_updates, valid_delete_ids)
            .await?;

        persisted.errors = errors;

        // Emit ONE aggregated domain event for all mutations
        // Start with OLD values captured before updates/deletes (to recalculate old locations)
        let mut account_ids_set: HashSet<String> = old_account_ids;
        let mut asset_ids_set: HashSet<String> = old_asset_ids;
        let mut currencies_set: HashSet<String> = HashSet::new();

        // Add NEW values from created and updated activities
        for activity in &persisted.created {
            account_ids_set.insert(activity.account_id.clone());
            if let Some(ref asset_id) = activity.asset_id {
                asset_ids_set.insert(asset_id.clone());
            }
            currencies_set.insert(activity.currency.clone());
        }
        for activity in &persisted.updated {
            account_ids_set.insert(activity.account_id.clone());
            if let Some(ref asset_id) = activity.asset_id {
                asset_ids_set.insert(asset_id.clone());
            }
            currencies_set.insert(activity.currency.clone());
        }
        // Note: deleted activities' old values are already in the sets from old_account_ids/old_asset_ids

        // Only emit if there were actual changes
        if !account_ids_set.is_empty() {
            let account_ids: Vec<String> = account_ids_set.into_iter().collect();
            let asset_ids: Vec<String> = asset_ids_set.into_iter().collect();
            let currencies: Vec<String> = currencies_set.into_iter().collect();
            self.event_sink
                .emit(DomainEvent::activities_changed(
                    account_ids,
                    asset_ids,
                    currencies,
                ));
        }

        Ok(persisted)
    }

    /// Verifies the activities import from CSV file (read-only validation).
    /// This performs read-only validation without creating assets or registering FX pairs.
    /// Asset creation happens in import_activities when the user confirms the import.
    ///
    /// Symbol resolution is activity-type-driven:
    /// - Symbol-optional types with empty/cash symbols skip resolution (pure cash)
    /// - Symbol-required types need a valid symbol: searched in local assets, then market data
    /// - Resolved exchange_mic + base symbol are stored on the activity for the import step
    async fn check_activities_import(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>> {
        let account: Account = self.account_service.get_account(&account_id)?;
        let base_ccy = self.account_service.get_base_currency().unwrap_or_default();
        let account_currency = resolve_currency(&[&account.currency, &base_ccy]);

        // Resolve (symbol, currency) pairs for activities that need asset resolution
        let symbol_currency_pairs: HashSet<(String, String)> = activities
            .iter()
            .filter(|a| {
                let sym = a.symbol.trim();
                !sym.is_empty()
                    && matches!(
                        classify_import_activity(
                            &a.activity_type,
                            sym,
                            a.quantity,
                            a.unit_price,
                        ),
                        ImportSymbolDisposition::ResolveAsset
                    )
                    && a.exchange_mic.is_none()
            })
            .map(|a| {
                let ccy = if a.currency.is_empty() {
                    account_currency.clone()
                } else {
                    a.currency.clone()
                };
                (a.symbol.clone(), ccy)
            })
            .collect();

        let symbol_mic_cache = self
            .resolve_symbols_batch(symbol_currency_pairs)
            .await;

        let mut activities_with_status: Vec<ActivityImport> = Vec::new();

        for mut activity in activities {
            activity.id = Some(Uuid::new_v4().to_string());
            if activity.account_name.is_none() {
                activity.account_name = Some(account.name.clone());
            }
            if activity.account_id.is_none() {
                activity.account_id = Some(account_id.clone());
            }

            let symbol = activity.symbol.trim().to_string();

            // Classify the activity based on type, symbol, quantity, and price
            match classify_import_activity(
                &activity.activity_type,
                &symbol,
                activity.quantity,
                activity.unit_price,
            ) {
                ImportSymbolDisposition::CashMovement => {
                    activity.symbol = String::new();
                    if activity.currency.is_empty() {
                        activity.currency = account_currency.clone();
                    }
                    activity.is_valid = true;
                    self.validate_currency(&mut activity, &account_currency);
                    activities_with_status.push(activity);
                    continue;
                }
                ImportSymbolDisposition::NeedsReview(msg) => {
                    activity.is_valid = false;
                    let mut errors = std::collections::HashMap::new();
                    errors.insert("symbol".to_string(), vec![msg]);
                    activity.errors = Some(errors);
                    activities_with_status.push(activity);
                    continue;
                }
                ImportSymbolDisposition::ResolveAsset => {
                    // Symbol-required types with empty symbol → error
                    if symbol.is_empty() {
                        activity.is_valid = false;
                        let mut errors = std::collections::HashMap::new();
                        errors.insert(
                            "symbol".to_string(),
                            vec![format!(
                                "Symbol is required for {} activities.",
                                &activity.activity_type
                            )],
                        );
                        activity.errors = Some(errors);
                        activities_with_status.push(activity);
                        continue;
                    }
                    // Garbage symbols on symbol-required types → error
                    if is_garbage_symbol(&symbol) {
                        activity.is_valid = false;
                        let mut errors = std::collections::HashMap::new();
                        errors.insert(
                            "symbol".to_string(),
                            vec![format!(
                                "Invalid symbol '{}'. Please correct or remove it.",
                                &symbol
                            )],
                        );
                        activity.errors = Some(errors);
                        activities_with_status.push(activity);
                        continue;
                    }
                    // Fall through to symbol resolution below
                }
            }

            // Get exchange_mic: prefer already-set value (from prior check), then cache
            let resolve_ccy = if activity.currency.is_empty() {
                account_currency.clone()
            } else {
                activity.currency.clone()
            };
            let exchange_mic = activity
                .exchange_mic
                .clone()
                .or_else(|| {
                    symbol_mic_cache
                        .get(&(activity.symbol.clone(), resolve_ccy))
                        .cloned()
                        .flatten()
                });

            // Strip Yahoo suffix to get base symbol (e.g. GOOG.TO → GOOG)
            let (base_symbol, suffix_mic) = parse_symbol_with_exchange_suffix(&symbol);
            let resolved_mic = exchange_mic.or_else(|| suffix_mic.map(|s| s.to_string()));

            // Infer asset kind and instrument type using base symbol and resolved MIC
            let (inferred_kind, inferred_instrument_type) =
                self.infer_asset_kind(base_symbol, resolved_mic.as_deref(), None);

            // Crypto/FX assets don't have exchange MICs
            let is_crypto = inferred_instrument_type.as_ref() == Some(&InstrumentType::Crypto);
            let resolved_mic = if is_crypto { None } else { resolved_mic };

            // Equities (Investment + Equity instrument) must have a resolved exchange MIC
            let is_equity = inferred_kind == AssetKind::Investment
                && inferred_instrument_type.as_ref() == Some(&InstrumentType::Equity);
            if is_equity && resolved_mic.is_none() {
                activity.is_valid = false;
                let mut errors = std::collections::HashMap::new();
                errors.insert(
                    "symbol".to_string(),
                    vec![format!(
                        "Could not find '{}' in market data. Please search for the correct ticker symbol.",
                        &activity.symbol
                    )],
                );
                activity.errors = Some(errors);
                activities_with_status.push(activity);
                continue;
            }

            // Store resolved data back on activity for import step
            activity.exchange_mic = resolved_mic.clone();
            activity.symbol = base_symbol.to_string();

            // Read-only: check if asset exists for name/currency enrichment
            let mut asset_currency: Option<String> = None;
            let existing_id = self.find_existing_asset_id(
                base_symbol,
                resolved_mic.as_deref(),
                inferred_instrument_type.as_ref(),
            );
            if let Some(ref id) = existing_id {
                if let Ok(asset) = self.asset_service.get_asset_by_id(id) {
                    activity.symbol_name = asset.name;
                    asset_currency = Some(asset.quote_ccy.clone());
                } else {
                    activity.symbol_name = Some(base_symbol.to_string());
                }
            } else {
                activity.symbol_name = Some(base_symbol.to_string());
            }

            if activity.currency.is_empty() {
                activity.currency = self.resolve_activity_currency(
                    "",
                    asset_currency.as_deref(),
                    &account_currency,
                );
            }

            activity.is_valid = true;
            self.validate_currency(&mut activity, &account_currency);
            activities_with_status.push(activity);
        }

        Ok(activities_with_status)
    }

    /// Imports activities after validation
    async fn import_activities(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<ImportActivitiesResult> {
        let account = self.account_service.get_account(&account_id)?;
        let total_count = activities.len() as u32;

        // Create import run at the start
        let import_run = ImportRun::new(
            account_id.clone(),
            "CSV".to_string(),
            ImportRunType::Import,
            ImportRunMode::Initial,
            ReviewMode::Never,
        );
        let import_run_id = import_run.id.clone();

        // Try to persist the import run if repository is available
        if let Some(ref repo) = self.import_run_repository {
            if let Err(e) = repo.create(import_run.clone()).await {
                warn!("Failed to create import run record: {}", e);
                // Continue with import even if tracking fails
            }
        }

        let mut validated_activities = self
            .check_activities_import(account_id.clone(), activities)
            .await?;

        let has_errors = validated_activities.iter().any(|activity| {
            !activity.is_valid
                || activity
                    .errors
                    .as_ref()
                    .is_some_and(|errors| !errors.is_empty())
        });

        if has_errors {
            // Mark import run as failed due to validation errors
            let skipped_count = validated_activities.iter().filter(|a| !a.is_valid).count() as u32;

            if let Some(ref repo) = self.import_run_repository {
                let mut failed_run = import_run;
                failed_run.fail("Validation errors in import data".to_string());
                failed_run.summary = Some(ImportRunSummary {
                    fetched: total_count,
                    inserted: 0,
                    updated: 0,
                    skipped: skipped_count,
                    warnings: 0,
                    errors: skipped_count,
                    removed: 0,
                    assets_created: 0,
                });
                if let Err(e) = repo.update(failed_run).await {
                    warn!("Failed to update import run with failure status: {}", e);
                }
            }

            return Ok(ImportActivitiesResult {
                activities: validated_activities,
                import_run_id,
                summary: ImportActivitiesSummary {
                    total: total_count,
                    imported: 0,
                    skipped: skipped_count,
                    duplicates: 0,
                    assets_created: 0,
                    success: false,
                },
            });
        }

        // Convert valid ActivityImport → NewActivity using From impl
        let mut import_index_map: Vec<usize> = Vec::new();
        let new_activities: Vec<NewActivity> = validated_activities
            .iter()
            .enumerate()
            .filter_map(|(idx, activity)| {
                if activity.is_valid {
                    import_index_map.push(idx);
                    Some(activity.clone().into())
                } else {
                    None
                }
            })
            .collect();

        // Use prepare_activities (handles asset creation + FX registration)
        let prepare_result = self.prepare_activities(new_activities, &account).await?;

        if !prepare_result.errors.is_empty() {
            for (idx, error) in prepare_result.errors.iter() {
                if let Some(import_idx) = import_index_map.get(*idx).copied() {
                    let activity = &mut validated_activities[import_idx];
                    activity.is_valid = false;
                    let mut errors = activity.errors.take().unwrap_or_default();
                    errors
                        .entry(activity.symbol.clone())
                        .or_default()
                        .push(error.clone());
                    activity.errors = Some(errors);
                }
            }

            let skipped_count =
                validated_activities.iter().filter(|a| !a.is_valid).count() as u32;

            if let Some(ref repo) = self.import_run_repository {
                let mut failed_run = import_run;
                failed_run.fail("Preparation errors in import data".to_string());
                failed_run.summary = Some(ImportRunSummary {
                    fetched: total_count,
                    inserted: 0,
                    updated: 0,
                    skipped: skipped_count,
                    warnings: 0,
                    errors: skipped_count,
                    removed: 0,
                    assets_created: prepare_result.assets_created,
                });
                if let Err(e) = repo.update(failed_run).await {
                    warn!("Failed to update import run with failure status: {}", e);
                }
            }

            return Ok(ImportActivitiesResult {
                activities: validated_activities,
                import_run_id,
                summary: ImportActivitiesSummary {
                    total: total_count,
                    imported: 0,
                    skipped: skipped_count,
                    duplicates: 0,
                    assets_created: prepare_result.assets_created,
                    success: false,
                },
            });
        }

        let assets_created_count = prepare_result.assets_created;

        // Extract activities and link transfer pairs
        let mut activities_to_insert: Vec<NewActivity> = prepare_result
            .prepared
            .into_iter()
            .map(|p| p.activity)
            .collect();

        self.link_imported_transfer_pairs(&validated_activities, &mut activities_to_insert);

        // Compute idempotency keys and deduplicate
        let mut duplicate_count: u32 = 0;
        {
            // 1. Compute keys for each activity
            let mut keys: Vec<Option<String>> =
                Vec::with_capacity(activities_to_insert.len());
            for activity in &mut activities_to_insert {
                let date = DateTime::parse_from_rfc3339(&activity.activity_date)
                    .map(|dt| dt.with_timezone(&Utc))
                    .or_else(|_| {
                        NaiveDate::parse_from_str(&activity.activity_date, "%Y-%m-%d").map(|d| {
                            Utc.from_utc_datetime(&d.and_hms_opt(0, 0, 0).unwrap_or_default())
                        })
                    })
                    .ok();

                if let Some(date) = date {
                    let key = compute_idempotency_key(
                        &activity.account_id,
                        &activity.activity_type,
                        &date,
                        activity.get_symbol_id(),
                        activity.quantity,
                        activity.unit_price,
                        activity.amount,
                        &activity.currency,
                        None,
                        activity.notes.as_deref(),
                    );
                    activity.idempotency_key = Some(key.clone());
                    keys.push(Some(key));
                } else {
                    keys.push(None);
                }
            }

            // 2. Within-batch dedup: mark later occurrences
            let mut seen_keys: HashSet<String> = HashSet::new();
            let mut batch_dup_indices: HashSet<usize> = HashSet::new();
            for (i, key) in keys.iter().enumerate() {
                if let Some(ref k) = key {
                    if !seen_keys.insert(k.clone()) {
                        batch_dup_indices.insert(i);
                    }
                }
            }

            // 3. DB dedup: check existing keys
            let unique_keys: Vec<String> = seen_keys.into_iter().collect();
            let existing = if !unique_keys.is_empty() {
                self.check_existing_duplicates(unique_keys).unwrap_or_default()
            } else {
                HashMap::new()
            };

            // 4. Collect all duplicate indices (batch + DB)
            let mut dup_indices: HashSet<usize> = batch_dup_indices;
            for (i, key) in keys.iter().enumerate() {
                if let Some(ref k) = key {
                    if existing.contains_key(k) {
                        dup_indices.insert(i);
                    }
                }
            }

            // 5. Mark duplicates in validated_activities and remove from insert list
            if !dup_indices.is_empty() {
                duplicate_count = dup_indices.len() as u32;
                // Map back to validated_activities indices via import_index_map
                for &insert_idx in &dup_indices {
                    if let Some(&import_idx) = import_index_map.get(insert_idx) {
                        let activity = &mut validated_activities[import_idx];
                        activity.is_valid = false;
                        let mut errors = activity.errors.take().unwrap_or_default();
                        errors
                            .entry("_duplicate".to_string())
                            .or_default()
                            .push("Duplicate activity already exists".to_string());
                        activity.errors = Some(errors);
                    }
                }
                // Remove duplicates from insert list (reverse order to preserve indices)
                let mut sorted_dups: Vec<usize> = dup_indices.into_iter().collect();
                sorted_dups.sort_unstable_by(|a, b| b.cmp(a));
                for idx in sorted_dups {
                    activities_to_insert.remove(idx);
                }
            }
        }

        // Collect unique asset_ids and currencies before consuming activities
        let asset_ids: Vec<String> = activities_to_insert
            .iter()
            .filter_map(|a| a.get_symbol_id().map(|s| s.to_string()))
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let currencies: Vec<String> = activities_to_insert
            .iter()
            .map(|a| a.currency.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        let count = self
            .activity_repository
            .create_activities(activities_to_insert)
            .await?;
        debug!("Successfully imported {} activities", count);

        // Emit domain event after successful import
        if count > 0 {
            self.event_sink.emit(DomainEvent::activities_changed(
                vec![account_id.clone()],
                asset_ids,
                currencies,
            ));
        }

        // Mark import run as successful
        if let Some(ref repo) = self.import_run_repository {
            let mut success_run = import_run;
            success_run.complete();
            success_run.summary = Some(ImportRunSummary {
                fetched: total_count,
                inserted: count as u32,
                updated: 0,
                skipped: duplicate_count,
                warnings: 0,
                errors: 0,
                removed: 0,
                assets_created: assets_created_count,
            });
            if let Err(e) = repo.update(success_run).await {
                warn!("Failed to update import run with success status: {}", e);
            }
        }

        Ok(ImportActivitiesResult {
            activities: validated_activities,
            import_run_id,
            summary: ImportActivitiesSummary {
                total: total_count,
                imported: count as u32,
                skipped: duplicate_count,
                duplicates: duplicate_count,
                assets_created: assets_created_count,
                success: true,
            },
        })
    }

    /// Gets the first activity date for given account IDs
    fn get_first_activity_date(
        &self,
        account_ids: Option<&[String]>,
    ) -> Result<Option<chrono::DateTime<Utc>>> {
        self.activity_repository
            .get_first_activity_date(account_ids)
    }

    /// Gets the import mapping for a given account ID
    fn get_import_mapping(&self, account_id: String) -> Result<ImportMappingData> {
        let mapping = self.activity_repository.get_import_mapping(&account_id)?;

        let mut result = match mapping {
            Some(m) => m.to_mapping_data().map_err(|e| {
                ActivityError::InvalidData(format!("Failed to parse mapping data: {}", e))
            })?,
            None => ImportMappingData::default(),
        };
        result.account_id = account_id;
        Ok(result)
    }

    /// Saves or updates an import mapping
    async fn save_import_mapping(
        &self,
        mapping_data: ImportMappingData,
    ) -> Result<ImportMappingData> {
        let mapping = ImportMapping::from_mapping_data(&mapping_data)?;
        self.activity_repository
            .save_import_mapping(&mapping)
            .await?;
        Ok(mapping_data)
    }

    /// Checks for existing activities with the given idempotency keys.
    ///
    /// Returns a map of {idempotency_key: existing_activity_id} for keys that already exist.
    fn check_existing_duplicates(
        &self,
        idempotency_keys: Vec<String>,
    ) -> Result<HashMap<String, String>> {
        self.activity_repository
            .check_existing_duplicates(&idempotency_keys)
    }

    fn parse_csv(
        &self,
        content: &[u8],
        config: &csv_parser::ParseConfig,
    ) -> Result<csv_parser::ParsedCsvResult> {
        csv_parser::parse_csv(content, config)
    }

    /// Upserts multiple activities (insert or update on conflict).
    /// Used by broker sync to efficiently sync activities.
    /// Emits a single aggregated ActivitiesChanged event for all upserted activities.
    async fn upsert_activities_bulk(
        &self,
        activities: Vec<ActivityUpsert>,
    ) -> Result<BulkUpsertResult> {
        if activities.is_empty() {
            return Ok(BulkUpsertResult::default());
        }

        // Collect unique account_ids, asset_ids, and currencies for the event before the upsert
        let account_ids: Vec<String> = activities
            .iter()
            .map(|a| a.account_id.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        let asset_ids: Vec<String> = activities
            .iter()
            .filter_map(|a| a.asset_id.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let currencies: Vec<String> = activities
            .iter()
            .map(|a| a.currency.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        // Perform the upsert via repository
        let result = self.activity_repository.bulk_upsert(activities).await?;

        // Emit single aggregated event if any activities were affected
        if result.upserted > 0 {
            self.event_sink
                .emit(DomainEvent::activities_changed(
                    account_ids,
                    asset_ids,
                    currencies,
                ));
        }

        Ok(result)
    }

    async fn prepare_activities(
        &self,
        activities: Vec<NewActivity>,
        account: &Account,
    ) -> Result<PrepareActivitiesResult> {
        use crate::assets::AssetSpec;

        if activities.is_empty() {
            return Ok(PrepareActivitiesResult::default());
        }

        let mut result = PrepareActivitiesResult::default();
        let base_ccy = self.account_service.get_base_currency().unwrap_or_default();
        let account_currency = resolve_currency(&[&account.currency, &base_ccy]);

        // 1. Batch resolve symbols → MICs (for securities without exchange_mic)
        let symbols_to_resolve: HashSet<String> = activities
            .iter()
            .filter_map(|a| {
                let symbol = a.get_symbol_code()?;
                let has_mic = a.get_exchange_mic().is_some();
                let is_cash = symbol.starts_with("CASH:");
                if !has_mic && !is_cash {
                    Some(symbol.to_string())
                } else {
                    None
                }
            })
            .collect();

        let symbol_mic_cache = self
            .resolve_symbols_batch_single_currency(symbols_to_resolve, &account_currency)
            .await;

        // 2. Build AssetSpecs for each activity
        let mut asset_specs: Vec<AssetSpec> = Vec::new();
        let mut activity_asset_map: Vec<Option<String>> = Vec::with_capacity(activities.len());

        for (idx, activity) in activities.iter().enumerate() {
            match self.build_asset_spec(activity, account, &symbol_mic_cache) {
                Ok(Some(spec)) => {
                    // Use spec.id if available, or instrument_key for mapping
                    let map_key = spec.id.clone().or_else(|| spec.instrument_key());
                    activity_asset_map.push(map_key);
                    asset_specs.push(spec);
                }
                Ok(None) => {
                    // Cash activities have no asset
                    activity_asset_map.push(None);
                }
                Err(e) => {
                    result.errors.push((idx, e.to_string()));
                    activity_asset_map.push(None);
                }
            }
        }

        // 3. Deduplicate specs and call ensure_assets()
        let unique_specs: Vec<AssetSpec> = asset_specs
            .into_iter()
            .fold(HashMap::new(), |mut map, spec| {
                let key = spec.id.clone().unwrap_or_else(|| {
                    spec.instrument_key().unwrap_or_default()
                });
                map.entry(key).or_insert(spec);
                map
            })
            .into_values()
            .collect();

        let ensure_result = self
            .asset_service
            .ensure_assets(unique_specs, self.activity_repository.as_ref())
            .await?;

        result.assets_created = ensure_result.created_ids.len() as u32;

        // Build reverse lookup: instrument_key → asset_id for resolving activity_asset_map entries
        let mut key_to_asset_id: HashMap<String, String> = HashMap::new();
        for asset in ensure_result.assets.values() {
            if let Some(ref key) = asset.instrument_key {
                key_to_asset_id.insert(key.clone(), asset.id.clone());
            }
        }

        // Resolve activity_asset_map entries: replace instrument_key refs with actual asset IDs
        for entry in &mut activity_asset_map {
            if let Some(ref map_key) = entry {
                // If the map_key is not a direct asset ID in ensure_result, try instrument_key lookup
                if !ensure_result.assets.contains_key(map_key) {
                    if let Some(asset_id) = key_to_asset_id.get(map_key) {
                        *entry = Some(asset_id.clone());
                    } else {
                        // Unresolved instrument_key — clear to avoid FK violation
                        warn!(
                            "Could not resolve asset for key '{}'; activity will have no linked asset",
                            map_key
                        );
                        *entry = None;
                    }
                }
            }
        }

        // 4. Collect FX pairs and call ensure_fx_pairs()
        // Include both activity currency and asset currency pairs
        let mut fx_pairs: Vec<(String, String)> = Vec::new();

        for (idx, a) in activities.iter().enumerate() {
            let activity_currency = if !a.currency.is_empty() {
                a.currency.clone()
            } else if let Some(asset_id) = activity_asset_map.get(idx).and_then(|id| id.as_ref())
            {
                ensure_result
                    .assets
                    .get(asset_id)
                    .map(|asset| asset.quote_ccy.clone())
                    .unwrap_or_else(|| account_currency.clone())
            } else {
                account_currency.clone()
            };

            // Activity currency vs account currency
            if activity_currency != account_currency {
                fx_pairs.push((activity_currency.clone(), account_currency.clone()));
            }

            // Asset currency vs account currency (when asset currency differs from both)
            if let Some(asset_id) = activity_asset_map.get(idx).and_then(|id| id.as_ref()) {
                if let Some(asset) = ensure_result.assets.get(asset_id) {
                    if asset.quote_ccy != account_currency && asset.quote_ccy != activity_currency {
                        fx_pairs.push((asset.quote_ccy.clone(), account_currency.clone()));
                    }
                }
            }
        }

        self.fx_service.ensure_fx_pairs(fx_pairs).await?;

        // 5. Build PreparedActivity for each valid activity
        for (idx, mut activity) in activities.into_iter().enumerate() {
            // Skip if we already recorded an error for this index
            if result.errors.iter().any(|(i, _)| *i == idx) {
                continue;
            }

            let resolved_asset_id = activity_asset_map.get(idx).cloned().flatten();

            // Determine FX pair needed
            let activity_currency = if !activity.currency.is_empty() {
                activity.currency.clone()
            } else if let Some(asset_id) = resolved_asset_id.as_ref() {
                ensure_result
                    .assets
                    .get(asset_id)
                    .map(|asset| asset.quote_ccy.clone())
                    .unwrap_or_else(|| account_currency.clone())
            } else {
                account_currency.clone()
            };
            let fx_pair = if activity_currency != account_currency {
                Some((activity_currency.clone(), account_currency.clone()))
            } else {
                None
            };

            // Validate the activity
            if let Err(e) = activity.validate() {
                result.errors.push((idx, e.to_string()));
                continue;
            }

            // Update activity's asset with resolved asset_id
            if let Some(ref asset_id) = resolved_asset_id {
                match activity.symbol.as_mut() {
                    Some(asset) => asset.id = Some(asset_id.clone()),
                    None => {
                        activity.symbol = Some(SymbolInput {
                            id: Some(asset_id.clone()),
                            ..Default::default()
                        });
                    }
                }
            }

            // 6. Handle manual quotes for MANUAL quote mode assets
            if let Some(ref asset_id) = resolved_asset_id {
                if let Some(asset) = ensure_result.assets.get(asset_id) {
                    if asset.quote_mode == QuoteMode::Manual {
                        if let Some(unit_price) = activity.unit_price {
                            let currency = if !activity.currency.is_empty() {
                                &activity.currency
                            } else {
                                &account_currency
                            };
                            self.create_manual_quote_from_activity(
                                asset_id,
                                unit_price,
                                currency,
                                &activity.activity_date,
                            )
                            .await?;
                        }
                    }
                }
            }

            // Ensure currency is set for cash activities or missing currency
            if activity.currency.is_empty() {
                if let Some(asset_id) = resolved_asset_id.as_ref() {
                    if let Some(asset) = ensure_result.assets.get(asset_id) {
                        activity.currency = asset.quote_ccy.clone();
                    } else {
                        activity.currency = account_currency.clone();
                    }
                } else {
                    activity.currency = account_currency.clone();
                }
            }

            // Normalize minor currency units (e.g., GBp -> GBP) and convert amounts
            if get_normalization_rule(&activity.currency).is_some() {
                if let Some(unit_price) = activity.unit_price {
                    let (normalized_price, _) = normalize_amount(unit_price, &activity.currency);
                    activity.unit_price = Some(normalized_price);
                }
                if let Some(amount) = activity.amount {
                    let (normalized_amount, _) = normalize_amount(amount, &activity.currency);
                    activity.amount = Some(normalized_amount);
                }
                if let Some(fee) = activity.fee {
                    let (normalized_fee, normalized_currency) =
                        normalize_amount(fee, &activity.currency);
                    activity.fee = Some(normalized_fee);
                    activity.currency = normalized_currency.to_string();
                } else {
                    let (_, normalized_currency) =
                        normalize_amount(Decimal::ZERO, &activity.currency);
                    activity.currency = normalized_currency.to_string();
                }
            }

            result.prepared.push(PreparedActivity {
                activity,
                resolved_asset_id,
                fx_pair,
            });
        }

        Ok(result)
    }
}

// Private helper methods for ActivityService
impl ActivityService {
    /// Links matching TRANSFER_IN and TRANSFER_OUT activities by setting a shared source_group_id.
    /// Matches are based on same date, currency, symbol, and amount.
    fn link_imported_transfer_pairs(
        &self,
        validated_activities: &[ActivityImport],
        new_activities: &mut [NewActivity],
    ) {
        #[derive(Debug, Clone, PartialEq, Eq, Hash)]
        struct TransferMatchKey {
            date: NaiveDate,
            currency: String,
            symbol: String,
            amount: Decimal,
        }

        fn parse_activity_date(date_str: &str) -> Option<NaiveDate> {
            if let Ok(dt) = DateTime::parse_from_rfc3339(date_str) {
                return Some(dt.naive_utc().date());
            }
            NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()
        }

        fn transfer_match_key(activity: &ActivityImport) -> Option<TransferMatchKey> {
            let date = parse_activity_date(&activity.date)?;
            let amount = activity.amount.or_else(|| {
                let quantity = activity.quantity?;
                let unit_price = activity.unit_price?;
                Some(quantity * unit_price)
            })?;
            if amount.is_zero() {
                return None;
            }
            Some(TransferMatchKey {
                date,
                currency: activity.currency.clone(),
                symbol: activity.symbol.clone(),
                amount,
            })
        }

        let mut transfer_in: HashMap<TransferMatchKey, Vec<usize>> = HashMap::new();
        let mut transfer_out: HashMap<TransferMatchKey, Vec<usize>> = HashMap::new();

        for (idx, activity) in validated_activities.iter().enumerate() {
            let activity_type = activity.activity_type.as_str();
            if activity_type != ACTIVITY_TYPE_TRANSFER_IN
                && activity_type != ACTIVITY_TYPE_TRANSFER_OUT
            {
                continue;
            }

            if let Some(key) = transfer_match_key(activity) {
                if activity_type == ACTIVITY_TYPE_TRANSFER_IN {
                    transfer_in.entry(key).or_default().push(idx);
                } else {
                    transfer_out.entry(key).or_default().push(idx);
                }
            }
        }

        for (key, in_indices) in transfer_in {
            if let Some(out_indices) = transfer_out.get(&key) {
                let pair_count = in_indices.len().min(out_indices.len());
                for i in 0..pair_count {
                    let group_id = Uuid::new_v4().to_string();
                    let in_idx = in_indices[i];
                    let out_idx = out_indices[i];
                    if let Some(activity) = new_activities.get_mut(in_idx) {
                        activity.source_group_id = Some(group_id.clone());
                    }
                    if let Some(activity) = new_activities.get_mut(out_idx) {
                        activity.source_group_id = Some(group_id);
                    }
                }
            }
        }
    }
}
