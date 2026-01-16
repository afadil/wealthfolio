//! Portfolio data provider trait for AI assistant tools.
//!
//! This module defines the abstraction layer between AI tools and portfolio data.
//! Tools call methods on the `PortfolioDataProvider` trait, which can be implemented
//! by the Tauri/Axum layer to provide actual data access.

use async_trait::async_trait;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::types::AiAssistantError;

// ============================================================================
// DTOs for Tool Results (bounded, read-only outputs)
// ============================================================================

/// Bounded holding data for AI tools.
/// Contains only the fields relevant for AI analysis, not raw portfolio data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingDto {
    pub account_id: String,
    pub symbol: String,
    pub name: Option<String>,
    pub holding_type: String,
    pub quantity: f64,
    pub market_value_base: f64,
    pub cost_basis_base: Option<f64>,
    pub unrealized_gain_pct: Option<f64>,
    pub day_change_pct: Option<f64>,
    pub weight: f64,
    pub currency: String,
}

/// Bounded account data for AI tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDto {
    pub id: String,
    pub name: String,
    pub account_type: String,
    pub currency: String,
    pub is_active: bool,
}

/// Bounded valuation point for AI tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationPointDto {
    pub date: String,
    pub total_value: f64,
    pub cash_balance: f64,
    pub investment_value: f64,
    pub cost_basis: f64,
    pub net_contribution: f64,
}

/// Bounded activity data for AI tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDto {
    pub id: String,
    pub date: String,
    pub activity_type: String,
    pub symbol: Option<String>,
    pub quantity: Option<f64>,
    pub unit_price: Option<f64>,
    pub amount: Option<f64>,
    pub fee: Option<f64>,
    pub currency: String,
    pub account_id: String,
}

/// Bounded income/dividend data for AI tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeDto {
    pub symbol: String,
    pub name: Option<String>,
    pub total_amount: f64,
    pub currency: String,
    pub payment_count: i32,
    pub last_payment_date: Option<String>,
}

/// Bounded allocation data for AI tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationDto {
    pub category: String,
    pub name: String,
    pub value: f64,
    pub percentage: f64,
}

/// Bounded performance data for AI tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceDto {
    pub period: String,
    pub total_return_pct: f64,
    pub total_gain: f64,
    pub start_value: f64,
    pub end_value: f64,
    pub contributions: f64,
    pub withdrawals: f64,
}

// ============================================================================
// Query Parameters
// ============================================================================

/// Parameters for searching activities.
#[derive(Debug, Clone, Default)]
pub struct SearchActivitiesParams {
    /// Filter by account ID(s). None = all accounts.
    pub account_ids: Option<Vec<String>>,
    /// Filter by activity type(s). None = all types.
    pub activity_types: Option<Vec<String>>,
    /// Filter by symbol/asset keyword.
    pub symbol_keyword: Option<String>,
    /// Start date for date range filter.
    pub start_date: Option<NaiveDate>,
    /// End date for date range filter.
    pub end_date: Option<NaiveDate>,
    /// Maximum number of rows to return.
    pub limit: usize,
}

/// Parameters for getting valuations.
#[derive(Debug, Clone, Default)]
pub struct GetValuationsParams {
    /// Account ID. "TOTAL" for aggregate across all accounts.
    pub account_id: String,
    /// Start date for the valuation range.
    pub start_date: Option<NaiveDate>,
    /// End date for the valuation range.
    pub end_date: Option<NaiveDate>,
    /// Maximum number of data points to return.
    pub limit: usize,
}

/// Parameters for getting holdings.
#[derive(Debug, Clone, Default)]
pub struct GetHoldingsParams {
    /// Account ID. "TOTAL" for all accounts.
    pub account_id: String,
    /// Maximum number of holdings to return.
    pub limit: usize,
}

/// Parameters for getting income/dividends.
#[derive(Debug, Clone, Default)]
pub struct GetIncomeParams {
    /// Account ID filter. None = all accounts.
    pub account_id: Option<String>,
    /// Start date for income period.
    pub start_date: Option<NaiveDate>,
    /// End date for income period.
    pub end_date: Option<NaiveDate>,
    /// Maximum number of records to return.
    pub limit: usize,
}

/// Parameters for getting allocations.
#[derive(Debug, Clone, Default)]
pub struct GetAllocationsParams {
    /// Account ID. "TOTAL" for all accounts.
    pub account_id: String,
    /// Allocation category (e.g., "asset_class", "sector", "geography").
    pub category: String,
}

/// Parameters for getting performance.
#[derive(Debug, Clone, Default)]
pub struct GetPerformanceParams {
    /// Account ID. "TOTAL" for all accounts.
    pub account_id: String,
    /// Start date for performance calculation.
    pub start_date: Option<NaiveDate>,
    /// End date for performance calculation.
    pub end_date: Option<NaiveDate>,
}

// ============================================================================
// Result Containers with Metadata
// ============================================================================

/// Container for bounded results with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedResult<T> {
    /// The result data (truncated if exceeds limit).
    pub data: Vec<T>,
    /// Original count before truncation.
    pub original_count: usize,
    /// Returned count after truncation.
    pub returned_count: usize,
    /// Whether data was truncated.
    pub truncated: bool,
    /// Account scope for the query.
    pub account_scope: String,
}

impl<T> BoundedResult<T> {
    /// Create a bounded result, truncating if necessary.
    pub fn from_vec(data: Vec<T>, limit: usize, account_scope: &str) -> Self {
        let original_count = data.len();
        let truncated = original_count > limit;
        let data: Vec<T> = data.into_iter().take(limit).collect();
        let returned_count = data.len();

        Self {
            data,
            original_count,
            returned_count,
            truncated,
            account_scope: account_scope.to_string(),
        }
    }
}

// ============================================================================
// Portfolio Data Provider Trait
// ============================================================================

/// Trait for providing portfolio data to AI tools.
///
/// This trait abstracts the data access layer, allowing tools to be
/// tested without actual database access. The Tauri/Axum layer implements
/// this trait to provide real data.
#[async_trait]
pub trait PortfolioDataProvider: Send + Sync {
    /// Get list of accounts.
    async fn get_accounts(&self) -> Result<Vec<AccountDto>, AiAssistantError>;

    /// Get holdings for an account or all accounts.
    async fn get_holdings(
        &self,
        params: GetHoldingsParams,
    ) -> Result<BoundedResult<HoldingDto>, AiAssistantError>;

    /// Get historical valuations.
    async fn get_valuations(
        &self,
        params: GetValuationsParams,
    ) -> Result<BoundedResult<ValuationPointDto>, AiAssistantError>;

    /// Search activities/transactions.
    async fn search_activities(
        &self,
        params: SearchActivitiesParams,
    ) -> Result<BoundedResult<ActivityDto>, AiAssistantError>;

    /// Get income/dividend summary.
    async fn get_income(
        &self,
        params: GetIncomeParams,
    ) -> Result<BoundedResult<IncomeDto>, AiAssistantError>;

    /// Get asset allocation breakdown.
    async fn get_allocations(
        &self,
        params: GetAllocationsParams,
    ) -> Result<Vec<AllocationDto>, AiAssistantError>;

    /// Get performance metrics.
    async fn get_performance(
        &self,
        params: GetPerformanceParams,
    ) -> Result<PerformanceDto, AiAssistantError>;

    /// Get the base currency.
    fn get_base_currency(&self) -> String;
}

// ============================================================================
// Mock Provider for Testing
// ============================================================================

/// Mock portfolio data provider for testing.
#[derive(Debug, Default, Clone)]
pub struct MockPortfolioDataProvider {
    pub accounts: Vec<AccountDto>,
    pub holdings: Vec<HoldingDto>,
    pub valuations: Vec<ValuationPointDto>,
    pub activities: Vec<ActivityDto>,
    pub income: Vec<IncomeDto>,
    pub allocations: Vec<AllocationDto>,
    pub performance: Option<PerformanceDto>,
    pub base_currency: String,
}

impl MockPortfolioDataProvider {
    pub fn new() -> Self {
        Self {
            base_currency: "USD".to_string(),
            ..Default::default()
        }
    }

    pub fn with_accounts(mut self, accounts: Vec<AccountDto>) -> Self {
        self.accounts = accounts;
        self
    }

    pub fn with_holdings(mut self, holdings: Vec<HoldingDto>) -> Self {
        self.holdings = holdings;
        self
    }
}

#[async_trait]
impl PortfolioDataProvider for MockPortfolioDataProvider {
    async fn get_accounts(&self) -> Result<Vec<AccountDto>, AiAssistantError> {
        Ok(self.accounts.clone())
    }

    async fn get_holdings(
        &self,
        params: GetHoldingsParams,
    ) -> Result<BoundedResult<HoldingDto>, AiAssistantError> {
        let holdings: Vec<_> = self
            .holdings
            .iter()
            .filter(|h| params.account_id == "TOTAL" || h.account_id == params.account_id)
            .cloned()
            .collect();
        Ok(BoundedResult::from_vec(holdings, params.limit, &params.account_id))
    }

    async fn get_valuations(
        &self,
        params: GetValuationsParams,
    ) -> Result<BoundedResult<ValuationPointDto>, AiAssistantError> {
        Ok(BoundedResult::from_vec(
            self.valuations.clone(),
            params.limit,
            &params.account_id,
        ))
    }

    async fn search_activities(
        &self,
        params: SearchActivitiesParams,
    ) -> Result<BoundedResult<ActivityDto>, AiAssistantError> {
        let scope = params
            .account_ids
            .as_ref()
            .map(|ids| ids.join(","))
            .unwrap_or_else(|| "all".to_string());
        Ok(BoundedResult::from_vec(self.activities.clone(), params.limit, &scope))
    }

    async fn get_income(
        &self,
        params: GetIncomeParams,
    ) -> Result<BoundedResult<IncomeDto>, AiAssistantError> {
        let scope = params.account_id.clone().unwrap_or_else(|| "all".to_string());
        Ok(BoundedResult::from_vec(self.income.clone(), params.limit, &scope))
    }

    async fn get_allocations(
        &self,
        _params: GetAllocationsParams,
    ) -> Result<Vec<AllocationDto>, AiAssistantError> {
        Ok(self.allocations.clone())
    }

    async fn get_performance(
        &self,
        _params: GetPerformanceParams,
    ) -> Result<PerformanceDto, AiAssistantError> {
        self.performance.clone().ok_or_else(|| AiAssistantError::Internal {
            message: "No performance data configured".to_string(),
        })
    }

    fn get_base_currency(&self) -> String {
        self.base_currency.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bounded_result_no_truncation() {
        let data = vec![1, 2, 3];
        let result = BoundedResult::from_vec(data, 10, "test");
        assert_eq!(result.original_count, 3);
        assert_eq!(result.returned_count, 3);
        assert!(!result.truncated);
    }

    #[test]
    fn test_bounded_result_with_truncation() {
        let data = vec![1, 2, 3, 4, 5];
        let result = BoundedResult::from_vec(data, 3, "test");
        assert_eq!(result.original_count, 5);
        assert_eq!(result.returned_count, 3);
        assert!(result.truncated);
        assert_eq!(result.data, vec![1, 2, 3]);
    }

    #[tokio::test]
    async fn test_mock_provider() {
        let provider = MockPortfolioDataProvider::new().with_accounts(vec![AccountDto {
            id: "acc-1".to_string(),
            name: "Test Account".to_string(),
            account_type: "SECURITIES".to_string(),
            currency: "USD".to_string(),
            is_active: true,
        }]);

        let accounts = provider.get_accounts().await.unwrap();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].name, "Test Account");
    }
}
