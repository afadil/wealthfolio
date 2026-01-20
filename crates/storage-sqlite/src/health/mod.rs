//! Health center storage module.
//!
//! Provides persistence for health issue dismissals.

pub mod model;
pub mod repository;

pub use model::HealthIssueDismissalDB;
pub use repository::HealthDismissalRepository;
