//! Per-provider circuit breaker for fault tolerance.
//!
//! Implements the circuit breaker pattern to prevent cascading failures
//! when a provider is experiencing issues. The circuit has three states:
//!
//! - **Closed**: Normal operation, requests are allowed through.
//! - **Open**: Provider is failing, requests are blocked.
//! - **HalfOpen**: Testing if provider has recovered.
//!
//! The circuit breaker is in-memory and resets on application restart.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use log::{debug, info, warn};

/// Type alias for provider identifier.
pub type ProviderId = Cow<'static, str>;

/// Default number of failures before opening the circuit.
const DEFAULT_FAILURE_THRESHOLD: u32 = 5;

/// Default time to wait before transitioning from Open to HalfOpen.
const DEFAULT_RECOVERY_TIMEOUT: Duration = Duration::from_secs(60);

/// Number of successful requests needed to close the circuit from HalfOpen.
const HALF_OPEN_SUCCESS_THRESHOLD: u32 = 2;

/// Circuit breaker state.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CircuitState {
    /// Normal operation - requests are allowed.
    Closed,
    /// Provider is failing - requests are blocked.
    Open,
    /// Testing recovery - limited requests allowed.
    HalfOpen,
}

impl std::fmt::Display for CircuitState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Closed => write!(f, "Closed"),
            Self::Open => write!(f, "Open"),
            Self::HalfOpen => write!(f, "HalfOpen"),
        }
    }
}

/// Internal circuit state for a single provider.
#[derive(Debug)]
struct Circuit {
    /// Current circuit state.
    state: CircuitState,
    /// Number of consecutive failures.
    failure_count: u32,
    /// Number of consecutive successes in HalfOpen state.
    half_open_successes: u32,
    /// Time of the last failure (for recovery timeout).
    last_failure: Option<Instant>,
}

impl Circuit {
    fn new() -> Self {
        Self {
            state: CircuitState::Closed,
            failure_count: 0,
            half_open_successes: 0,
            last_failure: None,
        }
    }
}

/// Circuit breaker configuration.
#[derive(Clone, Debug)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening the circuit.
    pub failure_threshold: u32,
    /// Time to wait before testing recovery.
    pub recovery_timeout: Duration,
    /// Number of successes needed to close from HalfOpen.
    pub half_open_success_threshold: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: DEFAULT_FAILURE_THRESHOLD,
            recovery_timeout: DEFAULT_RECOVERY_TIMEOUT,
            half_open_success_threshold: HALF_OPEN_SUCCESS_THRESHOLD,
        }
    }
}

/// Per-provider circuit breaker.
///
/// Thread-safe circuit breaker that tracks failures per provider
/// and prevents requests to failing providers. The state is in-memory
/// and resets when the application restarts.
pub struct CircuitBreaker {
    /// Per-provider circuit states.
    circuits: Mutex<HashMap<String, Circuit>>,
    /// Configuration.
    config: CircuitBreakerConfig,
}

impl CircuitBreaker {
    /// Create a new circuit breaker with default settings.
    pub fn new() -> Self {
        Self {
            circuits: Mutex::new(HashMap::new()),
            config: CircuitBreakerConfig::default(),
        }
    }

    /// Create a circuit breaker with custom configuration.
    pub fn with_config(config: CircuitBreakerConfig) -> Self {
        Self {
            circuits: Mutex::new(HashMap::new()),
            config,
        }
    }

    /// Lock the circuits mutex, recovering from poison if necessary.
    ///
    /// For circuit breakers, it's safe to recover from a poisoned mutex since
    /// the worst case is slightly incorrect circuit state, which is better
    /// than panicking.
    fn lock_circuits(&self) -> MutexGuard<'_, HashMap<String, Circuit>> {
        self.circuits.lock().unwrap_or_else(|poisoned| {
            warn!("Circuit breaker mutex was poisoned, recovering");
            poisoned.into_inner()
        })
    }

    /// Check if requests are allowed for a provider.
    ///
    /// Returns true if the circuit is Closed or HalfOpen (allowing test requests).
    /// Returns false if the circuit is Open.
    ///
    /// This method also handles state transitions:
    /// - Open -> HalfOpen when recovery timeout has elapsed
    pub fn is_allowed(&self, provider: &ProviderId) -> bool {
        let mut circuits = self.lock_circuits();

        let circuit = circuits
            .entry(provider.to_string())
            .or_insert_with(Circuit::new);

        match circuit.state {
            CircuitState::Closed => true,
            CircuitState::HalfOpen => {
                // Allow limited test requests in HalfOpen state
                true
            }
            CircuitState::Open => {
                // Check if recovery timeout has elapsed
                if let Some(last_failure) = circuit.last_failure {
                    if last_failure.elapsed() >= self.config.recovery_timeout {
                        info!(
                            "Circuit breaker: transitioning '{}' from Open to HalfOpen",
                            provider
                        );
                        circuit.state = CircuitState::HalfOpen;
                        circuit.half_open_successes = 0;
                        return true;
                    }
                }
                false
            }
        }
    }

    /// Record a successful request for a provider.
    ///
    /// In Closed state: resets failure count.
    /// In HalfOpen state: increments success count, may close circuit.
    pub fn record_success(&self, provider: &ProviderId) {
        let mut circuits = self.lock_circuits();

        let circuit = circuits
            .entry(provider.to_string())
            .or_insert_with(Circuit::new);

        match circuit.state {
            CircuitState::Closed => {
                // Reset failure count on success
                circuit.failure_count = 0;
                debug!(
                    "Circuit breaker: success for '{}', failure count reset",
                    provider
                );
            }
            CircuitState::HalfOpen => {
                circuit.half_open_successes += 1;
                debug!(
                    "Circuit breaker: success for '{}' in HalfOpen ({}/{})",
                    provider, circuit.half_open_successes, self.config.half_open_success_threshold
                );

                if circuit.half_open_successes >= self.config.half_open_success_threshold {
                    info!(
                        "Circuit breaker: closing circuit for '{}' after {} successes",
                        provider, circuit.half_open_successes
                    );
                    circuit.state = CircuitState::Closed;
                    circuit.failure_count = 0;
                    circuit.half_open_successes = 0;
                    circuit.last_failure = None;
                }
            }
            CircuitState::Open => {
                // Shouldn't happen - is_allowed should have transitioned to HalfOpen
                debug!(
                    "Circuit breaker: unexpected success for '{}' in Open state",
                    provider
                );
            }
        }
    }

    /// Record a failed request for a provider.
    ///
    /// Increments failure count and may open the circuit.
    /// In HalfOpen state, any failure immediately opens the circuit.
    pub fn record_failure(&self, provider: &ProviderId) {
        let mut circuits = self.lock_circuits();

        let circuit = circuits
            .entry(provider.to_string())
            .or_insert_with(Circuit::new);

        circuit.failure_count += 1;
        circuit.last_failure = Some(Instant::now());

        match circuit.state {
            CircuitState::Closed => {
                if circuit.failure_count >= self.config.failure_threshold {
                    info!(
                        "Circuit breaker: opening circuit for '{}' after {} failures",
                        provider, circuit.failure_count
                    );
                    circuit.state = CircuitState::Open;
                } else {
                    debug!(
                        "Circuit breaker: failure for '{}' ({}/{})",
                        provider, circuit.failure_count, self.config.failure_threshold
                    );
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in HalfOpen immediately reopens the circuit
                info!(
                    "Circuit breaker: reopening circuit for '{}' after failure in HalfOpen",
                    provider
                );
                circuit.state = CircuitState::Open;
                circuit.half_open_successes = 0;
            }
            CircuitState::Open => {
                // Already open, just update last_failure time
                debug!(
                    "Circuit breaker: additional failure for '{}' (already open)",
                    provider
                );
            }
        }
    }

    /// Get the current state for a provider.
    pub fn state(&self, provider: &ProviderId) -> CircuitState {
        let circuits = self.lock_circuits();

        circuits
            .get(provider.as_ref())
            .map(|c| c.state)
            .unwrap_or(CircuitState::Closed)
    }

    /// Get the failure count for a provider.
    pub fn failure_count(&self, provider: &ProviderId) -> u32 {
        let circuits = self.lock_circuits();

        circuits
            .get(provider.as_ref())
            .map(|c| c.failure_count)
            .unwrap_or(0)
    }

    /// Reset the circuit for a provider to Closed state.
    pub fn reset(&self, provider: &ProviderId) {
        let mut circuits = self.lock_circuits();

        if let Some(circuit) = circuits.get_mut(provider.as_ref()) {
            info!(
                "Circuit breaker: manually resetting circuit for '{}'",
                provider
            );
            circuit.state = CircuitState::Closed;
            circuit.failure_count = 0;
            circuit.half_open_successes = 0;
            circuit.last_failure = None;
        }
    }

    /// Reset all circuits to their initial state.
    pub fn reset_all(&self) {
        let mut circuits = self.lock_circuits();
        circuits.clear();
        info!("Circuit breaker: all circuits reset");
    }

    /// Get metrics for all tracked providers.
    pub fn metrics(&self) -> Vec<CircuitMetrics> {
        let circuits = self.lock_circuits();

        circuits
            .iter()
            .map(|(provider, circuit)| CircuitMetrics {
                provider: provider.clone(),
                state: circuit.state,
                failure_count: circuit.failure_count,
                last_failure: circuit.last_failure,
            })
            .collect()
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new()
    }
}

/// Metrics for a single circuit.
#[derive(Clone, Debug)]
pub struct CircuitMetrics {
    /// Provider identifier.
    pub provider: String,
    /// Current circuit state.
    pub state: CircuitState,
    /// Number of recorded failures.
    pub failure_count: u32,
    /// Time of the last failure.
    pub last_failure: Option<Instant>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;

    #[test]
    fn test_circuit_starts_closed() {
        let cb = CircuitBreaker::new();
        let provider: ProviderId = Cow::Borrowed("TEST_PROVIDER");

        assert!(cb.is_allowed(&provider));
        assert_eq!(cb.state(&provider), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_opens_after_threshold() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 3,
            recovery_timeout: Duration::from_secs(60),
            half_open_success_threshold: 2,
        });
        let provider: ProviderId = Cow::Borrowed("FAILING_PROVIDER");

        // First two failures don't open circuit
        cb.record_failure(&provider);
        cb.record_failure(&provider);
        assert!(cb.is_allowed(&provider));
        assert_eq!(cb.state(&provider), CircuitState::Closed);

        // Third failure opens circuit
        cb.record_failure(&provider);
        assert!(!cb.is_allowed(&provider));
        assert_eq!(cb.state(&provider), CircuitState::Open);
    }

    #[test]
    fn test_success_resets_failure_count() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 3,
            ..Default::default()
        });
        let provider: ProviderId = Cow::Borrowed("INTERMITTENT_PROVIDER");

        cb.record_failure(&provider);
        cb.record_failure(&provider);
        assert_eq!(cb.failure_count(&provider), 2);

        cb.record_success(&provider);
        assert_eq!(cb.failure_count(&provider), 0);
    }

    #[test]
    fn test_circuit_transitions_to_half_open() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 1,
            recovery_timeout: Duration::from_millis(10),
            half_open_success_threshold: 1,
        });
        let provider: ProviderId = Cow::Borrowed("RECOVERING_PROVIDER");

        // Open the circuit
        cb.record_failure(&provider);
        assert!(!cb.is_allowed(&provider));
        assert_eq!(cb.state(&provider), CircuitState::Open);

        // Wait for recovery timeout
        std::thread::sleep(Duration::from_millis(20));

        // Should transition to HalfOpen
        assert!(cb.is_allowed(&provider));
        assert_eq!(cb.state(&provider), CircuitState::HalfOpen);
    }

    #[test]
    fn test_half_open_closes_on_success() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 1,
            recovery_timeout: Duration::from_millis(10),
            half_open_success_threshold: 2,
        });
        let provider: ProviderId = Cow::Borrowed("HEALING_PROVIDER");

        // Open and transition to HalfOpen
        cb.record_failure(&provider);
        std::thread::sleep(Duration::from_millis(20));
        cb.is_allowed(&provider); // Triggers transition

        // First success
        cb.record_success(&provider);
        assert_eq!(cb.state(&provider), CircuitState::HalfOpen);

        // Second success closes circuit
        cb.record_success(&provider);
        assert_eq!(cb.state(&provider), CircuitState::Closed);
    }

    #[test]
    fn test_half_open_reopens_on_failure() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 1,
            recovery_timeout: Duration::from_millis(10),
            half_open_success_threshold: 2,
        });
        let provider: ProviderId = Cow::Borrowed("RELAPSING_PROVIDER");

        // Open and transition to HalfOpen
        cb.record_failure(&provider);
        std::thread::sleep(Duration::from_millis(20));
        cb.is_allowed(&provider);
        assert_eq!(cb.state(&provider), CircuitState::HalfOpen);

        // Failure reopens circuit
        cb.record_failure(&provider);
        assert_eq!(cb.state(&provider), CircuitState::Open);
    }

    #[test]
    fn test_manual_reset() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 1,
            ..Default::default()
        });
        let provider: ProviderId = Cow::Borrowed("RESET_PROVIDER");

        cb.record_failure(&provider);
        assert_eq!(cb.state(&provider), CircuitState::Open);

        cb.reset(&provider);
        assert_eq!(cb.state(&provider), CircuitState::Closed);
        assert_eq!(cb.failure_count(&provider), 0);
    }

    #[test]
    fn test_provider_isolation() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 1,
            ..Default::default()
        });
        let provider_a: ProviderId = Cow::Borrowed("PROVIDER_A");
        let provider_b: ProviderId = Cow::Borrowed("PROVIDER_B");

        cb.record_failure(&provider_a);
        assert!(!cb.is_allowed(&provider_a));

        // Provider B should be unaffected
        assert!(cb.is_allowed(&provider_b));
        assert_eq!(cb.state(&provider_b), CircuitState::Closed);
    }

    #[test]
    fn test_metrics() {
        let cb = CircuitBreaker::new();
        let provider_a: ProviderId = Cow::Borrowed("METRIC_A");
        let provider_b: ProviderId = Cow::Borrowed("METRIC_B");

        cb.record_failure(&provider_a);
        cb.record_failure(&provider_a);
        cb.record_failure(&provider_b);

        let metrics = cb.metrics();
        assert_eq!(metrics.len(), 2);

        let metric_a = metrics.iter().find(|m| m.provider == "METRIC_A").unwrap();
        assert_eq!(metric_a.failure_count, 2);
        assert_eq!(metric_a.state, CircuitState::Closed);
    }
}
