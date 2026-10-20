pub mod income_model;
pub mod income_service;

#[cfg(test)]
mod income_service_tests;

pub use income_model::*;
pub use income_service::{IncomeService, IncomeServiceTrait};
