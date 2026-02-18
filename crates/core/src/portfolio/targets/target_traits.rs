//! Traits for portfolio target repository and service.

use async_trait::async_trait;

use crate::errors::Result;

use super::{
    DeviationReport, HoldingTarget, NewHoldingTarget, NewPortfolioTarget, NewTargetAllocation,
    PortfolioTarget, TargetAllocation,
};

/// Repository trait for portfolio target persistence.
#[async_trait]
pub trait PortfolioTargetRepositoryTrait: Send + Sync {
    fn get_targets_by_account(&self, account_id: &str) -> Result<Vec<PortfolioTarget>>;
    fn get_target(&self, id: &str) -> Result<Option<PortfolioTarget>>;
    async fn create_target(&self, target: NewPortfolioTarget) -> Result<PortfolioTarget>;
    async fn update_target(&self, target: PortfolioTarget) -> Result<PortfolioTarget>;
    async fn delete_target(&self, id: &str) -> Result<usize>;

    fn get_allocations_by_target(&self, target_id: &str) -> Result<Vec<TargetAllocation>>;
    async fn upsert_allocation(&self, allocation: NewTargetAllocation) -> Result<TargetAllocation>;
    async fn delete_allocation(&self, id: &str) -> Result<usize>;
    async fn delete_allocations_by_target(&self, target_id: &str) -> Result<usize>;

    // Holding targets
    fn get_holding_targets_by_allocation(&self, allocation_id: &str) -> Result<Vec<HoldingTarget>>;
    async fn upsert_holding_target(&self, target: NewHoldingTarget) -> Result<HoldingTarget>;
    async fn batch_save_holding_targets(
        &self,
        targets: Vec<NewHoldingTarget>,
    ) -> Result<Vec<HoldingTarget>>;
    async fn delete_holding_target(&self, id: &str) -> Result<usize>;
    async fn delete_holding_targets_by_allocation(&self, allocation_id: &str) -> Result<usize>;
}

/// Service trait for portfolio target business logic.
#[async_trait]
pub trait PortfolioTargetServiceTrait: Send + Sync {
    fn get_targets_by_account(&self, account_id: &str) -> Result<Vec<PortfolioTarget>>;
    fn get_target(&self, id: &str) -> Result<Option<PortfolioTarget>>;
    async fn create_target(&self, target: NewPortfolioTarget) -> Result<PortfolioTarget>;
    async fn update_target(&self, target: PortfolioTarget) -> Result<PortfolioTarget>;
    async fn delete_target(&self, id: &str) -> Result<usize>;

    fn get_allocations_by_target(&self, target_id: &str) -> Result<Vec<TargetAllocation>>;
    async fn upsert_allocation(&self, allocation: NewTargetAllocation) -> Result<TargetAllocation>;
    async fn delete_allocation(&self, id: &str) -> Result<usize>;

    async fn get_deviation_report(
        &self,
        target_id: &str,
        base_currency: &str,
    ) -> Result<DeviationReport>;

    // Holding targets
    fn get_holding_targets_by_allocation(&self, allocation_id: &str) -> Result<Vec<HoldingTarget>>;
    async fn upsert_holding_target(&self, target: NewHoldingTarget) -> Result<HoldingTarget>;
    async fn batch_save_holding_targets(
        &self,
        targets: Vec<NewHoldingTarget>,
    ) -> Result<Vec<HoldingTarget>>;
    async fn delete_holding_target(&self, id: &str) -> Result<usize>;
}
