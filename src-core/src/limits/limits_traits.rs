use super::limits_model::{ ContributionLimit, LimitsCalculation, NewContributionLimit};
use crate::errors::Result; 
use async_trait::async_trait;

/// Trait defining the contract for Contribution Limit repository operations.
#[async_trait]
pub trait ContributionLimitRepositoryTrait: Send + Sync {
    fn get_contribution_limit(&self, id: &str) -> Result<ContributionLimit>;
    fn get_contribution_limits(&self) -> Result<Vec<ContributionLimit>>;
    async fn create_contribution_limit(&self, new_limit: NewContributionLimit) -> Result<ContributionLimit>;
    async fn update_contribution_limit(
        &self,
        id: &str,
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit>;
    async fn delete_contribution_limit(&self, id: &str) -> Result<()>;
}

/// Trait defining the contract for Contribution Limit service operations.
#[async_trait]
pub trait ContributionLimitServiceTrait: Send + Sync {
    fn get_contribution_limits(&self) -> Result<Vec<ContributionLimit>>;
    async fn create_contribution_limit(&self, new_limit: NewContributionLimit) -> Result<ContributionLimit>;
    async fn update_contribution_limit(
        &self,
        id: &str,
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit>;
    async fn delete_contribution_limit(&self, id: &str) -> Result<()>;
    fn calculate_deposits_withdrawals_for_contribution_limit(
        &self,
        limit_id: &str,
        base_currency: &str,
    ) -> Result<LimitsCalculation>;
    // Note: calculate_deposits_by_period might be better as a private helper or part of the trait if needed elsewhere
} 