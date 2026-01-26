use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use log::debug;
use rust_decimal::Decimal;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::accounts::{Account, AccountServiceTrait};
use crate::activities::activities_constants::{
    is_cash_activity, ACTIVITY_TYPE_TRANSFER_IN, ACTIVITY_TYPE_TRANSFER_OUT,
};
use crate::activities::activities_errors::ActivityError;
use crate::activities::activities_model::*;
use crate::activities::csv_parser::{self, ParseConfig, ParsedCsvResult};
use crate::activities::{ActivityRepositoryTrait, ActivityServiceTrait};
use crate::assets::{canonical_asset_id, AssetKind, AssetServiceTrait};
use crate::fx::currency::{get_normalization_rule, normalize_amount};
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
        }
    }

    /// Resolves symbols to exchange MICs in batch.
    /// First checks existing assets in the database, then falls back to quote service
    /// for symbols not found locally.
    async fn resolve_symbols_batch(
        &self,
        symbols: HashSet<String>,
        currency: &str,
    ) -> HashMap<String, Option<String>> {
        let mut cache: HashMap<String, Option<String>> = HashMap::new();

        if symbols.is_empty() {
            return cache;
        }

        // 1. Get all existing assets and build a lookup map (case-insensitive)
        let existing_assets = self.asset_service.get_assets().unwrap_or_default();
        let existing_map: HashMap<String, Option<String>> = existing_assets
            .into_iter()
            .map(|a| (a.symbol.to_lowercase(), a.exchange_mic))
            .collect();

        // 2. Check each symbol against existing assets first
        let mut missing_symbols: Vec<String> = Vec::new();

        for symbol in &symbols {
            if let Some(exchange_mic) = existing_map.get(&symbol.to_lowercase()) {
                // Found in existing assets
                cache.insert(symbol.clone(), exchange_mic.clone());
            } else {
                // Need to resolve via quote service
                missing_symbols.push(symbol.clone());
            }
        }

        // 3. Resolve missing symbols via quote service (with provider lookup)
        for symbol in missing_symbols {
            let results = self
                .quote_service
                .search_symbol_with_currency(&symbol, Some(currency))
                .await
                .unwrap_or_default();

            let exchange_mic = results.first().and_then(|r| r.exchange_mic.clone());
            cache.insert(symbol, exchange_mic);
        }

        cache
    }

    /// Creates a manual quote from activity data when pricing_mode is MANUAL.
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
    /// Resolves the asset_id for an activity.
    ///
    /// Priority:
    /// 1. If asset_id is provided, use it (backward compatibility, editing existing activities)
    /// 2. If symbol + exchange_mic are provided, generate canonical ID using canonical_asset_id()
    /// 3. For cash activities without symbol, generate CASH:{currency}
    /// 4. For non-cash activities without symbol, return error
    fn resolve_asset_id(
        &self,
        asset_id: Option<&str>,
        symbol: Option<&str>,
        exchange_mic: Option<&str>,
        asset_kind_hint: Option<&str>,
        activity_type: &str,
        currency: &str,
    ) -> Result<Option<String>> {
        // 1. If asset_id is explicitly provided, use it (backward compatibility for updates)
        if let Some(id) = asset_id {
            if !id.is_empty() {
                return Ok(Some(id.to_string()));
            }
        }

        // 2. If symbol is provided, generate canonical asset_id
        if let Some(sym) = symbol {
            if !sym.is_empty() {
                let kind = self.infer_asset_kind(sym, exchange_mic, asset_kind_hint);
                let generated_id = canonical_asset_id(&kind, sym, exchange_mic, currency);
                return Ok(Some(generated_id));
            }
        }

        // 3. For cash activities without symbol, generate CASH:{currency}
        if is_cash_activity(activity_type) {
            // Generate canonical CASH asset ID for cash activities
            let cash_id = canonical_asset_id(&AssetKind::Cash, currency, None, currency);
            return Ok(Some(cash_id));
        }

        // 4. For non-cash activities (BUY, SELL, DIVIDEND, etc.), we need either asset_id or symbol
        Err(ActivityError::InvalidData(
            "Non-cash activities require either asset_id or symbol to be provided".to_string(),
        )
        .into())
    }

    /// Infers the asset kind from symbol, exchange, and hints.
    fn infer_asset_kind(
        &self,
        symbol: &str,
        exchange_mic: Option<&str>,
        asset_kind_hint: Option<&str>,
    ) -> AssetKind {
        // 1. If explicit hint is provided, use it
        if let Some(hint) = asset_kind_hint {
            match hint.to_uppercase().as_str() {
                "SECURITY" => return AssetKind::Security,
                "CRYPTO" => return AssetKind::Crypto,
                "CASH" => return AssetKind::Cash,
                "FX_RATE" | "FX" => return AssetKind::FxRate,
                "OPTION" | "OPT" => return AssetKind::Option,
                "COMMODITY" | "CMDTY" => return AssetKind::Commodity,
                "PROPERTY" | "PROP" => return AssetKind::Property,
                "VEHICLE" | "VEH" => return AssetKind::Vehicle,
                "COLLECTIBLE" | "COLL" => return AssetKind::Collectible,
                "PHYSICAL_PRECIOUS" | "PREC" => return AssetKind::PhysicalPrecious,
                "PRIVATE_EQUITY" | "PEQ" => return AssetKind::PrivateEquity,
                "LIABILITY" | "LIAB" => return AssetKind::Liability,
                "OTHER" | "ALT" => return AssetKind::Other,
                _ => {} // Fall through to inference
            }
        }

        // 2. If exchange MIC is provided, it's a security
        if exchange_mic.is_some() {
            return AssetKind::Security;
        }

        // 3. Common crypto symbols heuristic
        let upper_symbol = symbol.to_uppercase();
        let common_crypto = [
            "BTC", "ETH", "XRP", "LTC", "BCH", "ADA", "DOT", "LINK", "XLM", "DOGE", "UNI", "SOL",
            "AVAX", "MATIC", "ATOM", "ALGO", "VET", "FIL", "TRX", "ETC", "XMR", "AAVE", "MKR",
            "COMP", "SNX", "YFI", "SUSHI", "CRV",
        ];
        if common_crypto.contains(&upper_symbol.as_str()) {
            return AssetKind::Crypto;
        }

        // 4. If symbol contains "-USD", "-CAD", etc., likely crypto
        if upper_symbol.contains("-USD")
            || upper_symbol.contains("-CAD")
            || upper_symbol.contains("-EUR")
            || upper_symbol.contains("-GBP")
        {
            return AssetKind::Crypto;
        }

        // 5. Default to Security (most common case)
        AssetKind::Security
    }

    async fn prepare_new_activity(&self, mut activity: NewActivity) -> Result<NewActivity> {
        let account: Account = self.account_service.get_account(&activity.account_id)?;

        // Determine currency (needed for asset ID generation)
        let currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account.currency.clone()
        };

        // Extract asset fields from nested `asset` object
        let symbol = activity.get_symbol().map(|s| s.to_string());
        let exchange_mic = activity.get_exchange_mic().map(|s| s.to_string());
        let asset_kind = activity.get_asset_kind().map(|s| s.to_string());
        let asset_name = activity.get_asset_name().map(|s| s.to_string());
        let pricing_mode = activity.get_pricing_mode().map(|s| s.to_string());

        // Build asset metadata from extracted fields
        let asset_metadata = if asset_name.is_some() || exchange_mic.is_some() {
            Some(crate::assets::AssetMetadata {
                name: asset_name.clone(),
                kind: None,
                exchange_mic: exchange_mic.clone(),
            })
        } else {
            None
        };

        // For NEW activities: prioritize symbol over asset_id to ensure canonical ID generation.
        // This prevents clients from accidentally sending raw symbols (e.g., "AAPL") as asset_id.
        // If symbol is provided, ignore asset_id and generate canonical ID.
        let effective_asset_id = if symbol.as_ref().is_some_and(|s| !s.is_empty()) {
            // Symbol is provided, ignore any asset_id and let resolve_asset_id generate canonical ID
            None
        } else {
            // No symbol provided, fall back to asset.id (for edge cases like editing existing activities)
            activity.get_asset_id().map(|s| s.to_string())
        };

        // Resolve asset_id using canonical_asset_id() if symbol is provided
        let resolved_asset_id = self.resolve_asset_id(
            effective_asset_id.as_deref(),
            symbol.as_deref(),
            exchange_mic.as_deref(),
            asset_kind.as_deref(),
            &activity.activity_type,
            &currency,
        )?;

        // Update activity's asset with resolved asset_id
        if let Some(ref resolved_id) = resolved_asset_id {
            match activity.asset.as_mut() {
                Some(asset) => asset.id = Some(resolved_id.clone()),
                None => {
                    activity.asset = Some(AssetInput {
                        id: Some(resolved_id.clone()),
                        ..Default::default()
                    });
                }
            }
        }

        // Process asset if asset_id is resolved
        if let Some(ref asset_id) = resolved_asset_id {
            // Pass pricing_mode to asset creation so custom/manual assets get the right mode
            let asset = self
                .asset_service
                .get_or_create_minimal_asset(
                    asset_id,
                    Some(currency.clone()),
                    asset_metadata,
                    pricing_mode.clone(),
                )
                .await?;

            // Update asset pricing mode if specified (for existing assets that need mode change)
            if let Some(ref mode) = pricing_mode {
                let requested_mode = mode.to_uppercase();
                let current_mode = asset.pricing_mode.as_db_str();
                if requested_mode != current_mode {
                    self.asset_service
                        .update_pricing_mode(&asset.id, &requested_mode)
                        .await?;
                }

                // Create manual quote for MANUAL pricing mode assets
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
                activity.currency = asset.currency.clone();
            }

            // Register FX pair for activity currency if different from account currency
            if activity.currency != account.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                    .await?;
            }

            // Register FX pair for asset currency if different from account currency
            // This is needed when the asset's native currency differs from the activity currency
            // (e.g., asset is EUR but activity was recorded in account's USD)
            if asset.currency != account.currency && asset.currency != activity.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), asset.currency.as_str())
                    .await?;
            }
        } else {
            // For pure cash movements without asset, just register FX if needed
            if activity.currency.is_empty() {
                activity.currency = account.currency.clone();
            }

            if activity.currency != account.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                    .await?;
            }
        }

        // Normalize minor currency units (e.g., GBp -> GBP) and convert amounts
        // This ensures activities are stored with major currency and properly scaled amounts
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
                // Update currency to major unit (e.g., GBp -> GBP)
                activity.currency = normalized_currency.to_string();
            } else {
                // Still need to normalize currency even if no fee
                let (_, normalized_currency) =
                    normalize_amount(Decimal::ZERO, &activity.currency);
                activity.currency = normalized_currency.to_string();
            }
        }

        Ok(activity)
    }

    async fn prepare_update_activity(
        &self,
        mut activity: ActivityUpdate,
    ) -> Result<ActivityUpdate> {
        let account: Account = self.account_service.get_account(&activity.account_id)?;

        // Determine currency (needed for asset ID generation)
        let currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account.currency.clone()
        };

        // Extract asset fields using helper methods (supports both nested `asset` and legacy flat fields)
        let asset_id_input = activity.get_asset_id().map(|s| s.to_string());
        let symbol = activity.get_symbol().map(|s| s.to_string());
        let exchange_mic = activity.get_exchange_mic().map(|s| s.to_string());
        let asset_kind = activity.get_asset_kind().map(|s| s.to_string());
        let asset_name = activity.get_asset_name().map(|s| s.to_string());
        let pricing_mode = activity.get_pricing_mode().map(|s| s.to_string());

        // Build asset metadata from extracted fields
        let asset_metadata = if asset_name.is_some() {
            Some(crate::assets::AssetMetadata {
                name: asset_name.clone(),
                kind: None,
                exchange_mic: exchange_mic.clone(),
            })
        } else {
            None
        };

        // Resolve asset_id using canonical_asset_id() if symbol is provided
        let resolved_asset_id = self.resolve_asset_id(
            asset_id_input.as_deref(),
            symbol.as_deref(),
            exchange_mic.as_deref(),
            asset_kind.as_deref(),
            &activity.activity_type,
            &currency,
        )?;

        // Update activity's asset with resolved asset_id
        if let Some(ref resolved_id) = resolved_asset_id {
            match activity.asset.as_mut() {
                Some(asset) => asset.id = Some(resolved_id.clone()),
                None => {
                    activity.asset = Some(AssetInput {
                        id: Some(resolved_id.clone()),
                        ..Default::default()
                    });
                }
            }
        }

        // Process asset if asset_id is resolved
        if let Some(ref asset_id) = resolved_asset_id {
            // Pass pricing_mode for asset creation/update
            let asset = self
                .asset_service
                .get_or_create_minimal_asset(
                    asset_id,
                    Some(currency.clone()),
                    asset_metadata,
                    pricing_mode.clone(),
                )
                .await?;

            // Update asset pricing mode if specified (for existing assets that need mode change)
            if let Some(ref mode) = pricing_mode {
                let requested_mode = mode.to_uppercase();
                let current_mode = asset.pricing_mode.as_db_str();
                if requested_mode != current_mode {
                    self.asset_service
                        .update_pricing_mode(&asset.id, &requested_mode)
                        .await?;
                }

                // Create manual quote for MANUAL pricing mode assets
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
                activity.currency = asset.currency.clone();
            }

            // Register FX pair for activity currency if different from account currency
            if activity.currency != account.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                    .await?;
            }

            // Register FX pair for asset currency if different from account currency
            // This is needed when the asset's native currency differs from the activity currency
            // (e.g., asset is EUR but activity was recorded in account's USD)
            if asset.currency != account.currency && asset.currency != activity.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), asset.currency.as_str())
                    .await?;
            }
        } else {
            // For pure cash movements without asset, just register FX if needed
            if activity.currency.is_empty() {
                activity.currency = account.currency.clone();
            }

            if activity.currency != account.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                    .await?;
            }
        }

        // Normalize minor currency units (e.g., GBp -> GBP) and convert amounts
        // This ensures activities are stored with major currency and properly scaled amounts
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
                    normalize_amount(rust_decimal::Decimal::ZERO, &activity.currency);
                activity.currency = normalized_currency.to_string();
            }
        }

        Ok(activity)
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
    ) -> Result<ActivitySearchResponse> {
        self.activity_repository.search_activities(
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
            needs_review_filter,
        )
    }

    /// Creates a new activity
    async fn create_activity(&self, activity: NewActivity) -> Result<Activity> {
        let prepared = self.prepare_new_activity(activity).await?;
        self.activity_repository.create_activity(prepared).await
    }

    /// Updates an existing activity
    async fn update_activity(&self, activity: ActivityUpdate) -> Result<Activity> {
        let prepared = self.prepare_update_activity(activity).await?;
        self.activity_repository.update_activity(prepared).await
    }

    /// Deletes an activity
    async fn delete_activity(&self, activity_id: String) -> Result<Activity> {
        self.activity_repository.delete_activity(activity_id).await
    }

    async fn bulk_mutate_activities(
        &self,
        mut request: ActivityBulkMutationRequest,
    ) -> Result<ActivityBulkMutationResult> {
        let mut errors: Vec<ActivityBulkMutationError> = Vec::new();
        let mut prepared_creates: Vec<NewActivity> = Vec::new();
        let mut prepared_updates: Vec<ActivityUpdate> = Vec::new();
        let mut valid_delete_ids: Vec<String> = Vec::new();

        // Batch resolve symbols that don't have exchange_mic
        // Collect unique symbols from creates that need resolution
        let symbols_to_resolve: HashSet<String> = request
            .creates
            .iter()
            .filter_map(|a| {
                let symbol = a.get_symbol();
                let has_mic = a.get_exchange_mic().is_some();
                let is_cash = symbol.map(|s| s.starts_with("$CASH-")).unwrap_or(false);
                // Only resolve if we have a symbol but no MIC, and it's not a cash symbol
                if symbol.is_some() && !has_mic && !is_cash {
                    symbol.map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect();

        // Resolve symbols in batch (checks existing assets first, then quote service)
        let symbol_mic_cache = if !symbols_to_resolve.is_empty() {
            // Use USD as default currency for resolution; the actual activity currency
            // will be used during asset creation
            self.resolve_symbols_batch(symbols_to_resolve, "USD").await
        } else {
            HashMap::new()
        };

        // Update creates with resolved exchange_mic
        for activity in &mut request.creates {
            if let Some(symbol) = activity.get_symbol() {
                let has_mic = activity.get_exchange_mic().is_some();
                if !has_mic {
                    if let Some(mic) = symbol_mic_cache.get(symbol).cloned().flatten() {
                        // Update the asset's exchange_mic
                        if let Some(ref mut asset) = activity.asset {
                            asset.exchange_mic = Some(mic);
                        }
                    }
                }
            }
        }

        for new_activity in request.creates {
            let temp_id = new_activity.id.clone();
            match self.prepare_new_activity(new_activity).await {
                Ok(prepared) => prepared_creates.push(prepared),
                Err(err) => {
                    errors.push(ActivityBulkMutationError {
                        id: temp_id,
                        action: "create".to_string(),
                        message: err.to_string(),
                    });
                }
            }
        }

        for update_request in request.updates {
            let target_id = update_request.id.clone();
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

        for delete_id in request.delete_ids {
            match self.activity_repository.get_activity(&delete_id) {
                Ok(_) => valid_delete_ids.push(delete_id.clone()),
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
        Ok(persisted)
    }

    /// Verifies the activities import from CSV file
    /// When `dry_run` is true, this performs read-only validation without creating
    /// assets or registering FX pairs. When `dry_run` is false (default legacy behavior),
    /// it creates minimal assets and registers FX pairs as needed.
    async fn check_activities_import(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
        dry_run: bool,
    ) -> Result<Vec<ActivityImport>> {
        let account: Account = self.account_service.get_account(&account_id)?;

        // Batch resolve all unique symbols to get exchange MICs
        let unique_symbols: HashSet<String> = activities.iter().map(|a| a.symbol.clone()).collect();
        let symbol_mic_cache = self
            .resolve_symbols_batch(unique_symbols, &account.currency)
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

            // Determine context currency for potential asset creation during check
            let asset_context_currency = if !activity.currency.is_empty() {
                activity.currency.clone()
            } else {
                // Fallback to account currency for context if import data lacks currency
                account.currency.clone()
            };

            // Get resolved exchange MIC from cache
            let exchange_mic = symbol_mic_cache
                .get(&activity.symbol)
                .cloned()
                .flatten();

            // Store resolved exchange_mic in activity for use during import
            activity.exchange_mic = exchange_mic.clone();

            // Generate canonical asset ID using resolved exchange MIC
            let inferred_kind = self.infer_asset_kind(&activity.symbol, None, None);

            // Check if this is a security that couldn't be resolved
            // Cash symbols ($CASH-XXX) and cash activities don't need exchange MIC
            let is_cash_symbol = activity.symbol.starts_with("$CASH-");
            let is_cash_type = is_cash_activity(&activity.activity_type);
            let needs_exchange_mic = inferred_kind == AssetKind::Security
                && !is_cash_symbol
                && !is_cash_type;

            // Early validation: if we need exchange MIC but couldn't resolve it, mark as invalid
            if needs_exchange_mic && exchange_mic.is_none() {
                activity.is_valid = false;
                let mut errors = std::collections::HashMap::new();
                errors.insert(
                    activity.symbol.clone(),
                    vec![format!(
                        "Could not find '{}' in market data. Please search for the correct ticker symbol.",
                        &activity.symbol
                    )],
                );
                activity.errors = Some(errors);
                activities_with_status.push(activity);
                continue;
            }

            let canonical_id = canonical_asset_id(
                &inferred_kind,
                &activity.symbol,
                exchange_mic.as_deref(),
                &asset_context_currency,
            );

            let (mut is_valid, mut error_message) = (true, None);

            if dry_run {
                // Dry-run mode: read-only validation without side effects
                // Just check if asset exists (don't create it)
                match self.asset_service.get_asset_by_id(&canonical_id) {
                    Ok(asset) => {
                        activity.symbol_name = asset.name;
                    }
                    Err(_) => {
                        // Asset doesn't exist yet - that's OK for dry-run
                        // It will be created during actual import
                        // Use the symbol as a placeholder name
                        activity.symbol_name = Some(activity.symbol.clone());
                    }
                }

                // Validate currency without registering FX pair
                if activity.currency.is_empty() {
                    is_valid = false;
                    error_message =
                        Some("Activity currency is missing in the import data.".to_string());
                } else if activity.currency != account.currency {
                    // In dry-run mode, just check that currencies are valid 3-letter codes
                    // The actual FX pair will be registered during import
                    let from = &account.currency;
                    let to = &activity.currency;
                    if from.len() != 3
                        || !from.chars().all(|c| c.is_alphabetic())
                        || to.len() != 3
                        || !to.chars().all(|c| c.is_alphabetic())
                    {
                        is_valid = false;
                        error_message = Some(format!(
                            "Invalid currency code: {} or {}",
                            from, to
                        ));
                    }
                }
            } else {
                // Legacy mode: create assets and register FX pairs
                // Pass exchange_mic as metadata for asset creation
                let asset_metadata = exchange_mic.as_ref().map(|mic| {
                    crate::assets::AssetMetadata {
                        name: None,
                        kind: None,
                        exchange_mic: Some(mic.clone()),
                    }
                });

                let symbol_profile_result = self
                    .asset_service
                    .get_or_create_minimal_asset(
                        &canonical_id,
                        Some(asset_context_currency),
                        asset_metadata,
                        None,
                    )
                    .await;

                match symbol_profile_result {
                    Ok(asset) => {
                        // symbol_profile_result now returns Asset
                        activity.symbol_name = asset.name; // Use asset name

                        // Check if activity currency (from import) is valid and handle FX
                        if activity.currency.is_empty() {
                            // Activity must have a currency specified in the import
                            is_valid = false;
                            error_message =
                                Some("Activity currency is missing in the import data.".to_string());
                        } else if activity.currency != account.currency {
                            match self
                                .fx_service
                                .register_currency_pair(
                                    account.currency.as_str(),
                                    activity.currency.as_str(), // Use currency from import data
                                )
                                .await
                            {
                                Ok(_) => { /* FX pair registered or already exists */ }
                                Err(e) => {
                                    is_valid = false;
                                    error_message =
                                        Some(format!("Failed to register currency pair for FX: {}", e));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        // Failed to get or create asset
                        let error_msg = format!(
                            "Failed to resolve asset for symbol '{}': {}",
                            &activity.symbol, e
                        );
                        is_valid = false;
                        error_message = Some(error_msg);
                    }
                }
            }

            activity.is_valid = is_valid;
            if let Some(error_msg) = error_message {
                let mut errors = std::collections::HashMap::new();
                errors.insert(activity.symbol.clone(), vec![error_msg]);
                activity.errors = Some(errors);
            }

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

        let validated_activities = self
            .check_activities_import(account_id.clone(), activities, false)
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
            let skipped_count = validated_activities
                .iter()
                .filter(|a| !a.is_valid)
                .count() as u32;

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
                    assets_created: 0,
                    success: false,
                },
            });
        }

        let mut new_activities: Vec<NewActivity> = validated_activities
            .iter()
            .map(|activity| {
                // Determine currency for canonical ID generation
                let currency = if !activity.currency.is_empty() {
                    &activity.currency
                } else {
                    &account.currency
                };

                // Generate canonical asset ID using exchange_mic resolved during validation
                let inferred_kind = self.infer_asset_kind(&activity.symbol, None, None);
                let canonical_id = canonical_asset_id(
                    &inferred_kind,
                    &activity.symbol,
                    activity.exchange_mic.as_deref(),
                    currency,
                );

                NewActivity {
                    id: activity.id.clone(),
                    account_id: activity.account_id.clone().unwrap_or_default(),
                    asset: Some(AssetInput {
                        id: Some(canonical_id),
                        symbol: Some(activity.symbol.clone()),
                        exchange_mic: activity.exchange_mic.clone(),
                        kind: None,
                        name: None,
                        pricing_mode: None,
                    }),
                    activity_type: activity.activity_type.clone(),
                    subtype: activity.subtype.clone(),
                    activity_date: activity.date.clone(),
                    quantity: Some(activity.quantity),
                    unit_price: Some(activity.unit_price),
                    currency: activity.currency.clone(),
                    fee: Some(activity.fee),
                    amount: activity.amount,
                    status: if activity.is_draft {
                        Some(crate::activities::ActivityStatus::Draft)
                    } else {
                        Some(crate::activities::ActivityStatus::Posted)
                    },
                    notes: activity.comment.clone(),
                    fx_rate: activity.fx_rate,
                    metadata: None,
                    needs_review: None,
                    source_system: Some("CSV".to_string()),
                    source_record_id: None,
                    source_group_id: None,
                }
            })
            .collect();

        self.link_imported_transfer_pairs(&validated_activities, &mut new_activities);

        let count = self
            .activity_repository
            .create_activities(new_activities)
            .await?;
        debug!("Successfully imported {} activities", count);

        // Mark import run as successful
        if let Some(ref repo) = self.import_run_repository {
            let mut success_run = import_run;
            success_run.complete();
            success_run.summary = Some(ImportRunSummary {
                fetched: total_count,
                inserted: count as u32,
                updated: 0,
                skipped: 0,
                warnings: 0,
                errors: 0,
                removed: 0,
                assets_created: 0, // TODO: Track assets created during import
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
                skipped: 0,
                assets_created: 0,
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
            let amount = activity
                .amount
                .unwrap_or(activity.quantity * activity.unit_price);
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
