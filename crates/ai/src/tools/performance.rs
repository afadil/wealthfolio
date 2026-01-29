//! Performance tool - fetch portfolio performance metrics using rig-core Tool trait.

use chrono::{Datelike, Local, NaiveDate};
use rig::{completion::ToolDefinition, tool::Tool};
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::env::AiEnvironment;
use crate::error::AiError;

// ============================================================================
// Tool Arguments and Output
// ============================================================================

/// Arguments for the get_performance tool.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPerformanceArgs {
    /// Account ID, or "TOTAL" for all accounts.
    #[serde(default = "default_account_id")]
    pub account_id: String,

    /// Period for performance calculation: "1M", "3M", "6M", "YTD", "1Y", "ALL".
    #[serde(default = "default_period")]
    pub period: String,
}

fn default_account_id() -> String {
    "TOTAL".to_string()
}

fn default_period() -> String {
    "YTD".to_string()
}

/// Output for the get_performance tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPerformanceOutput {
    /// Percentage return for the period.
    pub total_return: f64,
    /// Absolute gain/loss amount.
    pub total_gain: f64,
    /// Portfolio value at start of period.
    pub start_value: f64,
    /// Current portfolio value.
    pub end_value: f64,
    /// The period used.
    pub period: String,
    /// Start date of period.
    pub start_date: String,
    /// End date of period.
    pub end_date: String,
    /// Base currency.
    pub currency: String,
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to get portfolio performance.
pub struct GetPerformanceTool<E: AiEnvironment> {
    env: Arc<E>,
    base_currency: String,
}

impl<E: AiEnvironment> GetPerformanceTool<E> {
    pub fn new(env: Arc<E>, base_currency: String) -> Self {
        Self { env, base_currency }
    }
}

impl<E: AiEnvironment> Clone for GetPerformanceTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
            base_currency: self.base_currency.clone(),
        }
    }
}

/// Convert a period string to a start date.
fn period_to_start_date(period: &str, end_date: NaiveDate) -> NaiveDate {
    match period.to_uppercase().as_str() {
        "1M" => end_date - chrono::Duration::days(30),
        "3M" => end_date - chrono::Duration::days(90),
        "6M" => end_date - chrono::Duration::days(180),
        "YTD" => NaiveDate::from_ymd_opt(end_date.year(), 1, 1).unwrap_or(end_date),
        "1Y" => end_date - chrono::Duration::days(365),
        "ALL" | _ => NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(),
    }
}

impl<E: AiEnvironment + 'static> Tool for GetPerformanceTool<E> {
    const NAME: &'static str = "get_performance";

    type Error = AiError;
    type Args = GetPerformanceArgs;
    type Output = GetPerformanceOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Get portfolio performance metrics for a specific period. Returns total return percentage, absolute gain/loss, and start/end values. Use account_id='TOTAL' for aggregate performance across all accounts.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "accountId": {
                        "type": "string",
                        "description": "Account ID to get performance for, or 'TOTAL' for all accounts",
                        "default": "TOTAL"
                    },
                    "period": {
                        "type": "string",
                        "description": "Time period for performance calculation",
                        "enum": ["1M", "3M", "6M", "YTD", "1Y", "ALL"],
                        "default": "YTD"
                    }
                },
                "required": []
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let account_id = &args.account_id;
        let period = args.period.to_uppercase();

        // Calculate date range
        let end_date = Local::now().date_naive();
        let start_date = period_to_start_date(&period, end_date);

        // Fetch historical valuations
        let valuations = self
            .env
            .valuation_service()
            .get_historical_valuations(account_id, Some(start_date), Some(end_date))
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        // Find start and end values
        let (start_value, actual_start_date, end_value, actual_end_date) = if valuations.is_empty()
        {
            (0.0, start_date, 0.0, end_date)
        } else {
            // Valuations should be sorted by date, find first and last
            let first = valuations.first().unwrap();
            let last = valuations.last().unwrap();

            let start_val = first.total_value.to_f64().unwrap_or(0.0);
            let end_val = last.total_value.to_f64().unwrap_or(0.0);

            (
                start_val,
                first.valuation_date,
                end_val,
                last.valuation_date,
            )
        };

        // Calculate simple return: (endValue - startValue) / startValue * 100
        let total_gain = end_value - start_value;
        let total_return = if start_value > 0.0 {
            (total_gain / start_value) * 100.0
        } else {
            0.0
        };

        Ok(GetPerformanceOutput {
            total_return,
            total_gain,
            start_value,
            end_value,
            period,
            start_date: actual_start_date.to_string(),
            end_date: actual_end_date.to_string(),
            currency: self.base_currency.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_get_performance_tool() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetPerformanceTool::new(env, "USD".to_string());

        let result = tool
            .call(GetPerformanceArgs {
                account_id: "TOTAL".to_string(),
                period: "YTD".to_string(),
            })
            .await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.period, "YTD");
        assert_eq!(output.currency, "USD");
    }

    #[tokio::test]
    async fn test_get_performance_with_account_id() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetPerformanceTool::new(env, "USD".to_string());

        let result = tool
            .call(GetPerformanceArgs {
                account_id: "acc-123".to_string(),
                period: "1M".to_string(),
            })
            .await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.period, "1M");
    }

    #[tokio::test]
    async fn test_period_conversion() {
        let today = NaiveDate::from_ymd_opt(2024, 6, 15).unwrap();

        // Test YTD
        let ytd_start = period_to_start_date("YTD", today);
        assert_eq!(ytd_start, NaiveDate::from_ymd_opt(2024, 1, 1).unwrap());

        // Test 1M (30 days back)
        let one_month_start = period_to_start_date("1M", today);
        assert_eq!(
            one_month_start,
            NaiveDate::from_ymd_opt(2024, 5, 16).unwrap()
        );

        // Test 1Y (365 days back - 2024 is a leap year so 366 days from Jan 1)
        let one_year_start = period_to_start_date("1Y", today);
        // 365 days back from June 15, 2024: June 16, 2023 (leap year adjustment)
        assert_eq!(
            one_year_start,
            NaiveDate::from_ymd_opt(2023, 6, 16).unwrap()
        );

        // Test ALL
        let all_start = period_to_start_date("ALL", today);
        assert_eq!(all_start, NaiveDate::from_ymd_opt(1970, 1, 1).unwrap());
    }
}
