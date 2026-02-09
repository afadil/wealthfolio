use log::{debug, error, info, warn};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::events::{DomainEvent, DomainEventSink, NoOpDomainEventSink};
use crate::quotes::QuoteServiceTrait;
use crate::taxonomies::TaxonomyServiceTrait;

use super::assets_model::{
    Asset, AssetKind, AssetSpec, EnsureAssetsResult, InstrumentType, NewAsset, QuoteMode,
    UpdateAssetProfile,
};
use super::assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
use super::auto_classification::{AutoClassificationService, ClassificationInput};
use crate::errors::{DatabaseError, Error, Result};

// Import mic_to_currency for resolving exchange trading currencies
use wealthfolio_market_data::mic_to_currency;

/// Converts a provider's asset_type string to our InstrumentType enum.
/// Provider data uses various naming conventions (e.g., "CRYPTOCURRENCY", "ETF", "Equity").
/// Returns None if the string doesn't map to a known type (caller decides fallback).
fn parse_instrument_type_from_provider(asset_type: &str) -> Option<InstrumentType> {
    match asset_type.to_uppercase().as_str() {
        "CRYPTOCURRENCY" | "CRYPTO" => Some(InstrumentType::Crypto),
        "EQUITY" | "STOCK" | "ETF" | "MUTUALFUND" | "MUTUAL FUND" | "INDEX" => {
            Some(InstrumentType::Equity)
        }
        "CURRENCY" | "FOREX" | "FX" => Some(InstrumentType::Fx),
        "OPTION" => Some(InstrumentType::Option),
        "COMMODITY" => Some(InstrumentType::Metal),
        _ => None,
    }
}

/// Service for managing assets
pub struct AssetService {
    quote_service: Arc<dyn QuoteServiceTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
    taxonomy_service: Option<Arc<dyn TaxonomyServiceTrait>>,
    event_sink: Arc<dyn DomainEventSink>,
}

impl AssetService {
    /// Creates a new AssetService instance
    pub fn new(
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
    ) -> Result<Self> {
        Ok(Self {
            quote_service,
            asset_repository,
            taxonomy_service: None,
            event_sink: Arc::new(NoOpDomainEventSink),
        })
    }

    /// Creates a new AssetService instance with taxonomy service for auto-classification
    pub fn with_taxonomy_service(
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
        taxonomy_service: Arc<dyn TaxonomyServiceTrait>,
    ) -> Result<Self> {
        Ok(Self {
            quote_service,
            asset_repository,
            taxonomy_service: Some(taxonomy_service),
            event_sink: Arc::new(NoOpDomainEventSink),
        })
    }

    /// Sets the domain event sink for this service.
    ///
    /// Events are emitted after successful asset creation (not updates).
    pub fn with_event_sink(mut self, event_sink: Arc<dyn DomainEventSink>) -> Self {
        self.event_sink = event_sink;
        self
    }

    /// Builds a NewAsset from an AssetSpec without any I/O.
    fn new_asset_from_spec(&self, spec: &AssetSpec) -> NewAsset {
        let quote_mode = spec.quote_mode.unwrap_or_else(|| match &spec.kind {
            AssetKind::Investment | AssetKind::Fx => QuoteMode::Market,
            _ => QuoteMode::Manual,
        });

        let provider_config = match quote_mode {
            QuoteMode::Market => Some(serde_json::json!({ "preferred_provider": "YAHOO" })),
            QuoteMode::Manual => None,
        };

        NewAsset {
            id: spec.id.clone(),
            kind: spec.kind.clone(),
            name: spec.name.clone(),
            display_code: spec.display_code.clone(),
            quote_mode,
            quote_ccy: spec.quote_ccy.clone(),
            instrument_type: spec.instrument_type.clone(),
            instrument_symbol: spec.instrument_symbol.clone(),
            instrument_exchange_mic: spec.instrument_exchange_mic.clone(),
            provider_config,
            is_active: true,
            ..Default::default()
        }
    }
}

// Implement the service trait
#[async_trait::async_trait]
impl AssetServiceTrait for AssetService {
    /// Lists all assets with enriched fields (e.g., exchange_name)
    fn get_assets(&self) -> Result<Vec<Asset>> {
        let assets = self.asset_repository.list()?;
        Ok(assets.into_iter().map(|a| a.enrich()).collect())
    }

    /// Retrieves an asset by its ID with enriched fields
    fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset> {
        self.asset_repository
            .get_by_id(asset_id)
            .map(|a| a.enrich())
    }

    async fn delete_asset(&self, asset_id: &str) -> Result<()> {
        // Clean up sync state before deleting the asset to avoid orphaned records
        if let Err(e) = self.quote_service.delete_sync_state(asset_id).await {
            warn!("Failed to delete sync state for {}: {}", asset_id, e);
        }

        self.asset_repository.delete(asset_id).await
    }

    /// Updates an asset profile
    async fn update_asset_profile(
        &self,
        asset_id: &str,
        payload: UpdateAssetProfile,
    ) -> Result<Asset> {
        self.asset_repository
            .update_profile(asset_id, payload)
            .await
    }

    /// Creates a new asset directly without network lookups.
    async fn create_asset(&self, new_asset: NewAsset) -> Result<Asset> {
        let asset = self.asset_repository.create(new_asset).await?;

        // Emit event for newly created asset
        self.event_sink
            .emit(DomainEvent::assets_created(vec![asset.id.clone()]));

        Ok(asset)
    }

    /// Creates a minimal asset without network calls.
    /// Returns the existing asset if found, or creates a new minimal one.
    async fn get_or_create_minimal_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
        metadata: Option<super::assets_model::AssetMetadata>,
        quote_mode_hint: Option<String>,
    ) -> Result<Asset> {
        // Try to get existing asset first
        match self.asset_repository.get_by_id(asset_id) {
            Ok(existing_asset) => {
                // Reactivate if previously deactivated (e.g., after account deletion)
                if !existing_asset.is_active {
                    info!("Reactivating previously deactivated asset: {}", asset_id);
                    self.asset_repository.reactivate(asset_id).await?;
                }
                return Ok(existing_asset);
            }
            Err(Error::Database(DatabaseError::NotFound(_))) => {
                debug!(
                    "Asset not found locally, creating minimal asset: {}",
                    asset_id
                );
            }
            Err(e) => {
                error!("Error fetching asset by ID '{}': {}", asset_id, e);
                return Err(e);
            }
        }

        // Try to find existing asset by instrument_key before creating a new one
        let inferred_instrument_type = metadata.as_ref().and_then(|meta| {
            meta.instrument_symbol
                .as_ref()
                .filter(|s| !s.is_empty())
                .map(|_| {
                    meta.instrument_type
                        .clone()
                        .unwrap_or(InstrumentType::Equity)
                })
        });

        if let Some(ref meta) = metadata {
            if let Some(ref sym) = meta.instrument_symbol {
                if !sym.is_empty() {
                    let instrument_type = inferred_instrument_type
                        .clone()
                        .unwrap_or(InstrumentType::Equity);
                    let spec = AssetSpec {
                        id: None,
                        display_code: meta.display_code.clone(),
                        instrument_symbol: Some(sym.clone()),
                        instrument_exchange_mic: meta.instrument_exchange_mic.clone(),
                        instrument_type: Some(instrument_type),
                        quote_ccy: context_currency
                            .clone()
                            .unwrap_or_else(|| "USD".to_string()),
                        kind: meta.kind.clone().unwrap_or(AssetKind::Investment),
                        quote_mode: None,
                        name: meta.name.clone(),
                    };
                    if let Some(key) = spec.instrument_key() {
                        if let Ok(Some(existing)) =
                            self.asset_repository.find_by_instrument_key(&key)
                        {
                            info!(
                                "Found existing asset by instrument_key '{}': {}",
                                key, existing.id
                            );
                            if !existing.is_active {
                                self.asset_repository.reactivate(&existing.id).await?;
                            }
                            return Ok(existing);
                        }
                    }
                }
            }
        }

        // Use metadata kind if provided, otherwise default to Investment
        let kind = metadata
            .as_ref()
            .and_then(|m| m.kind.clone())
            .unwrap_or(AssetKind::Investment);

        // Determine quote mode: use hint if provided, otherwise default based on kind
        let quote_mode = match quote_mode_hint.as_deref() {
            Some("MANUAL") => QuoteMode::Manual,
            Some("MARKET") => QuoteMode::Market,
            _ => match &kind {
                AssetKind::Investment | AssetKind::Fx => QuoteMode::Market,
                _ => QuoteMode::Manual,
            },
        };

        // Extract exchange_mic from metadata
        let exchange_mic = metadata
            .as_ref()
            .and_then(|m| m.instrument_exchange_mic.clone());

        // Determine currency:
        // 1. For market-priced assets with an exchange MIC, use the exchange's trading currency
        // 2. Fall back to context_currency (account currency) or USD
        let currency = if quote_mode == QuoteMode::Market {
            exchange_mic
                .as_ref()
                .and_then(|mic| mic_to_currency(mic))
                .map(|c| c.to_string())
                .or_else(|| context_currency.clone().filter(|c| !c.is_empty()))
                .unwrap_or_else(|| "USD".to_string())
        } else {
            context_currency
                .filter(|c| !c.is_empty())
                .unwrap_or_else(|| "USD".to_string())
        };

        // Set preferred provider based on quote mode
        let provider_config = match quote_mode {
            QuoteMode::Market => Some(serde_json::json!({ "preferred_provider": "YAHOO" })),
            QuoteMode::Manual => None,
        };

        let name = metadata.as_ref().and_then(|m| m.name.clone());
        let instrument_symbol = metadata.as_ref().and_then(|m| m.instrument_symbol.clone());
        let instrument_type = inferred_instrument_type;
        let display_code = metadata.as_ref().and_then(|m| m.display_code.clone());

        let new_asset = NewAsset {
            id: Some(asset_id.to_string()),
            kind,
            name,
            quote_mode,
            quote_ccy: currency,
            instrument_exchange_mic: exchange_mic,
            instrument_symbol,
            instrument_type,
            display_code,
            provider_config,
            is_active: true,
            ..Default::default()
        };

        debug!(
            "Creating minimal asset: id={}, kind={:?}, quote_mode={:?}, name={:?}",
            asset_id, new_asset.kind, new_asset.quote_mode, new_asset.name
        );

        let asset = self.asset_repository.create(new_asset).await?;

        // Emit event for newly created asset
        self.event_sink
            .emit(DomainEvent::assets_created(vec![asset.id.clone()]));

        Ok(asset)
    }

    /// Updates the quote mode for an asset (MARKET, MANUAL)
    async fn update_quote_mode(&self, asset_id: &str, quote_mode: &str) -> Result<Asset> {
        self.asset_repository
            .update_quote_mode(asset_id, quote_mode)
            .await
    }

    async fn get_assets_by_asset_ids(&self, asset_ids: &[String]) -> Result<Vec<Asset>> {
        self.asset_repository.list_by_asset_ids(asset_ids)
    }

    /// Enriches an existing asset's profile with data from market data provider.
    /// Updates the profile JSON (sectors, countries, website) and notes fields.
    async fn enrich_asset_profile(&self, asset_id: &str) -> Result<Asset> {
        // Get the existing asset
        let existing_asset = self.asset_repository.get_by_id(asset_id)?;

        // Skip enrichment for assets that don't need market data
        if existing_asset.quote_mode != QuoteMode::Market {
            debug!(
                "Skipping enrichment for asset {} - quote mode is {:?}",
                asset_id, existing_asset.quote_mode
            );
            return Ok(existing_asset);
        }

        // Fetch profile from provider using the asset (resolver handles exchange suffix)
        debug!(
            "Fetching profile for asset {} (display_code: {:?}, exchange: {:?})",
            asset_id, existing_asset.display_code, existing_asset.instrument_exchange_mic
        );

        let provider_profile = match self.quote_service.get_asset_profile(&existing_asset).await {
            Ok(profile) => profile,
            Err(e) => {
                return Err(Error::MarketData(
                    crate::quotes::MarketDataError::ProviderError(format!(
                        "Could not fetch profile for asset {} (display_code: {:?}): {}",
                        asset_id, existing_asset.display_code, e
                    )),
                ));
            }
        };

        // Derive instrument_type from provider's asset_type if not already set
        let updated_instrument_type = if existing_asset.instrument_type.is_none() {
            provider_profile
                .asset_type
                .as_ref()
                .and_then(|t| parse_instrument_type_from_provider(t))
        } else {
            None
        };

        // Build provider profile metadata for storage
        let mut profile_metadata = serde_json::Map::new();
        if let Some(ref sectors) = provider_profile.sectors {
            profile_metadata.insert(
                "sectors".to_string(),
                serde_json::Value::String(sectors.clone()),
            );
        }
        if let Some(ref industry) = provider_profile.industry {
            profile_metadata.insert(
                "industry".to_string(),
                serde_json::Value::String(industry.clone()),
            );
        }
        if let Some(ref countries) = provider_profile.countries {
            profile_metadata.insert(
                "countries".to_string(),
                serde_json::Value::String(countries.clone()),
            );
        }
        if let Some(ref asset_type) = provider_profile.asset_type {
            profile_metadata.insert(
                "quoteType".to_string(),
                serde_json::Value::String(asset_type.clone()),
            );
        }
        if let Some(ref url) = provider_profile.url {
            profile_metadata.insert(
                "website".to_string(),
                serde_json::Value::String(url.clone()),
            );
        }
        if let Some(market_cap) = provider_profile.market_cap {
            profile_metadata.insert("marketCap".to_string(), serde_json::json!(market_cap));
        }
        if let Some(pe_ratio) = provider_profile.pe_ratio {
            profile_metadata.insert("peRatio".to_string(), serde_json::json!(pe_ratio));
        }
        if let Some(dividend_yield) = provider_profile.dividend_yield {
            profile_metadata.insert(
                "dividendYield".to_string(),
                serde_json::json!(dividend_yield),
            );
        }
        if let Some(week_52_high) = provider_profile.week_52_high {
            profile_metadata.insert("week52High".to_string(), serde_json::json!(week_52_high));
        }
        if let Some(week_52_low) = provider_profile.week_52_low {
            profile_metadata.insert("week52Low".to_string(), serde_json::json!(week_52_low));
        }

        // Merge with existing metadata (preserving any non-profile fields like OptionSpec)
        let updated_metadata = if profile_metadata.is_empty() {
            existing_asset.metadata.clone()
        } else {
            let mut merged = match &existing_asset.metadata {
                Some(existing) => match existing.as_object() {
                    Some(obj) => obj.clone(),
                    None => serde_json::Map::new(),
                },
                None => serde_json::Map::new(),
            };
            merged.insert(
                "profile".to_string(),
                serde_json::Value::Object(profile_metadata),
            );
            Some(serde_json::Value::Object(merged))
        };

        // Build profile update from provider data
        let mut update = UpdateAssetProfile {
            display_code: existing_asset.display_code.clone(),
            name: provider_profile.name.or(existing_asset.name.clone()),
            notes: existing_asset.notes.clone().unwrap_or_default(),
            kind: None,
            quote_mode: Some(existing_asset.quote_mode),
            instrument_type: updated_instrument_type,
            instrument_symbol: None,
            instrument_exchange_mic: None,
            provider_config: existing_asset.provider_config.clone(),
            metadata: updated_metadata,
        };

        // Update notes with description if notes is empty and provider has notes
        if update.notes.is_empty() {
            if let Some(ref notes) = provider_profile.notes {
                update.notes = notes.clone();
            }
        }

        debug!(
            "Enriching asset {} with provider profile: instrument_type={:?}, name={:?}, sectors={:?}, industry={:?}, countries={:?}, asset_type={:?}",
            asset_id, update.instrument_type, update.name, provider_profile.sectors, provider_profile.industry, provider_profile.countries, provider_profile.asset_type
        );

        let updated_asset = self
            .asset_repository
            .update_profile(asset_id, update)
            .await?;

        // Auto-classify asset based on provider profile data
        if let Some(taxonomy_service) = &self.taxonomy_service {
            let classification_input = ClassificationInput::from_provider_profile(
                provider_profile.asset_type.as_deref(),
                None,
                provider_profile.sectors.as_deref(),
                None,
                provider_profile.countries.as_deref(),
                existing_asset.instrument_exchange_mic.as_deref(),
            );

            let auto_classifier = AutoClassificationService::new(Arc::clone(taxonomy_service));
            match auto_classifier
                .classify_asset(asset_id, &classification_input)
                .await
            {
                Ok(result) => {
                    info!(
                        "Auto-classified asset {}: type={:?}, sectors={:?}, region={:?}",
                        asset_id, result.security_type, result.sectors, result.region
                    );
                }
                Err(e) => {
                    debug!("Auto-classification failed for {}: {}", asset_id, e);
                }
            }
        }

        Ok(updated_asset)
    }

    /// Enriches multiple assets in batch, with deduplication and sync state tracking.
    async fn enrich_assets(&self, asset_ids: Vec<String>) -> Result<(usize, usize, usize)> {
        if asset_ids.is_empty() {
            return Ok((0, 0, 0));
        }

        // Deduplicate
        let unique_ids: Vec<String> = asset_ids
            .into_iter()
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        if unique_ids.is_empty() {
            debug!("No enrichable assets in batch");
            return Ok((0, 0, 0));
        }

        let mut enriched_count = 0;
        let mut skipped_count = 0;
        let mut failed_count = 0;

        for asset_id in unique_ids {
            // Check sync state to see if enrichment is needed
            let needs_enrichment = match self.quote_service.get_sync_state(&asset_id) {
                Ok(Some(state)) => state.needs_profile_enrichment(),
                Ok(None) => true,
                Err(_) => true,
            };

            if !needs_enrichment {
                debug!("Skipping enrichment for {} - already enriched", asset_id);
                skipped_count += 1;
                continue;
            }

            // Try to enrich the asset profile
            match self.enrich_asset_profile(&asset_id).await {
                Ok(_) => {
                    if let Err(e) = self.quote_service.mark_profile_enriched(&asset_id).await {
                        warn!("Failed to mark profile enriched for {}: {}", asset_id, e);
                    }
                    enriched_count += 1;
                    info!("Successfully enriched asset profile: {}", asset_id);
                }
                Err(e) => {
                    debug!("Failed to enrich asset {}: {}", asset_id, e);
                    failed_count += 1;
                }
            }
        }

        info!(
            "Asset enrichment complete: {} enriched, {} skipped, {} failed",
            enriched_count, skipped_count, failed_count
        );

        Ok((enriched_count, skipped_count, failed_count))
    }

    async fn cleanup_legacy_metadata(&self, asset_id: &str) -> Result<()> {
        self.asset_repository
            .cleanup_legacy_metadata(asset_id)
            .await
    }

    async fn merge_unknown_asset(
        &self,
        resolved_asset_id: &str,
        unknown_asset_id: &str,
        activity_repository: &dyn crate::activities::ActivityRepositoryTrait,
    ) -> Result<u32> {
        info!(
            "Merging UNKNOWN asset {} into resolved asset {}",
            unknown_asset_id, resolved_asset_id
        );

        let (account_ids, currencies) = match activity_repository
            .get_activity_accounts_and_currencies_by_asset_id(unknown_asset_id)
            .await
        {
            Ok(data) => data,
            Err(e) => {
                warn!(
                    "Failed to load account_ids/currencies for UNKNOWN asset {}: {}",
                    unknown_asset_id, e
                );
                (Vec::new(), Vec::new())
            }
        };

        // 1. Copy user metadata (notes) from UNKNOWN to resolved
        if let Err(e) = self
            .asset_repository
            .copy_user_metadata(unknown_asset_id, resolved_asset_id)
            .await
        {
            warn!(
                "Failed to copy user metadata from {} to {}: {}",
                unknown_asset_id, resolved_asset_id, e
            );
        }

        // 2. Reassign all activities from UNKNOWN to resolved
        let activities_migrated = activity_repository
            .reassign_asset(unknown_asset_id, resolved_asset_id)
            .await?;

        // 3. Deactivate the UNKNOWN asset
        if let Err(e) = self.asset_repository.deactivate(unknown_asset_id).await {
            warn!(
                "Failed to deactivate UNKNOWN asset {}: {}",
                unknown_asset_id, e
            );
        }

        // 4. Emit assets_merged domain event
        self.event_sink.emit(DomainEvent::assets_merged(
            unknown_asset_id.to_string(),
            resolved_asset_id.to_string(),
            activities_migrated,
        ));

        // 5. Emit activities_changed to trigger recalculation for affected accounts
        if activities_migrated > 0 {
            let asset_ids = vec![unknown_asset_id.to_string(), resolved_asset_id.to_string()];
            self.event_sink.emit(DomainEvent::activities_changed(
                account_ids,
                asset_ids,
                currencies,
            ));
        }

        info!(
            "Merged UNKNOWN asset {} into {}: {} activities migrated",
            unknown_asset_id, resolved_asset_id, activities_migrated
        );

        Ok(activities_migrated)
    }

    async fn ensure_assets(
        &self,
        specs: Vec<AssetSpec>,
        _activity_repository: &dyn crate::activities::ActivityRepositoryTrait,
    ) -> Result<EnsureAssetsResult> {
        if specs.is_empty() {
            return Ok(EnsureAssetsResult::default());
        }

        // Deduplicate specs by ID (if present) or by instrument_key
        let unique_specs: Vec<AssetSpec> = specs
            .into_iter()
            .fold(HashMap::new(), |mut map, spec| {
                let key = spec.id.clone().unwrap_or_else(|| {
                    spec.instrument_key().unwrap_or_else(|| {
                        format!(
                            "{}:{}@{}",
                            spec.instrument_type
                                .as_ref()
                                .map(|t| t.as_db_str())
                                .unwrap_or("?"),
                            spec.instrument_symbol.as_deref().unwrap_or(""),
                            spec.instrument_exchange_mic.as_deref().unwrap_or("")
                        )
                    })
                });
                map.entry(key).or_insert(spec);
                map
            })
            .into_values()
            .collect();

        // Pre-resolve specs without IDs by looking up via instrument_key
        let mut resolved_specs: Vec<AssetSpec> = Vec::with_capacity(unique_specs.len());
        let mut preexisting_keys: HashSet<String> = HashSet::new();
        for mut spec in unique_specs {
            if spec.id.is_none() {
                if let Some(key) = spec.instrument_key() {
                    if let Ok(Some(existing)) = self.asset_repository.find_by_instrument_key(&key) {
                        preexisting_keys.insert(key);
                        spec.id = Some(existing.id);
                    }
                }
            }
            resolved_specs.push(spec);
        }

        // Collect IDs of specs that have them (for existing asset lookup)
        let ids: Vec<String> = resolved_specs.iter().filter_map(|s| s.id.clone()).collect();

        // 1. Pre-read existing asset IDs
        let existing_ids: HashSet<String> = if !ids.is_empty() {
            self.asset_repository
                .list_by_asset_ids(&ids)?
                .into_iter()
                .map(|a| a.id)
                .collect()
        } else {
            HashSet::new()
        };

        // 2. Batch upsert all specs (INSERT OR IGNORE)
        let new_assets: Vec<NewAsset> = resolved_specs
            .iter()
            .map(|spec| self.new_asset_from_spec(spec))
            .collect();

        self.asset_repository.create_batch(new_assets).await?;

        // Reactivate any pre-existing assets that were deactivated
        for asset in self.asset_repository.list_by_asset_ids(&ids)? {
            if !asset.is_active && existing_ids.contains(&asset.id) {
                info!("Reactivating previously deactivated asset: {}", asset.id);
                self.asset_repository.reactivate(&asset.id).await?;
            }
        }

        // 3. Fetch all requested assets (by ID + by instrument_key for specs without IDs)
        let mut assets_map: HashMap<String, Asset> = if !ids.is_empty() {
            self.asset_repository
                .list_by_asset_ids(&ids)?
                .into_iter()
                .map(|a| (a.id.clone(), a))
                .collect()
        } else {
            HashMap::new()
        };

        // Also look up assets for specs that didn't have IDs (created with DB-generated UUIDs)
        for spec in &resolved_specs {
            if spec.id.is_none() {
                if let Some(key) = spec.instrument_key() {
                    if let Ok(Some(asset)) = self.asset_repository.find_by_instrument_key(&key) {
                        assets_map.insert(asset.id.clone(), asset);
                    }
                }
            }
        }

        // Newly created (ID-based specs): all spec IDs minus pre-existing IDs
        let mut created_ids: HashSet<String> = ids
            .iter()
            .filter(|id| !existing_ids.contains(*id))
            .cloned()
            .collect();

        // Newly created (instrument-key specs with DB-generated UUIDs)
        for spec in &resolved_specs {
            if spec.id.is_none() {
                if let Some(key) = spec.instrument_key() {
                    if preexisting_keys.contains(&key) {
                        continue;
                    }
                    if let Some(asset) = assets_map
                        .values()
                        .find(|a| a.instrument_key.as_deref() == Some(&key))
                    {
                        created_ids.insert(asset.id.clone());
                    }
                }
            }
        }

        let created_ids: Vec<String> = created_ids.into_iter().collect();

        // 4. Emit batch event for created assets
        if !created_ids.is_empty() {
            self.event_sink
                .emit(DomainEvent::assets_created(created_ids.clone()));
        }

        Ok(EnsureAssetsResult {
            assets: assets_map,
            created_ids,
            merge_candidates: Vec::new(),
        })
    }
}
