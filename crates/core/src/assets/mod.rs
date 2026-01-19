//! Assets module - domain models, services, and traits.

mod asset_id;
mod alternative_assets_model;
mod alternative_assets_service;
mod alternative_assets_traits;
mod assets_constants;
mod assets_model;
mod assets_service;
mod assets_traits;
mod auto_classification;
mod classification_service;

#[cfg(test)]
mod assets_model_tests;

// Re-export the public interface
pub use asset_id::{
    // Constants - All typed prefixes
    ASSET_ID_DELIMITER, CASH_PREFIX, COLLECTIBLE_PREFIX, COMMODITY_PREFIX, CRYPTO_PREFIX,
    FX_PREFIX, LEGACY_CASH_PREFIX, LIABILITY_PREFIX, OPTION_PREFIX, OTHER_PREFIX, PRECIOUS_PREFIX,
    PRIVATE_EQUITY_PREFIX, PROPERTY_PREFIX, SECURITY_PREFIX, VEHICLE_PREFIX,
    // ID Constructors (Legacy format)
    alternative_id, cash_id, crypto_id, fx_id, security_id,
    // Canonical ID Generation (New typed prefix format)
    canonical_asset_id, kind_from_asset_id, parse_canonical_asset_id, random_suffix,
    // ID Parsing (supports both canonical and legacy formats)
    parse_asset_id, ParsedAssetId,
    // Alternative Asset ID Generation
    generate_asset_id, get_asset_id_prefix, get_kind_from_asset_id, is_valid_alternative_asset_id,
    try_generate_asset_id,
    // Helper functions for checking asset ID types
    is_cash_asset_id, is_fx_asset_id, should_enrich_asset,
};
pub use alternative_assets_model::{
    AlternativeHolding, CreateAlternativeAssetRequest, CreateAlternativeAssetResponse,
    LinkLiabilityRequest, LinkLiabilityResponse, UpdateValuationRequest, UpdateValuationResponse,
};
pub use alternative_assets_service::AlternativeAssetService;
pub use alternative_assets_traits::{
    AlternativeAssetRepositoryTrait, AlternativeAssetServiceTrait,
};
pub use assets_constants::*;
pub use assets_model::{
    Asset, AssetKind, AssetMetadata, Country, InstrumentId, NewAsset, OptionSpec, PricingMode,
    ProviderProfile, Sector, UpdateAssetProfile,
};
pub use assets_service::AssetService;
pub use assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
pub use auto_classification::{AutoClassificationService, ClassificationInput, ClassificationResult};
pub use classification_service::{AssetClassificationService, AssetClassifications, CategoryWithWeight};
