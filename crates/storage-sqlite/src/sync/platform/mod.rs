//! SQLite storage implementation for platforms.

mod model;
mod repository;

pub use model::{Platform, PlatformDB};
pub use repository::PlatformRepository;
