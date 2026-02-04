use async_trait::async_trait;

use crate::Result;

use super::rebalancing_model::{
    AssetClassTarget, HoldingTarget, NewAssetClassTarget, NewHoldingTarget, NewRebalancingStrategy,
    RebalancingStrategy,
};

#[async_trait]
pub trait RebalancingRepository: Send + Sync {
    // Strategies
    async fn get_strategies(&self) -> Result<Vec<RebalancingStrategy>>;
    async fn get_strategy(&self, id: &str) -> Result<Option<RebalancingStrategy>>;
    async fn create_strategy(
        &self,
        strategy: NewRebalancingStrategy,
    ) -> Result<RebalancingStrategy>;
    async fn update_strategy(
        &self,
        strategy: NewRebalancingStrategy,
    ) -> Result<RebalancingStrategy>;
    async fn delete_strategy(&self, id: &str) -> Result<()>;

    // Asset Class Targets
    async fn get_asset_class_targets(&self, strategy_id: &str) -> Result<Vec<AssetClassTarget>>;
    async fn create_asset_class_target(
        &self,
        target: NewAssetClassTarget,
    ) -> Result<AssetClassTarget>;
    async fn update_asset_class_target(
        &self,
        target: NewAssetClassTarget,
    ) -> Result<AssetClassTarget>;
    async fn delete_asset_class_target(&self, id: &str) -> Result<()>;

    // Holding Targets
    async fn get_holding_targets(&self, asset_class_id: &str) -> Result<Vec<HoldingTarget>>;
    async fn create_holding_target(&self, target: NewHoldingTarget) -> Result<HoldingTarget>;
    async fn update_holding_target(&self, target: NewHoldingTarget) -> Result<HoldingTarget>;
    async fn delete_holding_target(&self, id: &str) -> Result<()>;
    async fn toggle_holding_target_lock(&self, id: &str) -> Result<HoldingTarget>;

    /// Get the active strategy for a specific account
    async fn get_active_strategy_for_account(
        &self,
        account_id: &str,
    ) -> Result<Option<RebalancingStrategy>>;

    /// Get count of unused virtual strategies
    async fn get_unused_virtual_strategies_count(&self) -> Result<usize>;

    /// Delete unused virtual strategies and return count of deleted strategies
    async fn delete_unused_virtual_strategies(&self) -> Result<usize>;
}

#[async_trait]
pub trait RebalancingService: Send + Sync {
    async fn get_strategies(&self) -> Result<Vec<RebalancingStrategy>>;
    async fn get_strategy(&self, id: &str) -> Result<Option<RebalancingStrategy>>;
    async fn save_strategy(&self, strategy: NewRebalancingStrategy) -> Result<RebalancingStrategy>;
    async fn delete_strategy(&self, id: &str) -> Result<()>;

    async fn get_asset_class_targets(&self, strategy_id: &str) -> Result<Vec<AssetClassTarget>>;
    async fn save_asset_class_target(
        &self,
        target: NewAssetClassTarget,
    ) -> Result<AssetClassTarget>;
    async fn delete_asset_class_target(&self, id: &str) -> Result<()>;

    async fn get_holding_targets(&self, asset_class_id: &str) -> Result<Vec<HoldingTarget>>;
    async fn save_holding_target(&self, target: NewHoldingTarget) -> Result<HoldingTarget>;
    async fn delete_holding_target(&self, id: &str) -> Result<()>;
    async fn toggle_holding_target_lock(&self, id: &str) -> Result<HoldingTarget>;

    /// Get the active strategy for a specific account
    async fn get_active_strategy_for_account(
        &self,
        account_id: &str,
    ) -> Result<Option<RebalancingStrategy>>;

    /// Get all asset class targets for a specific account's active strategy
    async fn get_asset_class_targets_for_account(
        &self,
        account_id: &str,
    ) -> Result<Vec<AssetClassTarget>>;

    /// Get statistics about unused virtual strategies
    async fn get_unused_virtual_strategies_count(&self) -> Result<usize>;

    /// Clean up unused virtual strategies (no targets, created >30 days ago)
    async fn cleanup_unused_virtual_strategies(&self) -> Result<usize>;
}
