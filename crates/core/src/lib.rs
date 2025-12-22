//! Wealthfolio Core - Domain entities, services, and traits.
//!
//! This crate contains the core business logic for Wealthfolio.
//! It is database-agnostic and defines traits that are implemented
//! by the `storage-sqlite` crate.

pub mod accounts;
pub mod activities;
pub mod addons;
pub mod assets;
pub mod constants;
pub mod errors;
pub mod fx;
pub mod goals;
pub mod limits;
pub mod market_data;
pub mod portfolio;
pub mod secrets;
pub mod settings;
pub mod utils;

// Re-export common types from asset and portfolio modules
pub use assets::*;
pub use portfolio::*;

// Re-export error types
pub use errors::Error;
pub use errors::Result;
