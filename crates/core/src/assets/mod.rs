//! Assets module - domain models, services, and traits.

mod alternative_assets_model;
mod alternative_assets_service;
mod alternative_assets_traits;
mod asset_id;
mod assets_constants;
mod assets_model;
mod assets_service;
mod assets_traits;
mod auto_classification;
mod classification_service;

#[cfg(test)]
mod assets_model_tests;

// Re-export the public interface
pub use alternative_assets_model::{
    AlternativeHolding, CreateAlternativeAssetRequest, CreateAlternativeAssetResponse,
    LinkLiabilityRequest, LinkLiabilityResponse, UpdateValuationRequest, UpdateValuationResponse,
};
pub use alternative_assets_service::AlternativeAssetService;
pub use alternative_assets_traits::{
    AlternativeAssetRepositoryTrait, AlternativeAssetServiceTrait,
};
pub use asset_id::{
    // ID Constructors
    alternative_id,
    // Canonical ID Generation
    canonical_asset_id,
    // Yahoo symbol parsing helpers
    parse_symbol_with_exchange_suffix,
    security_id_from_symbol,
    security_id_from_symbol_with_mic,
    // Alternative Asset ID Generation
    generate_asset_id,
    get_asset_id_prefix,
    get_kind_from_asset_id,
    // Helper functions
    is_cash_asset_id,
    is_fx_asset_id,
    is_valid_alternative_asset_id,
    kind_from_asset_id,
    needs_market_quotes,
    // ID Parsing
    parse_asset_id,
    parse_canonical_asset_id,
    random_suffix,
    should_enrich_asset,
    try_generate_asset_id,
    ParsedAssetId,
    // Constants - typed prefixes
    ASSET_ID_DELIMITER,
    CASH_PREFIX,
    COLLECTIBLE_PREFIX,
    COMMODITY_PREFIX,
    CRYPTO_PREFIX,
    FX_PREFIX,
    LIABILITY_PREFIX,
    OPTION_PREFIX,
    OTHER_PREFIX,
    PRECIOUS_PREFIX,
    PRIVATE_EQUITY_PREFIX,
    PROPERTY_PREFIX,
    SECURITY_PREFIX,
    VEHICLE_PREFIX,
};
pub use assets_constants::*;
pub use assets_model::{
    Asset, AssetKind, AssetMetadata, Country, InstrumentId, NewAsset, OptionSpec, PricingMode,
    ProviderProfile, Sector, UpdateAssetProfile,
};
pub use assets_service::AssetService;
pub use assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
pub use auto_classification::{
    AutoClassificationService, ClassificationInput, ClassificationResult,
};
pub use classification_service::{
    AssetClassificationService, AssetClassifications, CategoryWithWeight,
};
