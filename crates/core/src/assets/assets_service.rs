use log::{debug, error};
use std::sync::Arc;

use crate::quotes::QuoteServiceTrait;

use super::assets_model::{Asset, AssetKind, NewAsset, PricingMode, UpdateAssetProfile};
use super::assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
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
        })
    }
}

// Implement the service trait
#[async_trait::async_trait]
impl AssetServiceTrait for AssetService {
    /// Lists all assets
    fn get_assets(&self) -> Result<Vec<Asset>> {
        self.asset_repository.list()
    }

    /// Retrieves an asset by its ID
    fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset> {
        self.asset_repository.get_by_id(asset_id)
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

    /// Retrieves or creates an asset by its ID
    async fn get_or_create_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
    ) -> Result<Asset> {
        match self.asset_repository.get_by_id(asset_id) {
            Ok(existing_asset) => Ok(existing_asset),
            Err(Error::Database(DatabaseError::NotFound(_))) => {
                debug!(
                    "Asset not found locally, attempting to fetch from market data: {}",
                    asset_id
                );
                let asset_profile_from_provider =
                    self.quote_service.get_asset_profile(asset_id).await?;

                let mut new_asset: NewAsset = asset_profile_from_provider.into();

                // If the asset profile didn't provide a currency (e.g., generic manual asset)
                // and a context currency is available, use the context currency.
                if new_asset.currency.is_empty() {
                    if let Some(curr) = context_currency {
                        if !curr.is_empty() {
                            new_asset.currency = curr;
                        }
                    }
                }

                // will ensure currency is not empty before insertion.
                return self.asset_repository.create(new_asset).await;
            }
            Err(e) => {
                error!("Error fetching asset by ID '{}': {}", asset_id, e);
                Err(e)
            }
        }
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

    /// Updates the data source for an asset
    async fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        self.asset_repository
            .update_data_source(asset_id, data_source)
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

        // Fetch profile from provider using the symbol, not the canonical asset_id
        // The provider expects symbols like "AAPL", not "SEC:AAPL:XNAS"
        let provider_profile = match self.quote_service.get_asset_profile(&existing_asset.symbol).await {
            Ok(profile) => profile,
            Err(e) => {
                debug!(
                    "Could not fetch profile for asset {} (symbol: {}): {}",
                    asset_id, existing_asset.symbol, e
                );
                return Ok(existing_asset);
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

        // Build profile update from provider data
        // Note: sectors/countries/classifications now come from taxonomies, not stored on asset
        let mut update = UpdateAssetProfile {
            symbol: existing_asset.symbol.clone(),
            name: provider_profile.name.or(existing_asset.name.clone()),
            notes: existing_asset.notes.clone().unwrap_or_default(),
            kind: updated_kind,
            exchange_mic: None, // Keep existing exchange_mic
            pricing_mode: Some(existing_asset.pricing_mode.clone()),
            provider_overrides: existing_asset.provider_overrides.clone(),
        };

        // Update notes with description if notes is empty and provider has notes
        if update.notes.is_empty() {
            if let Some(ref notes) = provider_profile.notes {
                update.notes = notes.clone();
            }
        }

        debug!(
            "Enriching asset {} with provider profile: kind={:?}, name={:?}",
            asset_id, update.kind, update.name
        );

        self.asset_repository
            .update_profile(asset_id, update)
            .await
    }
}
