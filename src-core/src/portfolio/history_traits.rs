use crate::errors::Result;
use crate::models::{HistoryRecord, HistorySummary};
use chrono::NaiveDate;
use crate::accounts::Account;
use crate::activities::Activity;
use std::collections::HashMap;

// Define the trait for the History Repository
pub trait HistoryRepositoryTrait: Send + Sync {
    fn get_by_account(
        &self,
        input_account_id: Option<&str>,
        start_date: Option<NaiveDate>,
        end_date: Option<NaiveDate>,
    ) -> Result<Vec<HistoryRecord>>;
    
    // Added methods from HistoryRepository
    fn get_all(&self) -> Result<Vec<HistoryRecord>>;
    fn get_latest_by_account(&self, input_account_id: &str) -> Result<HistoryRecord>;
    fn save_batch(&self, history_data: &[HistoryRecord]) -> Result<()>;
    fn delete_by_accounts(&self, accounts: &[Account]) -> Result<()>;
    fn get_all_last_histories(
        &self,
        account_ids: &[String],
    ) -> Result<HashMap<String, Option<HistoryRecord>>>;
    fn get_all_active_account_histories(&self) -> Result<Vec<HistoryRecord>>;
    
    // Add other methods used by services if needed in the future
}

// Define the trait for the History Service
#[async_trait::async_trait]
pub trait HistoryServiceTrait: Send + Sync {
    fn get_all_accounts_history(&self) -> Result<Vec<HistoryRecord>>;
    fn get_portfolio_history(
        &self,
        input_account_id: Option<&str>,
    ) -> Result<Vec<HistoryRecord>>;
    fn get_latest_account_history(
        &self,
        input_account_id: &str,
    ) -> Result<HistoryRecord>;
    async fn calculate_historical_data(
        &self,
        accounts: &[Account],
        activities: &[Activity],
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>>;
} 