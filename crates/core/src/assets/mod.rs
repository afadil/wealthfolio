//! Assets module - domain models, services, and traits.

mod asset_id;
mod alternative_assets_model;
mod alternative_assets_service;
mod alternative_assets_traits;
mod assets_constants;
mod assets_model;
mod assets_service;
mod assets_traits;

#[cfg(test)]
mod assets_model_tests;

// Re-export the public interface
pub use asset_id::{
    generate_asset_id, get_asset_id_prefix, get_kind_from_asset_id, is_valid_alternative_asset_id,
    try_generate_asset_id, COLLECTIBLE_PREFIX, LIABILITY_PREFIX, OTHER_PREFIX, PRECIOUS_PREFIX,
    PROPERTY_PREFIX, VEHICLE_PREFIX,
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
