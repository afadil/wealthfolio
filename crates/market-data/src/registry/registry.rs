//! Provider registry for orchestrating market data providers.
//!
//! The registry manages multiple providers, handling:
//! - Provider selection based on asset kind and preference
//! - Fallback to alternative providers on failure
//! - Rate limiting and circuit breaking
//! - Quote validation

use std::borrow::Cow;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use log::{debug, info, warn};

use super::{CircuitBreaker, QuoteValidator, RateLimiter};
use crate::errors::{MarketDataError, RetryClass};
use crate::models::{AssetKind, InstrumentId, ProviderId, ProviderInstrument, Quote, QuoteContext};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};
use crate::resolver::{ResolvedInstrument, ResolutionSource, SymbolResolver};

/// Provider registry for orchestrating market data fetching.
pub struct ProviderRegistry {
    providers: Vec<Arc<dyn MarketDataProvider>>,
    resolver: Arc<dyn SymbolResolver>,
    rate_limiter: RateLimiter,
    circuit_breaker: CircuitBreaker,
    validator: QuoteValidator,
}

impl ProviderRegistry {
    /// Create a new provider registry.
    pub fn new(
        providers: Vec<Arc<dyn MarketDataProvider>>,
        resolver: Arc<dyn SymbolResolver>,
    ) -> Self {
        Self {
            providers,
            resolver,
            rate_limiter: RateLimiter::new(),
            circuit_breaker: CircuitBreaker::new(),
            validator: QuoteValidator::new(),
        }
    }

    /// Create a registry with custom configuration.
    pub fn with_config(
        providers: Vec<Arc<dyn MarketDataProvider>>,
        resolver: Arc<dyn SymbolResolver>,
        rate_limiter: RateLimiter,
        circuit_breaker: CircuitBreaker,
        validator: QuoteValidator,
    ) -> Self {
        Self {
            providers,
            resolver,
            rate_limiter,
            circuit_breaker,
            validator,
        }
    }

    /// Fetch quotes for an instrument.
    ///
    /// Tries providers in order:
    /// 1. Filter by asset kind capability
    /// 2. Sort by preferred_provider (if set) then priority
    /// 3. Check circuit breaker for each provider
    /// 4. Resolve symbol for provider
    /// 5. Apply rate limiting
    /// 6. Fetch quotes
    /// 7. Validate quotes
    /// 8. On failure, try next provider based on retry class
    pub async fn fetch_quotes(
        &self,
        context: &QuoteContext,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let providers = self.ordered_providers(context);

        if providers.is_empty() {
            warn!(
                "No providers available for asset kind: {:?}",
                context.instrument.kind()
            );
            return Err(MarketDataError::NoProvidersAvailable);
        }

        let mut last_error: Option<MarketDataError> = None;

        for provider in providers {
            let provider_id: ProviderId = Cow::Borrowed(provider.id());

            // Check circuit breaker
            if !self.circuit_breaker.is_allowed(&provider_id) {
                debug!(
                    "Circuit breaker open for provider '{}', skipping",
                    provider_id
                );
                continue;
            }

            // Resolve symbol for this provider
            let resolved = match self.resolver.resolve(&provider_id, context) {
                Ok(r) => r,
                Err(e) => {
                    debug!(
                        "Resolution failed for provider '{}': {:?}, trying next",
                        provider_id, e
                    );
                    continue;
                }
            };

            info!(
                "Fetching quotes from provider '{}' with {:?} (source: {:?})",
                provider_id, resolved.instrument, resolved.source
            );

            // Rate limit
            self.rate_limiter.acquire(&provider_id).await;

            // Fetch quotes
            match provider
                .get_historical_quotes(context, resolved.instrument, start, end)
                .await
            {
                Ok(mut quotes) => {
                    self.circuit_breaker.record_success(&provider_id);

                    // Validate quotes - store original count before drain
                    let original_count = quotes.len();
                    let mut valid_quotes = Vec::with_capacity(original_count);
                    for quote in quotes.drain(..) {
                        match self.validator.validate(&quote) {
                            Ok(()) => valid_quotes.push(quote),
                            Err(e) => {
                                warn!(
                                    "Quote validation failed for {:?}: {:?}",
                                    quote.timestamp, e
                                );
                            }
                        }
                    }

                    if valid_quotes.is_empty() && original_count > 0 {
                        warn!(
                            "All {} quotes from '{}' failed validation",
                            original_count,
                            provider_id
                        );
                        last_error = Some(MarketDataError::ValidationFailed {
                            message: "All quotes failed validation".to_string(),
                        });
                        continue;
                    }

                    info!(
                        "Successfully fetched {} valid quotes from '{}'",
                        valid_quotes.len(),
                        provider_id
                    );
                    return Ok(valid_quotes);
                }
                Err(e) => {
                    let retry_class = e.retry_class();

                    match retry_class {
                        RetryClass::Never => {
                            // Terminal error - don't try other providers
                            info!(
                                "Terminal error from '{}': {:?}, not retrying",
                                provider_id, e
                            );
                            return Err(e);
                        }
                        RetryClass::WithBackoff | RetryClass::CircuitOpen => {
                            // Record failure for circuit breaker
                            self.circuit_breaker.record_failure(&provider_id);
                            warn!(
                                "Provider '{}' failed with {:?}, recorded circuit breaker failure",
                                provider_id, e
                            );
                        }
                        RetryClass::NextProvider => {
                            info!(
                                "Provider '{}' failed with {:?}, trying next provider",
                                provider_id, e
                            );
                        }
                    }

                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or(MarketDataError::AllProvidersFailed))
    }

    /// Fetch the latest quote for an instrument.
    pub async fn fetch_latest_quote(
        &self,
        context: &QuoteContext,
    ) -> Result<Quote, MarketDataError> {
        let providers = self.ordered_providers(context);

        if providers.is_empty() {
            return Err(MarketDataError::NoProvidersAvailable);
        }

        let mut last_error: Option<MarketDataError> = None;

        for provider in providers {
            let provider_id: ProviderId = Cow::Borrowed(provider.id());

            if !self.circuit_breaker.is_allowed(&provider_id) {
                continue;
            }

            let resolved = match self.resolver.resolve(&provider_id, context) {
                Ok(r) => r,
                Err(_) => continue,
            };

            self.rate_limiter.acquire(&provider_id).await;

            match provider
                .get_latest_quote(context, resolved.instrument)
                .await
            {
                Ok(quote) => {
                    self.circuit_breaker.record_success(&provider_id);

                    if let Err(e) = self.validator.validate(&quote) {
                        warn!("Latest quote validation failed: {:?}", e);
                        last_error = Some(e);
                        continue;
                    }

                    return Ok(quote);
                }
                Err(e) => {
                    let retry_class = e.retry_class();

                    if retry_class == RetryClass::Never {
                        return Err(e);
                    }

                    if matches!(retry_class, RetryClass::WithBackoff | RetryClass::CircuitOpen) {
                        self.circuit_breaker.record_failure(&provider_id);
                    }

                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or(MarketDataError::AllProvidersFailed))
    }

    /// Get providers ordered by preference for the given context.
    ///
    /// Orders providers by:
    /// 1. Filter to providers that support the asset kind
    /// 2. Preferred provider first (if set and available)
    /// 3. Then by priority (lower is higher priority)
    fn ordered_providers(&self, context: &QuoteContext) -> Vec<&Arc<dyn MarketDataProvider>> {
        let asset_kind = context.instrument.kind();

        let mut providers: Vec<_> = self
            .providers
            .iter()
            .filter(|p| p.capabilities().asset_kinds.contains(&asset_kind))
            .collect();

        // Sort by preferred provider, then by priority
        if let Some(preferred) = &context.preferred_provider {
            providers.sort_by_key(|p| {
                if p.id() == preferred.as_ref() {
                    // Preferred provider gets priority 0
                    0i32
                } else {
                    // Others sorted by their declared priority
                    p.priority() as i32 + 1
                }
            });
        } else {
            // No preference, just sort by priority
            providers.sort_by_key(|p| p.priority());
        }

        providers
    }

    /// Get the list of registered providers.
    pub fn providers(&self) -> &[Arc<dyn MarketDataProvider>] {
        &self.providers
    }

    /// Check if a provider's circuit is open.
    pub fn is_circuit_open(&self, provider_id: &ProviderId) -> bool {
        !self.circuit_breaker.is_allowed(provider_id)
    }

    /// Reset a provider's circuit breaker.
    pub fn reset_circuit(&self, provider_id: &ProviderId) {
        self.circuit_breaker.reset(provider_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Currency;
    use rust_decimal_macros::dec;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    struct MockProvider {
        id: &'static str,
        priority: u8,
        call_count: AtomicUsize,
        should_fail: bool,
    }

    impl MockProvider {
        fn new(id: &'static str, priority: u8, should_fail: bool) -> Self {
            Self {
                id,
                priority,
                call_count: AtomicUsize::new(0),
                should_fail,
            }
        }
    }

    #[async_trait::async_trait]
    impl MarketDataProvider for MockProvider {
        fn id(&self) -> &'static str {
            self.id
        }

        fn priority(&self) -> u8 {
            self.priority
        }

        fn capabilities(&self) -> ProviderCapabilities {
            ProviderCapabilities {
                asset_kinds: &[AssetKind::Security, AssetKind::FxRate],
                supports_historical: true,
                supports_search: false,
            }
        }

        fn rate_limit(&self) -> RateLimit {
            RateLimit {
                requests_per_minute: 100,
                max_concurrency: 10,
                min_delay: Duration::ZERO,
            }
        }

        async fn get_latest_quote(
            &self,
            _context: &QuoteContext,
            _instrument: ProviderInstrument,
        ) -> Result<Quote, MarketDataError> {
            self.call_count.fetch_add(1, Ordering::SeqCst);

            if self.should_fail {
                Err(MarketDataError::ProviderError {
                    provider: self.id.to_string(),
                    message: "Mock failure".to_string(),
                })
            } else {
                Ok(Quote {
                    timestamp: Utc::now(),
                    open: Some(dec!(100)),
                    high: Some(dec!(105)),
                    low: Some(dec!(95)),
                    close: dec!(102),
                    volume: Some(dec!(1000)),
                    currency: "USD".to_string(),
                    source: self.id.to_string(),
                })
            }
        }

        async fn get_historical_quotes(
            &self,
            _context: &QuoteContext,
            _instrument: ProviderInstrument,
            _start: DateTime<Utc>,
            _end: DateTime<Utc>,
        ) -> Result<Vec<Quote>, MarketDataError> {
            self.call_count.fetch_add(1, Ordering::SeqCst);

            if self.should_fail {
                Err(MarketDataError::ProviderError {
                    provider: self.id.to_string(),
                    message: "Mock failure".to_string(),
                })
            } else {
                Ok(vec![Quote {
                    timestamp: Utc::now(),
                    open: Some(dec!(100)),
                    high: Some(dec!(105)),
                    low: Some(dec!(95)),
                    close: dec!(102),
                    volume: Some(dec!(1000)),
                    currency: "USD".to_string(),
                    source: self.id.to_string(),
                }])
            }
        }
    }

    struct MockResolver;

    impl SymbolResolver for MockResolver {
        fn resolve(
            &self,
            _provider: &ProviderId,
            _context: &QuoteContext,
        ) -> Result<ResolvedInstrument, MarketDataError> {
            Ok(ResolvedInstrument {
                instrument: ProviderInstrument::EquitySymbol {
                    symbol: Arc::from("TEST"),
                },
                source: ResolutionSource::Rules,
            })
        }

        fn get_currency(&self, _provider: &ProviderId, _context: &QuoteContext) -> Option<Currency> {
            Some(Cow::Borrowed("USD"))
        }
    }

    #[test]
    fn test_provider_ordering_by_priority() {
        let providers: Vec<Arc<dyn MarketDataProvider>> = vec![
            Arc::new(MockProvider::new("LOW_PRIORITY", 20, false)),
            Arc::new(MockProvider::new("HIGH_PRIORITY", 5, false)),
            Arc::new(MockProvider::new("MED_PRIORITY", 10, false)),
        ];

        let resolver = Arc::new(MockResolver);
        let registry = ProviderRegistry::new(providers, resolver);

        let context = QuoteContext {
            instrument: InstrumentId::Equity {
                ticker: Arc::from("TEST"),
                mic: None,
            },
            overrides: None,
            currency_hint: None,
            preferred_provider: None,
        };

        let ordered = registry.ordered_providers(&context);

        assert_eq!(ordered[0].id(), "HIGH_PRIORITY");
        assert_eq!(ordered[1].id(), "MED_PRIORITY");
        assert_eq!(ordered[2].id(), "LOW_PRIORITY");
    }

    #[test]
    fn test_preferred_provider_first() {
        let providers: Vec<Arc<dyn MarketDataProvider>> = vec![
            Arc::new(MockProvider::new("PROVIDER_A", 5, false)),
            Arc::new(MockProvider::new("PROVIDER_B", 10, false)),
            Arc::new(MockProvider::new("PROVIDER_C", 15, false)),
        ];

        let resolver = Arc::new(MockResolver);
        let registry = ProviderRegistry::new(providers, resolver);

        let context = QuoteContext {
            instrument: InstrumentId::Equity {
                ticker: Arc::from("TEST"),
                mic: None,
            },
            overrides: None,
            currency_hint: None,
            preferred_provider: Some(Cow::Borrowed("PROVIDER_C")),
        };

        let ordered = registry.ordered_providers(&context);

        // PROVIDER_C should be first despite having lowest priority
        assert_eq!(ordered[0].id(), "PROVIDER_C");
        assert_eq!(ordered[1].id(), "PROVIDER_A");
        assert_eq!(ordered[2].id(), "PROVIDER_B");
    }

    #[test]
    fn test_filter_by_asset_kind() {
        struct CryptoOnlyProvider;

        #[async_trait::async_trait]
        impl MarketDataProvider for CryptoOnlyProvider {
            fn id(&self) -> &'static str {
                "CRYPTO_ONLY"
            }
            fn capabilities(&self) -> ProviderCapabilities {
                ProviderCapabilities {
                    asset_kinds: &[AssetKind::Crypto],
                    supports_historical: true,
                    supports_search: false,
                }
            }
            fn rate_limit(&self) -> RateLimit {
                RateLimit {
                    requests_per_minute: 100,
                    max_concurrency: 10,
                    min_delay: Duration::ZERO,
                }
            }
            async fn get_latest_quote(
                &self,
                _: &QuoteContext,
                _: ProviderInstrument,
            ) -> Result<Quote, MarketDataError> {
                unimplemented!()
            }
            async fn get_historical_quotes(
                &self,
                _: &QuoteContext,
                _: ProviderInstrument,
                _: DateTime<Utc>,
                _: DateTime<Utc>,
            ) -> Result<Vec<Quote>, MarketDataError> {
                unimplemented!()
            }
        }

        let providers: Vec<Arc<dyn MarketDataProvider>> = vec![
            Arc::new(MockProvider::new("EQUITY_PROVIDER", 5, false)),
            Arc::new(CryptoOnlyProvider),
        ];

        let resolver = Arc::new(MockResolver);
        let registry = ProviderRegistry::new(providers, resolver);

        // Equity context should only include EQUITY_PROVIDER
        let equity_context = QuoteContext {
            instrument: InstrumentId::Equity {
                ticker: Arc::from("TEST"),
                mic: None,
            },
            overrides: None,
            currency_hint: None,
            preferred_provider: None,
        };

        let equity_providers = registry.ordered_providers(&equity_context);
        assert_eq!(equity_providers.len(), 1);
        assert_eq!(equity_providers[0].id(), "EQUITY_PROVIDER");

        // Crypto context should only include CRYPTO_ONLY
        let crypto_context = QuoteContext {
            instrument: InstrumentId::Crypto {
                base: Arc::from("BTC"),
                quote: Cow::Borrowed("USD"),
            },
            overrides: None,
            currency_hint: None,
            preferred_provider: None,
        };

        let crypto_providers = registry.ordered_providers(&crypto_context);
        assert_eq!(crypto_providers.len(), 1);
        assert_eq!(crypto_providers[0].id(), "CRYPTO_ONLY");
    }
}
