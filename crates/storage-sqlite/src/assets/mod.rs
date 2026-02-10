//! SQLite storage implementation for assets.

mod alternative_repository;
mod model;
mod repository;

pub use alternative_repository::AlternativeAssetRepository;
pub use model::{AssetDB, InsertableAssetDB};
pub use repository::AssetRepository;
