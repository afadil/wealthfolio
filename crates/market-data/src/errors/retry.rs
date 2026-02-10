/// Classification for retry policy.
///
/// Used to determine how the registry should respond to errors from providers.
///
/// # Behavior Summary
///
/// | Class | Try Next Provider? | Record Circuit Breaker Failure? |
/// |-------|-------------------|--------------------------------|
/// | `Never` | No | No |
/// | `FailoverWithPenalty` | Yes | Yes (affects future requests) |
/// | `NextProvider` | Yes | No |
/// | `CircuitOpen` | Yes (skip this one) | No (already recorded) |
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetryClass {
    /// Never retry - bad symbol, validation error, or terminal failure.
    /// The request is fundamentally invalid and retrying won't help.
    Never,

    /// Failover to next provider and record a circuit breaker penalty.
    ///
    /// Used for transient errors like rate limiting (429) or timeout.
    /// The failure is recorded in the circuit breaker, which may cause
    /// this provider to be skipped in future requests if failures accumulate.
    ///
    /// This provides "backoff" at the provider level - after enough failures,
    /// the circuit opens and the provider is temporarily excluded from the pool.
    FailoverWithPenalty,

    /// Try next provider without recording any penalty.
    ///
    /// Used when this provider can't handle the request (e.g., no data for range,
    /// resolution failed) but another provider might succeed.
    /// No circuit breaker penalty is recorded.
    NextProvider,

    /// Circuit breaker is open for this provider.
    /// Skip this provider until the circuit closes.
    CircuitOpen,
}
