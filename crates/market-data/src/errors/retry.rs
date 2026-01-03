/// Classification for retry policy.
///
/// Used to determine how the registry should respond to errors from providers.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetryClass {
    /// Never retry - bad symbol, validation error, or terminal failure.
    /// The request is fundamentally invalid and retrying won't help.
    Never,

    /// Retry with exponential backoff - rate limited (429) or timeout.
    /// The provider is temporarily unavailable but may succeed later.
    WithBackoff,

    /// Try next provider - this provider can't handle the request.
    /// Another provider might be able to fulfill it.
    NextProvider,

    /// Circuit breaker is open for this provider.
    /// Skip this provider until the circuit closes.
    CircuitOpen,
}
