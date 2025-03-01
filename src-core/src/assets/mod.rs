pub(crate) mod assets_constants;
pub(crate) mod assets_errors;
pub(crate) mod assets_model;
pub(crate) mod assets_repository;
pub(crate) mod assets_service;

// Re-export the public interface
pub use assets_constants::*;
pub use assets_model::{Asset, NewAsset, UpdateAssetProfile, AssetProfile, Quote};
pub use assets_repository::AssetRepository;
pub use assets_service::AssetService;

// Re-export error types for convenience
pub use assets_errors::{AssetError, Result};
