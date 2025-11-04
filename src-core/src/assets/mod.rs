pub(crate) mod assets_constants;
// pub(crate) mod assets_errors;
pub(crate) mod assets_model;
pub(crate) mod assets_repository;
pub(crate) mod assets_service;
pub(crate) mod assets_traits;

// Re-export the public interface
pub use assets_constants::*;
pub use assets_model::{Asset, NewAsset, UpdateAssetProfile};
pub use assets_repository::AssetRepository;
pub use assets_service::AssetService;
pub use assets_traits::{AssetRepositoryTrait, AssetServiceTrait};

// Re-export error types for convenience
// pub use assets_errors::{AssetError, Result};
