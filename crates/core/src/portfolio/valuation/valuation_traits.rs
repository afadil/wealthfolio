//! Repository traits for portfolio valuations.

use async_trait::async_trait;
use chrono::NaiveDate;

use crate::errors::Result;
use super::DailyAccountValuation;

/// Repository trait for managing daily account valuations.
#[async_trait]
pub trait ValuationRepositoryTrait: Send + Sync {
    /// Save multiple valuation records to the database.
    async fn save_valuations(&self, valuation_records: &[DailyAccountValuation]) -> Result<()>;

    /// Get historical valuations for a specific account within optional date range.
    fn get_historical_valuations(
        &self,
        account_id: &str,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<DailyAccountValuation>>;

    /// Get the latest valuation date for a specific account.
    fn load_latest_valuation_date(&self, account_id: &str) -> Result<Option<NaiveDate>>;

    /// Delete all valuations for a specific account.
    async fn delete_valuations_for_account(&self, account_id: &str) -> Result<()>;

    /// Get the latest valuations for multiple accounts.
    fn get_latest_valuations(
        &self,
        account_ids: &[String],
    ) -> Result<Vec<DailyAccountValuation>>;

    /// Get valuations for multiple accounts on a specific date.
    fn get_valuations_on_date(
        &self,
        account_ids: &[String],
        date: NaiveDate,
    ) -> Result<Vec<DailyAccountValuation>>;
}
