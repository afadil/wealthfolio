//! Assets module - domain models, services, and traits.

mod asset_id;
mod alternative_assets_model;
mod alternative_assets_service;
mod alternative_assets_traits;
mod assets_constants;
mod assets_model;
mod assets_service;
mod assets_traits;
mod classification_service;

#[cfg(test)]
mod assets_model_tests;

// Re-export the public interface
pub use asset_id::{
    // Constants
    ASSET_ID_DELIMITER, CASH_PREFIX, COLLECTIBLE_PREFIX, LIABILITY_PREFIX, OTHER_PREFIX,
    PRECIOUS_PREFIX, PROPERTY_PREFIX, VEHICLE_PREFIX,
    // ID Constructors
    alternative_id, cash_id, crypto_id, fx_id, security_id,
    // ID Parsing
    parse_asset_id, ParsedAssetId,
    // Alternative Asset ID Generation
    generate_asset_id, get_asset_id_prefix, get_kind_from_asset_id, is_valid_alternative_asset_id,
    try_generate_asset_id,
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
pub use classification_service::{AssetClassificationService, AssetClassifications, CategoryWithWeight};
