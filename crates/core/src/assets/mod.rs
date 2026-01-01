//! Assets module - domain models, services, and traits.

mod assets_constants;
mod assets_model;
mod assets_service;
mod assets_traits;

#[cfg(test)]
mod assets_model_tests;

// Re-export the public interface
pub use assets_constants::*;
pub use assets_model::{Asset, AssetKind, Country, NewAsset, OptionSpec, Sector, UpdateAssetProfile};
pub use assets_service::AssetService;
pub use assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
