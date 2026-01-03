//! Provider capabilities and rate limiting configuration.
//!
//! This module defines structures for describing what a market data provider
//! can do and how it should be rate-limited.

use std::time::Duration;

use crate::models::AssetKind;

/// Describes the capabilities of a market data provider.
///
/// Used by the registry to determine which providers can handle
/// specific asset types and request patterns.
#[derive(Clone, Debug)]
pub struct ProviderCapabilities {
    /// Asset kinds this provider supports (e.g., Security, Crypto, FxRate).
    pub asset_kinds: &'static [AssetKind],

    /// Whether the provider supports historical quote fetching.
    pub supports_historical: bool,

    /// Whether the provider supports symbol/asset search.
    pub supports_search: bool,
}

/// Rate limiting configuration for a provider.
///
/// Controls how aggressively we can call a provider to avoid
/// hitting their rate limits and getting blocked.
#[derive(Clone, Debug)]
pub struct RateLimit {
    /// Maximum requests allowed per minute.
    pub requests_per_minute: u32,

    /// Maximum concurrent requests to this provider.
    pub max_concurrency: usize,

    /// Minimum delay between requests.
    pub min_delay: Duration,
}

impl Default for RateLimit {
    fn default() -> Self {
        Self {
            requests_per_minute: 60,
            max_concurrency: 5,
            min_delay: Duration::from_millis(100),
        }
    }
}
