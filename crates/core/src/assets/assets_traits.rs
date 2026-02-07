use super::assets_model::{
    Asset, AssetMetadata, AssetSpec, EnsureAssetsResult, NewAsset, UpdateAssetProfile,
};
use crate::errors::Result;

/// Trait defining the contract for Asset service operations.
#[async_trait::async_trait]
pub trait AssetServiceTrait: Send + Sync {
    fn get_assets(&self) -> Result<Vec<Asset>>;
    fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset>;
    async fn delete_asset(&self, asset_id: &str) -> Result<()>;
    async fn update_asset_profile(
        &self,
        asset_id: &str,
        payload: UpdateAssetProfile,
    ) -> Result<Asset>;
    /// Creates a new asset directly without network lookups.
    /// Used for alternative assets and other manually created assets.
    async fn create_asset(&self, new_asset: NewAsset) -> Result<Asset>;
    /// Creates a minimal asset without network calls.
    /// Returns the existing asset if found, or creates a new minimal one.
    /// Accepts optional metadata hints from the caller (e.g., user-provided asset details).
    /// If `quote_mode_hint` is provided, it overrides the default quote mode for the asset kind.
    /// Should be followed by an enrichment event for full profile data.
    async fn get_or_create_minimal_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
        metadata: Option<AssetMetadata>,
        quote_mode_hint: Option<String>,
    ) -> Result<Asset>;
    async fn update_quote_mode(&self, asset_id: &str, quote_mode: &str) -> Result<Asset>;
    async fn get_assets_by_asset_ids(&self, asset_ids: &[String]) -> Result<Vec<Asset>>;
    /// Enriches an existing asset's profile with data from market data provider.
    /// Updates the profile JSON (sectors, countries, website) and notes fields.
    async fn enrich_asset_profile(&self, asset_id: &str) -> Result<Asset>;

    /// Enriches multiple assets in batch, with deduplication and sync state tracking.
    /// Checks if each asset needs enrichment before fetching profile data.
    /// Returns (enriched_count, skipped_count, failed_count).
    async fn enrich_assets(&self, asset_ids: Vec<String>) -> Result<(usize, usize, usize)>;

    /// Removes the $.legacy structure from asset metadata after migration.
    /// Preserves $.identifiers if present.
    async fn cleanup_legacy_metadata(&self, asset_id: &str) -> Result<()>;

    /// Merges an UNKNOWN asset into a resolved asset.
    /// - Copies user metadata (notes) from UNKNOWN to resolved
    /// - Reassigns all activities from UNKNOWN to resolved
    /// - Deactivates the UNKNOWN asset
    /// - Emits assets_merged domain event
    /// Returns the number of activities migrated.
    async fn merge_unknown_asset(
        &self,
        resolved_asset_id: &str,
        unknown_asset_id: &str,
        activity_repository: &dyn crate::activities::ActivityRepositoryTrait,
    ) -> Result<u32>;

    /// Ensures multiple assets exist, creating any that are missing.
    /// Returns existing + created assets, plus any UNKNOWN→resolved merge candidates.
    ///
    /// This is the batch version of `get_or_create_minimal_asset()`.
    /// Use this for bulk operations like CSV import or broker sync.
    async fn ensure_assets(
        &self,
        specs: Vec<AssetSpec>,
        activity_repository: &dyn crate::activities::ActivityRepositoryTrait,
    ) -> Result<EnsureAssetsResult>;
}

/// Trait defining the contract for Asset repository operations.
#[async_trait::async_trait]
pub trait AssetRepositoryTrait: Send + Sync {
    async fn create(&self, new_asset: NewAsset) -> Result<Asset>;
    /// Creates multiple assets in a single transaction. All-or-nothing.
    async fn create_batch(&self, new_assets: Vec<NewAsset>) -> Result<Vec<Asset>>;
    async fn update_profile(&self, asset_id: &str, payload: UpdateAssetProfile) -> Result<Asset>;
    async fn update_quote_mode(&self, asset_id: &str, quote_mode: &str) -> Result<Asset>;
    fn get_by_id(&self, asset_id: &str) -> Result<Asset>;
    fn list(&self) -> Result<Vec<Asset>>;
    fn list_by_asset_ids(&self, asset_ids: &[String]) -> Result<Vec<Asset>>;
    async fn delete(&self, asset_id: &str) -> Result<()>;

    /// Search for assets by symbol (case-insensitive partial match).
    /// Used for merging existing assets into search results.
    fn search_by_symbol(&self, query: &str) -> Result<Vec<Asset>>;

    /// Find an asset by its instrument_key (e.g., "FX:EUR/USD", "EQUITY:AAPL@XNAS").
    /// Returns None if not found.
    fn find_by_instrument_key(&self, instrument_key: &str) -> Result<Option<Asset>>;

    /// Removes the $.legacy structure from asset metadata.
    /// Preserves $.identifiers if present.
    async fn cleanup_legacy_metadata(&self, asset_id: &str) -> Result<()>;

    /// Deactivates an asset (sets is_active=0).
    /// Used when merging UNKNOWN assets into resolved ones.
    async fn deactivate(&self, asset_id: &str) -> Result<()>;

    /// Copies user-editable fields from source asset to target asset.
    /// Used during UNKNOWN asset merge to preserve user customizations.
    async fn copy_user_metadata(&self, source_id: &str, target_id: &str) -> Result<()>;
}
