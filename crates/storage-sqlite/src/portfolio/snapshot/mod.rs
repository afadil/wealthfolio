//! SQLite storage implementation for portfolio snapshots.

mod model;
mod repository;

pub use model::AccountStateSnapshotDB;
pub use repository::SnapshotRepository;

// Re-export trait from core for convenience
pub use wealthfolio_core::portfolio::snapshot::SnapshotRepositoryTrait;
