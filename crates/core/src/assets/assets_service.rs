use log::{debug, error, info, warn};
use std::sync::Arc;

use crate::quotes::QuoteServiceTrait;
use crate::taxonomies::TaxonomyServiceTrait;

use super::assets_model::{Asset, AssetKind, NewAsset, PricingMode, UpdateAssetProfile};
use super::assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
use super::auto_classification::{AutoClassificationService, ClassificationInput};
use crate::errors::{DatabaseError, Error, Result};

// Import mic_to_currency for resolving exchange trading currencies
use wealthfolio_market_data::mic_to_currency;

/// Infers asset kind from asset ID.
///
/// Design principles:
/// 1. First try to parse from canonical ID format (e.g., "SEC:AAPL:XNAS", "CASH:USD")
/// 2. Fall back to legacy system-defined prefixes
/// 3. Default to Security for unknown patterns
/// 4. Let async enrichment correct the kind based on provider data
fn infer_asset_kind(asset_id: &str) -> AssetKind {
    // First try to parse from canonical ID format (e.g., "SEC:AAPL:XNAS", "CASH:USD")
    if let Some(kind) = super::kind_from_asset_id(asset_id) {
        return kind;
    }

    // Legacy system-defined prefixes (deterministic patterns)
    match asset_id {
        s if s.starts_with("$CASH-") => AssetKind::Cash,
        s if s.starts_with("$UNKNOWN-") => AssetKind::Security,
        // Alternative asset prefixes (user-created convention)
        s if s.starts_with("PROP-") => AssetKind::Property,
        s if s.starts_with("VEH-") => AssetKind::Vehicle,
        s if s.starts_with("COLL-") => AssetKind::Collectible,
        s if s.starts_with("PREC-") => AssetKind::PhysicalPrecious,
        s if s.starts_with("LIAB-") => AssetKind::Liability,
        s if s.starts_with("ALT-") => AssetKind::Other,
        // Default: Security (most common, enrichment will correct if needed)
        _ => AssetKind::Security,
    }
}

/// Converts a provider's asset_type string to our AssetKind enum.
/// Provider data uses various naming conventions (e.g., "CRYPTOCURRENCY", "ETF", "Equity").
/// Returns None if the string doesn't map to a known kind (caller decides fallback).
fn parse_asset_kind_from_provider(asset_type: &str) -> Option<AssetKind> {
    // Normalize to uppercase for case-insensitive matching
    match asset_type.to_uppercase().as_str() {
        // Crypto variants
        "CRYPTOCURRENCY" | "CRYPTO" => Some(AssetKind::Crypto),
        // Equity/Security variants (most providers)
        "EQUITY" | "STOCK" | "ETF" | "MUTUALFUND" | "MUTUAL FUND" | "INDEX" => {
            Some(AssetKind::Security)
        }
        // Currency/FX
        "CURRENCY" | "FOREX" | "FX" => Some(AssetKind::FxRate),
        // Cash (rare from providers, usually internal)
        "CASH" => Some(AssetKind::Cash),
        // Commodity
        "COMMODITY" => Some(AssetKind::Commodity),
        // Option
        "OPTION" => Some(AssetKind::Option),
        // Unknown/unmapped - let caller decide
        _ => None,
    }
}

/// Service for managing assets
pub struct AssetService {
    quote_service: Arc<dyn QuoteServiceTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
    taxonomy_service: Option<Arc<dyn TaxonomyServiceTrait>>,
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
        })
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
        self.asset_repository.get_by_id(asset_id).map(|a| a.enrich())
    }

    async fn delete_asset(&self, asset_id: &str) -> Result<()> {
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

    /// Lists currency assets for a given base currency
    fn load_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>> {
        self.asset_repository.list_cash_assets(base_currency)
    }

    /// Creates a new cash asset
    async fn create_cash_asset(&self, currency: &str) -> Result<Asset> {
        let new_asset = NewAsset::new_cash_asset(currency);
        self.asset_repository.create(new_asset).await
    }

    /// Creates a new asset directly without network lookups.
    async fn create_asset(&self, new_asset: NewAsset) -> Result<Asset> {
        self.asset_repository.create(new_asset).await
    }

    /// Creates a minimal asset without network calls.
    /// Returns the existing asset if found, or creates a new minimal one.
    /// Accepts optional metadata hints from the caller (e.g., user-provided asset details).
    async fn get_or_create_minimal_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
        metadata: Option<super::assets_model::AssetMetadata>,
    ) -> Result<Asset> {
        // Try to get existing asset first
        match self.asset_repository.get_by_id(asset_id) {
            Ok(existing_asset) => return Ok(existing_asset),
            Err(Error::Database(DatabaseError::NotFound(_))) => {
                // Continue to create minimal asset
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

        // Use metadata kind if provided, otherwise infer from symbol pattern
        let kind = metadata
            .as_ref()
            .and_then(|m| m.kind.clone())
            .unwrap_or_else(|| infer_asset_kind(asset_id));

        // Determine pricing mode based on kind
        let pricing_mode = match &kind {
            AssetKind::Cash => PricingMode::None,
            AssetKind::Crypto | AssetKind::Security => PricingMode::Market,
            // Alternative assets use manual pricing
            _ => PricingMode::Manual,
        };

        // Extract optional fields from metadata
        let (name, exchange_mic_from_metadata) = metadata
            .map(|m| (m.name, m.exchange_mic))
            .unwrap_or_default();

        // Extract symbol from canonical asset ID format (e.g., "SEC:AAPL:XNAS" -> "AAPL")
        // Falls back to asset_id if parsing fails (for legacy IDs)
        let (symbol, exchange_mic_from_id) =
            if let Some(parsed) = super::parse_canonical_asset_id(asset_id) {
                let mic = if parsed.qualifier.is_empty()
                    || parsed.qualifier == "UNKNOWN"
                    || kind == AssetKind::Cash
                    || kind == AssetKind::Crypto
                    || kind == AssetKind::FxRate
                {
                    None
                } else {
                    Some(parsed.qualifier)
                };
                (parsed.symbol, mic)
            } else if kind == AssetKind::Crypto && asset_id.contains('-') {
                // Legacy crypto format: "BTC-CAD" -> symbol "BTC"
                let base = asset_id
                    .split('-')
                    .next()
                    .unwrap_or(asset_id)
                    .to_string();
                (base, None)
            } else {
                // Fallback for legacy IDs
                (asset_id.to_string(), None)
            };

        // Prefer metadata exchange_mic over one parsed from ID
        let exchange_mic = exchange_mic_from_metadata.or(exchange_mic_from_id);

        // Determine currency:
        // 1. For market-priced assets with an exchange MIC, use the exchange's trading currency
        // 2. Fall back to context_currency (account currency) or USD
        let currency = if pricing_mode == PricingMode::Market {
            exchange_mic
                .as_ref()
                .and_then(|mic| mic_to_currency(mic))
                .map(|c| c.to_string())
                .or_else(|| context_currency.filter(|c| !c.is_empty()))
                .unwrap_or_else(|| "USD".to_string())
        } else {
            // Non-market assets use context currency or USD
            context_currency
                .filter(|c| !c.is_empty())
                .unwrap_or_else(|| "USD".to_string())
        };

        // Set preferred provider based on pricing mode
        let preferred_provider = match pricing_mode {
            PricingMode::Market => Some("YAHOO".to_string()),
            PricingMode::Manual => Some("MANUAL".to_string()),
            PricingMode::None | PricingMode::Derived => None, // Cash/derived assets don't need a provider
        };

        // Create minimal asset with optional metadata
        let new_asset = NewAsset {
            id: Some(asset_id.to_string()),
            kind,
            name,
            symbol,
            exchange_mic,
            currency,
            pricing_mode,
            preferred_provider,
            is_active: true,
            ..Default::default()
        };

        debug!(
            "Creating minimal asset: id={}, kind={:?}, pricing_mode={:?}, name={:?}",
            asset_id, new_asset.kind, new_asset.pricing_mode, new_asset.name
        );

        self.asset_repository.create(new_asset).await
    }

    /// Updates the pricing mode for an asset (MARKET, MANUAL, DERIVED, NONE)
    async fn update_pricing_mode(&self, asset_id: &str, pricing_mode: &str) -> Result<Asset> {
        self.asset_repository
            .update_pricing_mode(asset_id, pricing_mode)
            .await
    }

    async fn get_assets_by_symbols(&self, symbols: &[String]) -> Result<Vec<Asset>> {
        self.asset_repository.list_by_symbols(symbols)
    }

    /// Enriches an existing asset's profile with data from market data provider.
    /// Updates the profile JSON (sectors, countries, website) and notes fields.
    async fn enrich_asset_profile(&self, asset_id: &str) -> Result<Asset> {
        // Get the existing asset
        let existing_asset = self.asset_repository.get_by_id(asset_id)?;

        // Skip enrichment for assets that don't need market data
        if existing_asset.pricing_mode != super::assets_model::PricingMode::Market {
            debug!(
                "Skipping enrichment for asset {} - pricing mode is {:?}",
                asset_id, existing_asset.pricing_mode
            );
            return Ok(existing_asset);
        }

        // Fetch profile from provider using the asset (resolver handles exchange suffix)
        debug!(
            "Fetching profile for asset {} (symbol: {}, exchange: {:?})",
            asset_id, existing_asset.symbol, existing_asset.exchange_mic
        );

        let provider_profile = match self.quote_service.get_asset_profile(&existing_asset).await {
            Ok(profile) => profile,
            Err(e) => {
                // Return error so caller knows enrichment failed and won't mark as enriched
                // This allows retry on next sync cycle
                return Err(Error::MarketData(crate::quotes::MarketDataError::ProviderError(
                    format!("Could not fetch profile for asset {} (symbol: {}): {}",
                        asset_id, existing_asset.symbol, e)
                )));
            }
        };

        // Derive kind from provider's asset_type if available
        // Only update kind if current kind is the default (Security) and provider has data
        let inferred_kind = provider_profile
            .asset_type
            .as_ref()
            .and_then(|t| parse_asset_kind_from_provider(t));

        // Only override kind if we got a meaningful value from provider
        // and the current kind is the default inferred value
        let updated_kind = if existing_asset.kind == AssetKind::Security {
            inferred_kind
        } else {
            None // Keep existing non-default kind
        };

        // Build provider profile metadata for storage
        // This captures sector/industry/country/quote_type for display and future auto-classification
        let mut profile_metadata = serde_json::Map::new();
        // ProviderProfile uses JSON strings for sectors/countries (legacy format)
        if let Some(ref sectors) = provider_profile.sectors {
            profile_metadata.insert("sectors".to_string(), serde_json::Value::String(sectors.clone()));
        }
        if let Some(ref industry) = provider_profile.industry {
            profile_metadata.insert("industry".to_string(), serde_json::Value::String(industry.clone()));
        }
        if let Some(ref countries) = provider_profile.countries {
            profile_metadata.insert("countries".to_string(), serde_json::Value::String(countries.clone()));
        }
        if let Some(ref asset_type) = provider_profile.asset_type {
            profile_metadata.insert("quoteType".to_string(), serde_json::Value::String(asset_type.clone()));
        }
        if let Some(ref url) = provider_profile.url {
            profile_metadata.insert("website".to_string(), serde_json::Value::String(url.clone()));
        }
        if let Some(market_cap) = provider_profile.market_cap {
            profile_metadata.insert("marketCap".to_string(), serde_json::json!(market_cap));
        }
        if let Some(pe_ratio) = provider_profile.pe_ratio {
            profile_metadata.insert("peRatio".to_string(), serde_json::json!(pe_ratio));
        }
        if let Some(dividend_yield) = provider_profile.dividend_yield {
            profile_metadata.insert("dividendYield".to_string(), serde_json::json!(dividend_yield));
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
            // Add/update profile data under a "profile" key to avoid conflicts
            merged.insert("profile".to_string(), serde_json::Value::Object(profile_metadata));
            Some(serde_json::Value::Object(merged))
        };

        // Build profile update from provider data
        // Note: sectors/countries/classifications come from taxonomies, but profile data is stored for reference
        let mut update = UpdateAssetProfile {
            symbol: existing_asset.symbol.clone(),
            name: provider_profile.name.or(existing_asset.name.clone()),
            notes: existing_asset.notes.clone().unwrap_or_default(),
            kind: updated_kind,
            exchange_mic: None, // Keep existing exchange_mic
            pricing_mode: Some(existing_asset.pricing_mode.clone()),
            provider_overrides: existing_asset.provider_overrides.clone(),
            metadata: updated_metadata,
        };

        // Update notes with description if notes is empty and provider has notes
        if update.notes.is_empty() {
            if let Some(ref notes) = provider_profile.notes {
                update.notes = notes.clone();
            }
        }

        debug!(
            "Enriching asset {} with provider profile: kind={:?}, name={:?}, sectors={:?}, industry={:?}, countries={:?}, asset_type={:?}",
            asset_id, update.kind, update.name, provider_profile.sectors, provider_profile.industry, provider_profile.countries, provider_profile.asset_type
        );

        let updated_asset = self
            .asset_repository
            .update_profile(asset_id, update)
            .await?;

        // Auto-classify asset based on provider profile data
        // Note: ProviderProfile already has sectors/countries as JSON arrays
        // (convert_profile converts single sector/country to JSON arrays)
        if let Some(taxonomy_service) = &self.taxonomy_service {
            let classification_input = ClassificationInput::from_provider_profile(
                provider_profile.asset_type.as_deref(),
                None,                                   // Single sector (already in sectors JSON)
                provider_profile.sectors.as_deref(),    // Sector weightings JSON
                None,                                   // Single country (already in countries JSON)
                provider_profile.countries.as_deref(),  // Country weightings JSON
                existing_asset.exchange_mic.as_deref(), // Fallback for ETF region (fund domicile)
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
                    // Log but don't fail - auto-classification is best-effort
                    debug!("Auto-classification failed for {}: {}", asset_id, e);
                }
            }
        }

        Ok(updated_asset)
    }

    /// Enriches multiple assets in batch, with deduplication and sync state tracking.
    /// This is the shared implementation used by both Tauri and web server.
    ///
    /// Automatically filters out assets that shouldn't be enriched (cash, FX, alternative assets)
    /// and checks sync state to avoid re-enriching already enriched assets.
    async fn enrich_assets(&self, asset_ids: Vec<String>) -> Result<(usize, usize, usize)> {
        use super::should_enrich_asset;
        use std::collections::HashSet;

        if asset_ids.is_empty() {
            return Ok((0, 0, 0));
        }

        // Deduplicate and filter to only enrichable assets
        let unique_ids: Vec<String> = asset_ids
            .into_iter()
            .filter(|id| should_enrich_asset(id))
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
                Ok(None) => true, // No sync state yet, try enrichment
                Err(_) => true,   // Error checking state, try enrichment
            };

            if !needs_enrichment {
                debug!("Skipping enrichment for {} - already enriched", asset_id);
                skipped_count += 1;
                continue;
            }

            // Try to enrich the asset profile
            match self.enrich_asset_profile(&asset_id).await {
                Ok(_) => {
                    // Mark as enriched in sync state
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
        self.asset_repository.cleanup_legacy_metadata(asset_id).await
    }
}
