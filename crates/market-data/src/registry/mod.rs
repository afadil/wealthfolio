//! Provider registry module.
//!
//! This module provides orchestration for market data providers, including:
//! - Provider registration and priority ordering
//! - Rate limiting per provider
//! - Circuit breaking for fault tolerance
//! - Quote data validation

mod circuit_breaker;
mod rate_limiter;
mod registry;
mod validator;

pub use circuit_breaker::{CircuitBreaker, CircuitState};
pub use rate_limiter::RateLimiter;
pub use registry::ProviderRegistry;
pub use validator::QuoteValidator;
