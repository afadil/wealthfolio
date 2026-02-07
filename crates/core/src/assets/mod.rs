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
    LinkLiabilityRequest, LinkLiabilityResponse, UpdateAssetDetailsRequest,
    UpdateAssetDetailsResponse, UpdateValuationRequest, UpdateValuationResponse,
};
pub use alternative_assets_service::AlternativeAssetService;
pub use alternative_assets_traits::{
    AlternativeAssetRepositoryTrait, AlternativeAssetServiceTrait,
};
pub use asset_id::{
    parse_crypto_pair_symbol, parse_symbol_with_exchange_suffix,
};
pub use assets_model::{
    Asset, AssetKind, AssetMetadata, AssetSpec, Country, EnsureAssetsResult, InstrumentId,
    InstrumentType, NewAsset, OptionSpec, ProviderProfile, QuoteMode, Sector, UpdateAssetProfile,
};
pub use assets_service::AssetService;
pub use assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
pub use auto_classification::{
    AutoClassificationService, ClassificationInput, ClassificationResult,
};
pub use classification_service::{
    AssetClassificationService, AssetClassifications, CategoryWithWeight,
};
