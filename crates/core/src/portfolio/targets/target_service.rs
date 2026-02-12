//! Service for managing portfolio target allocations and computing deviations.

use std::sync::Arc;

use async_trait::async_trait;
use log::debug;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use crate::errors::{Error, Result};
use crate::portfolio::allocation::AllocationServiceTrait;

use super::{
    AllocationDeviation, DeviationReport, NewPortfolioTarget, NewTargetAllocation, PortfolioTarget,
    PortfolioTargetRepositoryTrait, PortfolioTargetServiceTrait, TargetAllocation,
};

/// Service for portfolio target CRUD and deviation calculation.
pub struct PortfolioTargetService {
    repository: Arc<dyn PortfolioTargetRepositoryTrait>,
    allocation_service: Arc<dyn AllocationServiceTrait>,
}

impl PortfolioTargetService {
    pub fn new(
        repository: Arc<dyn PortfolioTargetRepositoryTrait>,
        allocation_service: Arc<dyn AllocationServiceTrait>,
    ) -> Self {
        Self {
            repository,
            allocation_service,
        }
    }
}

#[async_trait]
impl PortfolioTargetServiceTrait for PortfolioTargetService {
    fn get_targets_by_account(&self, account_id: &str) -> Result<Vec<PortfolioTarget>> {
        debug!("Fetching portfolio targets for account {}", account_id);
        self.repository.get_targets_by_account(account_id)
    }

    fn get_target(&self, id: &str) -> Result<Option<PortfolioTarget>> {
        self.repository.get_target(id)
    }

    async fn create_target(&self, target: NewPortfolioTarget) -> Result<PortfolioTarget> {
        debug!("Creating portfolio target: {}", target.name);
        self.repository.create_target(target).await
    }

    async fn update_target(&self, target: PortfolioTarget) -> Result<PortfolioTarget> {
        debug!("Updating portfolio target: {}", target.id);
        self.repository.update_target(target).await
    }

    async fn delete_target(&self, id: &str) -> Result<usize> {
        debug!("Deleting portfolio target: {}", id);
        self.repository.delete_target(id).await
    }

    fn get_allocations_by_target(&self, target_id: &str) -> Result<Vec<TargetAllocation>> {
        self.repository.get_allocations_by_target(target_id)
    }

    async fn upsert_allocation(&self, allocation: NewTargetAllocation) -> Result<TargetAllocation> {
        debug!(
            "Upserting target allocation for target {} category {}",
            allocation.target_id, allocation.category_id
        );
        self.repository.upsert_allocation(allocation).await
    }

    async fn delete_allocation(&self, id: &str) -> Result<usize> {
        self.repository.delete_allocation(id).await
    }

    async fn get_deviation_report(
        &self,
        target_id: &str,
        base_currency: &str,
    ) -> Result<DeviationReport> {
        debug!("Computing deviation report for target {}", target_id);

        let target = self.repository.get_target(target_id)?.ok_or_else(|| {
            Error::Database(crate::errors::DatabaseError::NotFound(format!(
                "Portfolio target {} not found",
                target_id
            )))
        })?;

        let allocations = self.repository.get_allocations_by_target(target_id)?;
        if allocations.is_empty() {
            return Ok(DeviationReport {
                target_id: target.id,
                target_name: target.name,
                account_id: target.account_id,
                taxonomy_id: target.taxonomy_id,
                total_value: Decimal::ZERO,
                deviations: Vec::new(),
            });
        }

        // Get current portfolio allocations from the allocation service
        let current = self
            .allocation_service
            .get_portfolio_allocations(&target.account_id, base_currency)
            .await?;

        // Find the taxonomy allocation matching our target's taxonomy
        let taxonomy_alloc = match target.taxonomy_id.as_str() {
            "asset_classes" => &current.asset_classes,
            "regions" => &current.regions,
            _ => {
                return Err(Error::Unexpected(format!(
                    "Unsupported taxonomy for targets: {}",
                    target.taxonomy_id
                )));
            }
        };

        let total_value = current.total_value;

        // Build current allocation lookup: category_id -> (percentage, name, color)
        let mut current_by_category: std::collections::HashMap<String, (Decimal, String, String)> =
            std::collections::HashMap::new();
        for cat in &taxonomy_alloc.categories {
            current_by_category.insert(
                cat.category_id.clone(),
                (cat.percentage, cat.category_name.clone(), cat.color.clone()),
            );
        }

        // Compute deviations
        let deviations: Vec<AllocationDeviation> = allocations
            .iter()
            .map(|alloc| {
                let target_pct = Decimal::from(alloc.target_percent) / dec!(100);
                let (current_pct, name, color) = current_by_category
                    .get(&alloc.category_id)
                    .cloned()
                    .unwrap_or((
                        Decimal::ZERO,
                        alloc.category_id.clone(),
                        "#808080".to_string(),
                    ));

                let deviation_pct = current_pct - target_pct;
                let target_val = total_value * target_pct / dec!(100);
                let current_val = total_value * current_pct / dec!(100);
                let value_delta = current_val - target_val;

                AllocationDeviation {
                    category_id: alloc.category_id.clone(),
                    category_name: name,
                    color,
                    target_percent: target_pct,
                    current_percent: current_pct,
                    deviation_percent: deviation_pct,
                    current_value: current_val,
                    target_value: target_val,
                    value_delta,
                    is_locked: alloc.is_locked,
                }
            })
            .collect();

        Ok(DeviationReport {
            target_id: target.id,
            target_name: target.name,
            account_id: target.account_id,
            taxonomy_id: target.taxonomy_id,
            total_value,
            deviations,
        })
    }
}
