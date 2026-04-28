//! Rebalancing module - cash-first, buy-only rebalancing advisor.
//!
//! This module provides functionality to calculate trade recommendations
//! that move a portfolio closer to its target allocation using only available
//! cash (no selling).

pub mod rebalancing_model;
pub mod rebalancing_service;

pub use rebalancing_model::{RebalancingInput, RebalancingPlan, TradeRecommendation};
pub use rebalancing_service::{RebalancingService, RebalancingServiceImpl};
