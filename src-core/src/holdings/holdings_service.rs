use log::{debug, error, info, warn};
use rayon::prelude::*;
use std::sync::Arc;

use super::HoldingsCalculator;
use crate::activities::{Activity, ActivityRepositoryTrait};
use crate::errors::{Error, Result};
use crate::holdings::Holding;
use crate::holdings::repository::HoldingsRepositoryTrait;

/// Trait defining the public interface for the Holdings Service.
pub trait HoldingsServiceTrait: Send + Sync {
    /// Retrieves the CURRENTLY STORED holdings state for a given account.
    fn get_account_holdings(&self, account_id: &str) -> Result<Vec<Holding>>;

    /// Retrieves the CURRENTLY STORED holdings state for ALL accounts.
    fn get_all_holdings(&self) -> Result<Vec<Holding>>;

    /// Forces a recalculation of holdings for a specific account.
    fn recalculate_account(&self, account_id: &str) -> Result<()>;

    /// Forces a recalculation for ALL provided account IDs in parallel.
    fn recalculate_all_accounts(&self, account_ids: &[String]) -> Result<()>;
}

/// Service responsible for managing and calculating holdings state.
#[derive(Clone)]
pub struct HoldingsService {
    holdings_repo: Arc<dyn HoldingsRepositoryTrait + Send + Sync>,
    activity_repo: Arc<dyn ActivityRepositoryTrait + Send + Sync>,
    calculator: HoldingsCalculator,
}

impl HoldingsService {
    /// Creates a new HoldingsService instance with dependencies injected.
    pub fn new(
        holdings_repo: Arc<dyn HoldingsRepositoryTrait + Send + Sync>,
        activity_repo: Arc<dyn ActivityRepositoryTrait + Send + Sync>,
    ) -> Self {
        Self {
            holdings_repo,
            activity_repo,
            calculator: HoldingsCalculator::new(),
        }
    }

    fn get_activities_by_account_id(&self, account_id: &str) -> Result<Vec<Activity>> {
        debug!("Fetching activities for account {}", account_id);
        self.activity_repo
            .get_activities_by_account_id(&account_id.to_string())
            .map_err(Into::into)
    }

    /// Fetches activities, calculates holdings, and saves them for a SINGLE account.
    fn calculate_and_save_single_account(&self, account_id: &str) -> Result<()> {
        debug!("Starting calculation & save for account {}", account_id);

        let activities = self.get_activities_by_account_id(account_id)?;
        if activities.is_empty() {
            warn!(
                "No activities found for account {}. Clearing existing holdings.",
                account_id
            );
            self.holdings_repo
                .save_account_holdings(account_id, Vec::new())?;
            return Ok(());
        }

        let mut holdings_map = self.calculator.calculate_holdings(activities)?;

        if let Some(calculated_holdings) = holdings_map.remove(account_id) {
            self.holdings_repo
                .save_account_holdings(account_id, calculated_holdings)?;
            debug!(
                "Successfully calculated and saved holdings for account {}",
                account_id
            );
            Ok(())
        } else {
            warn!("Calculation resulted in no significant holdings for account {}. Saving empty state.", account_id);
            self.holdings_repo
                .save_account_holdings(account_id, Vec::new())?;
            Ok(())
        }
    }

    /// Retrieves the CURRENTLY STORED holdings state for a given account.
    pub fn get_account_holdings(&self, account_id: &str) -> Result<Vec<Holding>> {
        debug!("Retrieving stored holdings for account {}", account_id);
        self.holdings_repo.get_account_holdings(account_id)
    }

    /// Retrieves the CURRENTLY STORED holdings state for ALL accounts.
    pub fn get_all_holdings(&self) -> Result<Vec<Holding>> {
        debug!("Retrieving stored holdings for ALL accounts");
        self.holdings_repo.get_all_holdings()
    }

    /// Forces a recalculation of holdings for a specific account.
    pub fn recalculate_account(&self, account_id: &str) -> Result<()> {
        debug!("Forcing recalculation for account {}", account_id);
        self.calculate_and_save_single_account(account_id)
    }

    /// Forces a recalculation for ALL provided account IDs in parallel.
    pub fn recalculate_all_accounts(&self, account_ids: &[String]) -> Result<()> {
        info!("Starting recalculation for {} accounts.", account_ids.len());

        // Explicitly type the results vector
        let calculation_results: Vec<(String, Result<Vec<Holding>>)> = account_ids
            .par_iter()
            .map(|account_id| {
                debug!("Calculating holdings in parallel for account {}", account_id);
                match self.get_activities_by_account_id(account_id) {
                    Ok(activities) => {
                        if activities.is_empty() {
                            warn!("No activities found for account {} during parallel calc.", account_id);
                            (account_id.clone(), Ok(Vec::new()))
                        } else {
                            match self.calculator.calculate_holdings(activities).map_err(Error::from) {
                                Ok(mut holdings_map) => {
                                    let holdings = holdings_map.remove(account_id).unwrap_or_else(|| {
                                        warn!("Calculator output missing expected account {} during parallel calc. Returning empty.", account_id);
                                        Vec::new()
                                    });
                                    (account_id.clone(), Ok(holdings))
                                }
                                Err(calc_err) => {
                                    error!("Parallel calculation failed for account {}: {}", account_id, calc_err);
                                    (account_id.clone(), Err(calc_err))
                                }
                            }
                        }
                    }
                    Err(fetch_err) => {
                        error!("Failed to fetch activities for account {} during parallel calc: {}", account_id, fetch_err);
                        (account_id.clone(), Err(fetch_err))
                    }
                }
            })
            .collect();

        let holdings_repo = self.holdings_repo.clone();

        // Iterate over owned values to avoid cloning errors
        for item in calculation_results.into_iter() {
            let (account_id, result) = item; // Destructure inside the loop
            match result {
                Ok(calculated_holdings) => {
                    match holdings_repo.save_account_holdings(account_id.as_str(), calculated_holdings) { 
                        Ok(_) => {
                            debug!(
                                "Successfully saved updated holdings for account {}",
                                account_id
                            );
                        }
                        Err(save_err) => {
                            error!("Failed to save holdings for account {} after successful calculation: {}", account_id, save_err);
                            // Return the first save error immediately
                            return Err(save_err);
                        }
                    }
                }
                Err(calc_or_fetch_err) => {
                    error!(
                        "Skipping save for account {} due to calculation/fetch error: {}",
                        account_id, calc_or_fetch_err
                    );
                    // Return the first calculation/fetch error immediately
                    return Err(calc_or_fetch_err);
                }
            }
        }

        // If we reach here, all saves were successful
        Ok(())
    }
}

// Implement the trait for the service
impl HoldingsServiceTrait for HoldingsService {
    /// Retrieves the CURRENTLY STORED holdings state for a given account.
    fn get_account_holdings(&self, account_id: &str) -> Result<Vec<Holding>> {
        debug!("Retrieving stored holdings for account {}", account_id);
        self.holdings_repo.get_account_holdings(account_id)
    }

    /// Retrieves the CURRENTLY STORED holdings state for ALL accounts.
    fn get_all_holdings(&self) -> Result<Vec<Holding>> {
        debug!("Retrieving stored holdings for ALL accounts");
        self.holdings_repo.get_all_holdings()
    }

    /// Forces a recalculation of holdings for a specific account.
    fn recalculate_account(&self, account_id: &str) -> Result<()> {
        debug!("Forcing recalculation for account {}", account_id);
        self.calculate_and_save_single_account(account_id)
    }

    /// Forces a recalculation for ALL provided account IDs in parallel.
    fn recalculate_all_accounts(&self, account_ids: &[String]) -> Result<()> {
        debug!("Calling inherent recalculate_all_accounts from trait impl for {} accounts.", account_ids.len());
        HoldingsService::recalculate_all_accounts(self, account_ids)
    }
}
