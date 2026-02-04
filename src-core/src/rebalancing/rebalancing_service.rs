use async_trait::async_trait;
use std::sync::Arc;

use crate::{errors::ValidationError, Error, Result};

use super::rebalancing_model::{
    AssetClassTarget, HoldingTarget, NewAssetClassTarget, NewHoldingTarget, NewRebalancingStrategy,
    RebalancingStrategy,
};
use super::rebalancing_traits::{RebalancingRepository, RebalancingService};

pub struct RebalancingServiceImpl {
    repository: Arc<dyn RebalancingRepository>,
}

impl RebalancingServiceImpl {
    pub fn new(repository: Arc<dyn RebalancingRepository>) -> Self {
        Self { repository }
    }
}

#[async_trait]
impl RebalancingService for RebalancingServiceImpl {
    async fn get_strategies(&self) -> Result<Vec<RebalancingStrategy>> {
        self.repository.get_strategies().await
    }

    async fn get_strategy(&self, id: &str) -> Result<Option<RebalancingStrategy>> {
        self.repository.get_strategy(id).await
    }

    async fn save_strategy(&self, strategy: NewRebalancingStrategy) -> Result<RebalancingStrategy> {
        if strategy.id.is_some() {
            self.repository.update_strategy(strategy).await
        } else {
            self.repository.create_strategy(strategy).await
        }
    }

    async fn delete_strategy(&self, id: &str) -> Result<()> {
        self.repository.delete_strategy(id).await
    }

    async fn get_asset_class_targets(&self, strategy_id: &str) -> Result<Vec<AssetClassTarget>> {
        self.repository.get_asset_class_targets(strategy_id).await
    }

    async fn save_asset_class_target(
        &self,
        target: NewAssetClassTarget,
    ) -> Result<AssetClassTarget> {
        if target.id.is_some() {
            self.repository.update_asset_class_target(target).await
        } else {
            self.repository.create_asset_class_target(target).await
        }
    }

    async fn delete_asset_class_target(&self, id: &str) -> Result<()> {
        self.repository.delete_asset_class_target(id).await
    }

    async fn get_holding_targets(&self, asset_class_id: &str) -> Result<Vec<HoldingTarget>> {
        self.repository.get_holding_targets(asset_class_id).await
    }

    async fn save_holding_target(&self, target: NewHoldingTarget) -> Result<HoldingTarget> {
        // Validate that sum of all holding targets equals 100%
        let existing_targets = self
            .repository
            .get_holding_targets(&target.asset_class_id)
            .await?;

        // Calculate total, excluding the one being updated
        let mut total: f32 = existing_targets
            .iter()
            .filter(|t| target.id.is_none() || target.id.as_ref() != Some(&t.id))
            .map(|t| t.target_percent_of_class)
            .sum();

        // Add the new/updated target
        total += target.target_percent_of_class;

        // Allow small floating-point errors (within 0.01%)
        if (total - 100.0).abs() > 0.01 {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Holding targets must sum to 100%. Current sum: {:.2}%",
                total
            ))));
        }

        if target.id.is_some() {
            self.repository.update_holding_target(target).await
        } else {
            self.repository.create_holding_target(target).await
        }
    }

    async fn delete_holding_target(&self, id: &str) -> Result<()> {
        self.repository.delete_holding_target(id).await
    }

    async fn toggle_holding_target_lock(&self, id: &str) -> Result<HoldingTarget> {
        self.repository.toggle_holding_target_lock(id).await
    }

    async fn get_active_strategy_for_account(
        &self,
        account_id: &str,
    ) -> Result<Option<RebalancingStrategy>> {
        self.repository
            .get_active_strategy_for_account(account_id)
            .await
    }

    async fn get_asset_class_targets_for_account(
        &self,
        account_id: &str,
    ) -> Result<Vec<AssetClassTarget>> {
        // Get active strategy for account
        if let Some(strategy) = self.get_active_strategy_for_account(account_id).await? {
            // Return targets for that strategy
            self.get_asset_class_targets(&strategy.id).await
        } else {
            // No active strategy; return empty
            Ok(vec![])
        }
    }
}
