//! Provider registry module.
//!
//! This module provides orchestration for market data providers, including:
//! - Provider registration and priority ordering
//! - Rate limiting per provider
//! - Circuit breaking for fault tolerance
//! - Quote data validation

mod circuit_breaker;
mod provider_registry;
mod rate_limiter;
mod skip_reason;
mod validator;

pub use circuit_breaker::{CircuitBreaker, CircuitState};
pub use provider_registry::ProviderRegistry;
pub use rate_limiter::{RateLimitConfig, RateLimiter};
pub use skip_reason::{FetchDiagnostics, ProviderAttempt, SkipReason};
pub use validator::{QuoteValidator, ValidationSeverity};
