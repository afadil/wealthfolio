//! Token bucket rate limiter for market data providers.
//!
//! Implements per-provider rate limiting using the token bucket algorithm.
//! Each provider gets its own bucket with configurable capacity and refill rate.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use log::{debug, warn};

/// Type alias for provider identifier.
pub type ProviderId = Cow<'static, str>;

/// Default rate limit: 60 requests per minute.
const DEFAULT_REQUESTS_PER_MINUTE: f64 = 60.0;

/// Default bucket capacity (allows bursting).
const DEFAULT_BUCKET_CAPACITY: f64 = 10.0;

/// Token bucket for a single provider.
#[derive(Debug)]
struct TokenBucket {
    /// Current number of available tokens.
    tokens: f64,
    /// Last time the bucket was updated.
    last_update: Instant,
    /// Token refill rate (tokens per second).
    rate: f64,
    /// Maximum bucket capacity.
    capacity: f64,
}

impl TokenBucket {
    /// Create a new token bucket with default settings.
    fn new() -> Self {
        Self {
            tokens: DEFAULT_BUCKET_CAPACITY,
            last_update: Instant::now(),
            rate: DEFAULT_REQUESTS_PER_MINUTE / 60.0, // Convert to per-second
            capacity: DEFAULT_BUCKET_CAPACITY,
        }
    }

    /// Create a token bucket with custom settings.
    fn with_config(requests_per_minute: u32, capacity: f64) -> Self {
        Self {
            tokens: capacity,
            last_update: Instant::now(),
            rate: requests_per_minute as f64 / 60.0,
            capacity,
        }
    }

    /// Refill tokens based on elapsed time.
    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_update).as_secs_f64();
        let new_tokens = elapsed * self.rate;

        self.tokens = (self.tokens + new_tokens).min(self.capacity);
        self.last_update = now;
    }

    /// Try to acquire a token immediately.
    /// Returns true if a token was available, false otherwise.
    fn try_acquire(&mut self) -> bool {
        self.refill();

        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }

    /// Calculate the wait time until a token becomes available.
    fn time_until_available(&mut self) -> Duration {
        self.refill();

        if self.tokens >= 1.0 {
            Duration::ZERO
        } else {
            let tokens_needed = 1.0 - self.tokens;
            let seconds_needed = tokens_needed / self.rate;
            Duration::from_secs_f64(seconds_needed)
        }
    }
}

/// Rate limiter configuration for a provider.
#[derive(Clone, Debug)]
pub struct RateLimitConfig {
    /// Maximum requests per minute.
    pub requests_per_minute: u32,
    /// Maximum burst capacity.
    pub burst_capacity: f64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            requests_per_minute: DEFAULT_REQUESTS_PER_MINUTE as u32,
            burst_capacity: DEFAULT_BUCKET_CAPACITY,
        }
    }
}

/// Token bucket rate limiter for multiple providers.
///
/// Thread-safe rate limiter that maintains per-provider token buckets.
/// Buckets are created on-demand with default settings, or can be
/// pre-configured with custom limits.
pub struct RateLimiter {
    /// Per-provider token buckets.
    buckets: Mutex<HashMap<String, TokenBucket>>,
    /// Per-provider configuration overrides.
    configs: Mutex<HashMap<String, RateLimitConfig>>,
}

impl RateLimiter {
    /// Create a new rate limiter with default settings.
    pub fn new() -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
            configs: Mutex::new(HashMap::new()),
        }
    }

    /// Lock the buckets mutex, recovering from poison if necessary.
    ///
    /// For rate limiting, it's safe to recover from a poisoned mutex since
    /// the worst case is slightly incorrect rate limiting, which is better
    /// than panicking.
    fn lock_buckets(&self) -> MutexGuard<'_, HashMap<String, TokenBucket>> {
        self.buckets.lock().unwrap_or_else(|poisoned| {
            warn!("Rate limiter buckets mutex was poisoned, recovering");
            poisoned.into_inner()
        })
    }

    /// Lock the configs mutex, recovering from poison if necessary.
    fn lock_configs(&self) -> MutexGuard<'_, HashMap<String, RateLimitConfig>> {
        self.configs.lock().unwrap_or_else(|poisoned| {
            warn!("Rate limiter configs mutex was poisoned, recovering");
            poisoned.into_inner()
        })
    }

    /// Configure rate limits for a specific provider.
    pub fn configure(&self, provider: &ProviderId, config: RateLimitConfig) {
        let mut configs = self.lock_configs();
        configs.insert(provider.to_string(), config);
        drop(configs); // Release configs lock before acquiring buckets lock

        // Reset the bucket if it already exists
        let mut buckets = self.lock_buckets();
        buckets.remove(provider.as_ref());
    }

    /// Acquire a token for the given provider.
    ///
    /// This method will wait (asynchronously) until a token is available.
    /// If the provider doesn't have a bucket yet, one is created with
    /// default settings.
    pub async fn acquire(&self, provider: &ProviderId) {
        loop {
            let wait_time = {
                let mut buckets = self.lock_buckets();

                let bucket = buckets
                    .entry(provider.to_string())
                    .or_insert_with(|| self.create_bucket(provider));

                if bucket.try_acquire() {
                    debug!("Rate limiter: acquired token for '{}'", provider);
                    return;
                }

                bucket.time_until_available()
            };

            if wait_time > Duration::ZERO {
                debug!(
                    "Rate limiter: waiting {:?} for provider '{}'",
                    wait_time, provider
                );
                tokio::time::sleep(wait_time).await;
            }
        }
    }

    /// Try to acquire a token without waiting.
    ///
    /// Returns true if a token was acquired, false if rate limited.
    pub fn try_acquire(&self, provider: &ProviderId) -> bool {
        let mut buckets = self.lock_buckets();

        let bucket = buckets
            .entry(provider.to_string())
            .or_insert_with(|| self.create_bucket(provider));

        bucket.try_acquire()
    }

    /// Get the remaining tokens for a provider.
    pub fn remaining_tokens(&self, provider: &ProviderId) -> f64 {
        let mut buckets = self.lock_buckets();

        if let Some(bucket) = buckets.get_mut(provider.as_ref()) {
            bucket.refill();
            bucket.tokens
        } else {
            DEFAULT_BUCKET_CAPACITY
        }
    }

    /// Reset the rate limiter for a provider.
    pub fn reset(&self, provider: &ProviderId) {
        let mut buckets = self.lock_buckets();
        buckets.remove(provider.as_ref());
    }

    /// Create a bucket for a provider, using custom config if available.
    fn create_bucket(&self, provider: &ProviderId) -> TokenBucket {
        let configs = self.lock_configs();

        if let Some(config) = configs.get(provider.as_ref()) {
            TokenBucket::with_config(config.requests_per_minute, config.burst_capacity)
        } else {
            TokenBucket::new()
        }
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;

    #[test]
    fn test_token_bucket_acquire() {
        let mut bucket = TokenBucket::new();

        // Should be able to acquire up to capacity tokens immediately
        for _ in 0..DEFAULT_BUCKET_CAPACITY as usize {
            assert!(bucket.try_acquire());
        }

        // Next acquire should fail (no tokens left)
        assert!(!bucket.try_acquire());
    }

    #[test]
    fn test_token_bucket_refill() {
        let mut bucket = TokenBucket::with_config(60, 1.0); // 1 token/second

        // Drain the bucket
        assert!(bucket.try_acquire());
        assert!(!bucket.try_acquire());

        // Manually advance time by simulating elapsed time
        bucket.last_update = Instant::now() - Duration::from_secs(2);

        // Should have refilled
        assert!(bucket.try_acquire());
    }

    #[test]
    fn test_rate_limiter_default_config() {
        let limiter = RateLimiter::new();
        let provider: ProviderId = Cow::Borrowed("TEST_PROVIDER");

        // Should be able to acquire default capacity tokens
        for _ in 0..DEFAULT_BUCKET_CAPACITY as usize {
            assert!(limiter.try_acquire(&provider));
        }

        // Should fail after exhausting burst capacity
        assert!(!limiter.try_acquire(&provider));
    }

    #[test]
    fn test_rate_limiter_custom_config() {
        let limiter = RateLimiter::new();
        let provider: ProviderId = Cow::Borrowed("CUSTOM_PROVIDER");

        limiter.configure(
            &provider,
            RateLimitConfig {
                requests_per_minute: 120,
                burst_capacity: 5.0,
            },
        );

        // Should respect custom burst capacity
        for _ in 0..5 {
            assert!(limiter.try_acquire(&provider));
        }
        assert!(!limiter.try_acquire(&provider));
    }

    #[test]
    fn test_rate_limiter_per_provider_isolation() {
        let limiter = RateLimiter::new();
        let provider_a: ProviderId = Cow::Borrowed("PROVIDER_A");
        let provider_b: ProviderId = Cow::Borrowed("PROVIDER_B");

        // Exhaust provider A
        for _ in 0..DEFAULT_BUCKET_CAPACITY as usize {
            limiter.try_acquire(&provider_a);
        }
        assert!(!limiter.try_acquire(&provider_a));

        // Provider B should still have tokens
        assert!(limiter.try_acquire(&provider_b));
    }

    #[test]
    fn test_rate_limiter_reset() {
        let limiter = RateLimiter::new();
        let provider: ProviderId = Cow::Borrowed("RESET_PROVIDER");

        // Exhaust tokens
        for _ in 0..DEFAULT_BUCKET_CAPACITY as usize {
            limiter.try_acquire(&provider);
        }
        assert!(!limiter.try_acquire(&provider));

        // Reset should restore capacity
        limiter.reset(&provider);
        assert!(limiter.try_acquire(&provider));
    }

    #[test]
    fn test_remaining_tokens() {
        let limiter = RateLimiter::new();
        let provider: ProviderId = Cow::Borrowed("REMAINING_PROVIDER");

        // Initially should have default capacity
        let initial = limiter.remaining_tokens(&provider);
        assert!((initial - DEFAULT_BUCKET_CAPACITY).abs() < 0.01);

        // After acquiring some, should be less
        limiter.try_acquire(&provider);
        limiter.try_acquire(&provider);

        let remaining = limiter.remaining_tokens(&provider);
        assert!((remaining - (DEFAULT_BUCKET_CAPACITY - 2.0)).abs() < 0.01);
    }

    #[tokio::test]
    async fn test_async_acquire() {
        let limiter = RateLimiter::new();
        let provider: ProviderId = Cow::Borrowed("ASYNC_PROVIDER");

        limiter.configure(
            &provider,
            RateLimitConfig {
                requests_per_minute: 6000, // 100/second for fast test
                burst_capacity: 2.0,
            },
        );

        // First two should be immediate
        limiter.acquire(&provider).await;
        limiter.acquire(&provider).await;

        // Third should require waiting (but should complete)
        let start = Instant::now();
        limiter.acquire(&provider).await;
        let elapsed = start.elapsed();

        // Should have waited some time (at least a few ms)
        // Note: in practice, with 100 req/sec, wait is ~10ms
        assert!(elapsed.as_millis() >= 5);
    }
}
