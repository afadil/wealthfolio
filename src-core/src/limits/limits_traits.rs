use super::limits_model::{ ContributionLimit, DepositsCalculation, NewContributionLimit};
use crate::errors::Result; 

/// Trait defining the contract for Contribution Limit repository operations.
pub trait ContributionLimitRepositoryTrait: Send + Sync {
    fn get_contribution_limit(&self, id: &str) -> Result<ContributionLimit>;
    fn get_contribution_limits(&self) -> Result<Vec<ContributionLimit>>;
    fn create_contribution_limit(&self, new_limit: NewContributionLimit) -> Result<ContributionLimit>;
    fn update_contribution_limit(
        &self,
        id: &str,
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit>;
    fn delete_contribution_limit(&self, id: &str) -> Result<()>;
}

/// Trait defining the contract for Contribution Limit service operations.
pub trait ContributionLimitServiceTrait: Send + Sync {
    fn get_contribution_limits(&self) -> Result<Vec<ContributionLimit>>;
    fn create_contribution_limit(&self, new_limit: NewContributionLimit) -> Result<ContributionLimit>;
    fn update_contribution_limit(
        &self,
        id: &str,
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit>;
    fn delete_contribution_limit(&self, id: &str) -> Result<()>;
    fn calculate_deposits_for_contribution_limit(
        &self,
        limit_id: &str,
        base_currency: &str,
    ) -> Result<DepositsCalculation>;
    // Note: calculate_deposits_by_period might be better as a private helper or part of the trait if needed elsewhere
} 