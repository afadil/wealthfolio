use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use log::{debug, warn};
use reqwest::Client;

use super::inflation_model::{
    InflationAdjustedValue, InflationRate, NewInflationRate, WorldBankResponse,
};
use super::inflation_traits::{InflationRateRepositoryTrait, InflationRateServiceTrait};
use crate::errors::{Error, Result};

pub struct InflationRateService {
    repository: Arc<dyn InflationRateRepositoryTrait>,
    http_client: Client,
}

impl InflationRateService {
    pub fn new(repository: Arc<dyn InflationRateRepositoryTrait>) -> Self {
        InflationRateService {
            repository,
            http_client: Client::new(),
        }
    }
}

#[async_trait]
impl InflationRateServiceTrait for InflationRateService {
    fn get_inflation_rates(&self) -> Result<Vec<InflationRate>> {
        self.repository.get_inflation_rates()
    }

    fn get_inflation_rates_by_country(&self, country_code: &str) -> Result<Vec<InflationRate>> {
        self.repository.get_inflation_rates_by_country(country_code)
    }

    async fn create_inflation_rate(&self, new_rate: NewInflationRate) -> Result<InflationRate> {
        self.repository.create_inflation_rate(new_rate).await
    }

    async fn update_inflation_rate(
        &self,
        id: &str,
        updated_rate: NewInflationRate,
    ) -> Result<InflationRate> {
        self.repository
            .update_inflation_rate(id, updated_rate)
            .await
    }

    async fn delete_inflation_rate(&self, id: &str) -> Result<()> {
        self.repository.delete_inflation_rate(id).await
    }

    async fn fetch_from_world_bank(&self, country_code: &str) -> Result<Vec<InflationRate>> {
        debug!(
            "Fetching inflation rates from World Bank for country: {}",
            country_code
        );

        // World Bank API endpoint for CPI inflation (annual %)
        // FP.CPI.TOTL.ZG = Inflation, consumer prices (annual %)
        let url = format!(
            "https://api.worldbank.org/v2/country/{}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=50",
            country_code.to_uppercase()
        );

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Unexpected(format!("Failed to fetch from World Bank: {}", e)))?;

        if !response.status().is_success() {
            return Err(Error::Unexpected(format!(
                "World Bank API returned status: {}",
                response.status()
            )));
        }

        let data: WorldBankResponse = response
            .json()
            .await
            .map_err(|e| Error::Unexpected(format!("Failed to parse World Bank response: {}", e)))?;

        let mut results = Vec::new();

        if let Some(data_points) = data.1 {
            for point in data_points {
                if let Some(rate) = point.value {
                    let year: i32 = point.date.parse().unwrap_or(0);
                    if year > 0 {
                        let new_rate = NewInflationRate {
                            id: None,
                            country_code: country_code.to_uppercase(),
                            year,
                            rate,
                            reference_date: Some("12-31".to_string()),
                            data_source: "world_bank".to_string(),
                        };

                        match self.repository.upsert_inflation_rate(new_rate).await {
                            Ok(saved) => results.push(saved),
                            Err(e) => {
                                warn!("Failed to save inflation rate for year {}: {}", year, e);
                            }
                        }
                    }
                }
            }
        }

        debug!(
            "Fetched and saved {} inflation rates for {}",
            results.len(),
            country_code
        );
        Ok(results)
    }

    fn calculate_inflation_adjusted_values(
        &self,
        nominal_values: Vec<(i32, f64, String)>,
        country_code: &str,
        base_year: i32,
    ) -> Result<Vec<InflationAdjustedValue>> {
        let rates = self.repository.get_inflation_rates_by_country(country_code)?;
        let rates_map: HashMap<i32, f64> = rates.into_iter().map(|r| (r.year, r.rate)).collect();

        let mut results = Vec::new();

        for (year, nominal_value, reference_date) in nominal_values {
            // Calculate cumulative inflation from base year to this year
            let cumulative_inflation = if year == base_year {
                0.0
            } else {
                let (start, end) = if year > base_year {
                    (base_year, year)
                } else {
                    (year, base_year)
                };

                let mut cumulative = 1.0;
                for y in start..end {
                    if let Some(&rate) = rates_map.get(&y) {
                        cumulative *= 1.0 + (rate / 100.0);
                    }
                }

                if year > base_year {
                    // Years after base year: positive cumulative inflation
                    (cumulative - 1.0) * 100.0
                } else {
                    // Years before base year: negative (deflation relative to base)
                    (1.0 - (1.0 / cumulative)) * 100.0
                }
            };

            // Adjust value: express in base year's purchasing power
            let real_value = if year == base_year {
                nominal_value
            } else if year > base_year {
                // For years after base year, divide by inflation factor
                nominal_value / (1.0 + cumulative_inflation / 100.0)
            } else {
                // For years before base year, multiply by inverse inflation factor
                nominal_value * (1.0 + (-cumulative_inflation) / 100.0)
            };

            results.push(InflationAdjustedValue {
                year,
                nominal_value,
                real_value,
                inflation_rate: rates_map.get(&year).copied(),
                cumulative_inflation,
                reference_date,
            });
        }

        // Sort by year
        results.sort_by_key(|v| v.year);

        Ok(results)
    }
}
