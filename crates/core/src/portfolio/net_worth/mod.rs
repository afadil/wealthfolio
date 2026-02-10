//! Net worth calculation module.
//!
//! This module provides services for calculating net worth across all accounts,
//! with breakdown by asset category and staleness tracking.

mod net_worth_model;
mod net_worth_service;
mod net_worth_traits;

pub use net_worth_model::*;
pub use net_worth_service::*;
pub use net_worth_traits::*;

#[cfg(test)]
mod net_worth_service_tests;
