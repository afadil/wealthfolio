mod inflation_model;
mod inflation_repository;
mod inflation_service;
mod inflation_traits;

pub use inflation_model::{InflationAdjustedValue, InflationRate, NewInflationRate};
pub use inflation_repository::InflationRateRepository;
pub use inflation_service::InflationRateService;
pub use inflation_traits::{InflationRateRepositoryTrait, InflationRateServiceTrait};
