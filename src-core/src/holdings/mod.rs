pub mod calculator;
pub mod repository;
pub mod holdings_model;
pub mod holdings_service;   
pub mod holdings_errors;             


// Re-export the main public entry points and types
pub use calculator::HoldingsCalculator;
pub use holdings_model::{Position, Lot, CashHolding, Holding}; 
pub use holdings_errors::{CalculatorError, Result}; 
pub use repository::HoldingsRepository; 
pub use holdings_service::{HoldingsService, HoldingsServiceTrait};

#[cfg(test)]
pub(crate) mod tests;