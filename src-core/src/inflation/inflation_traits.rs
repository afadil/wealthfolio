use super::inflation_model::{InflationAdjustedValue, InflationRate, NewInflationRate};
use crate::errors::Result;
use async_trait::async_trait;

/// Trait defining the contract for Inflation Rate repository operations.
#[async_trait]
pub trait InflationRateRepositoryTrait: Send + Sync {
    fn get_inflation_rate(&self, id: &str) -> Result<InflationRate>;
    fn get_inflation_rates(&self) -> Result<Vec<InflationRate>>;
    fn get_inflation_rates_by_country(&self, country_code: &str) -> Result<Vec<InflationRate>>;
    fn get_inflation_rate_for_year(&self, country_code: &str, year: i32)
        -> Result<Option<InflationRate>>;
    async fn create_inflation_rate(&self, new_rate: NewInflationRate) -> Result<InflationRate>;
    async fn update_inflation_rate(
        &self,
        id: &str,
        updated_rate: NewInflationRate,
    ) -> Result<InflationRate>;
    async fn delete_inflation_rate(&self, id: &str) -> Result<()>;
    async fn upsert_inflation_rate(&self, rate: NewInflationRate) -> Result<InflationRate>;
}

/// Trait defining the contract for Inflation Rate service operations.
#[async_trait]
pub trait InflationRateServiceTrait: Send + Sync {
    fn get_inflation_rates(&self) -> Result<Vec<InflationRate>>;
    fn get_inflation_rates_by_country(&self, country_code: &str) -> Result<Vec<InflationRate>>;
    async fn create_inflation_rate(&self, new_rate: NewInflationRate) -> Result<InflationRate>;
    async fn update_inflation_rate(
        &self,
        id: &str,
        updated_rate: NewInflationRate,
    ) -> Result<InflationRate>;
    async fn delete_inflation_rate(&self, id: &str) -> Result<()>;
    async fn fetch_from_world_bank(&self, country_code: &str) -> Result<Vec<InflationRate>>;
    fn calculate_inflation_adjusted_values(
        &self,
        nominal_values: Vec<(i32, f64, String)>,
        country_code: &str,
        base_year: i32,
    ) -> Result<Vec<InflationAdjustedValue>>;
}
