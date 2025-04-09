mod activity_handlers; // Private module
mod holdings_calculator; // Private module
mod state;             // Private module

// Re-export only the public interface of the calculator
pub use holdings_calculator::HoldingsCalculator;