//! Net worth service traits.

use async_trait::async_trait;
use chrono::NaiveDate;

use super::net_worth_model::{NetWorthHistoryPoint, NetWorthResponse};
use crate::errors::Result;

/// Trait defining the contract for net worth service operations.
#[async_trait]
pub trait NetWorthServiceTrait: Send + Sync {
    /// Calculate net worth as of a specific date.
    ///
    /// For each asset, uses the latest valuation on or before the target date.
    /// Net Worth = Total Assets - Total Liabilities
    ///
    /// # Arguments
    /// * `date` - The as-of date for the calculation
    ///
    /// # Returns
    /// A `NetWorthResponse` containing:
    /// - Total assets and liabilities
    /// - Net worth
    /// - Breakdown by category
    /// - Staleness information
    async fn get_net_worth(&self, date: NaiveDate) -> Result<NetWorthResponse>;

    /// Get net worth history over a date range.
    ///
    /// Combines:
    /// - Portfolio valuations (already stored per account, per day)
    /// - Alternative asset quotes (with FX conversion)
    ///
    /// # Arguments
    /// * `start_date` - Start of the date range
    /// * `end_date` - End of the date range
    ///
    /// # Returns
    /// A vector of `NetWorthHistoryPoint` ordered by date ascending.
    fn get_net_worth_history(
        &self,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<NetWorthHistoryPoint>>;
}
