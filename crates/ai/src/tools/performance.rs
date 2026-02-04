//! Performance tool - fetch portfolio performance metrics using PerformanceService.

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
/// Field names match what the frontend expects.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetPerformanceOutput {
    /// Account or portfolio ID.
    pub id: String,
    /// Period start date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period_start_date: Option<String>,
    /// Period end date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period_end_date: Option<String>,
    /// Base currency.
    pub currency: String,
    /// Cumulative time-weighted return (decimal, e.g., 0.05 = 5%).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cumulative_twr: Option<f64>,
    /// Absolute gain/loss amount.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gain_loss_amount: Option<f64>,
    /// Annualized TWR.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annualized_twr: Option<f64>,
    /// Simple return (decimal).
    pub simple_return: f64,
    /// Annualized simple return.
    pub annualized_simple_return: f64,
    /// Cumulative money-weighted return.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cumulative_mwr: Option<f64>,
    /// Annualized MWR.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annualized_mwr: Option<f64>,
    /// Portfolio volatility (annualized).
    pub volatility: f64,
    /// Maximum drawdown.
    pub max_drawdown: f64,
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
fn period_to_start_date(period: &str, end_date: NaiveDate) -> Option<NaiveDate> {
    match period.to_uppercase().as_str() {
        "1M" => Some(end_date - chrono::Duration::days(30)),
        "3M" => Some(end_date - chrono::Duration::days(90)),
        "6M" => Some(end_date - chrono::Duration::days(180)),
        "YTD" => NaiveDate::from_ymd_opt(end_date.year(), 1, 1),
        "1Y" => Some(end_date - chrono::Duration::days(365)),
        "ALL" | _ => None, // None means no start date filter
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
            description: "Get portfolio performance metrics including TWR, MWR, volatility, and max drawdown. Use account_id='TOTAL' for aggregate performance across all accounts.".to_string(),
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

        // Use PerformanceService to calculate metrics
        let metrics = self
            .env
            .performance_service()
            .calculate_performance_history("account", account_id, start_date, Some(end_date), None)
            .await
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        Ok(GetPerformanceOutput {
            id: metrics.id,
            period_start_date: metrics.period_start_date.map(|d| d.to_string()),
            period_end_date: metrics.period_end_date.map(|d| d.to_string()),
            currency: if metrics.currency.is_empty() {
                self.base_currency.clone()
            } else {
                metrics.currency
            },
            cumulative_twr: metrics.cumulative_twr.and_then(|v| v.to_f64()),
            gain_loss_amount: metrics.gain_loss_amount.and_then(|v| v.to_f64()),
            annualized_twr: metrics.annualized_twr.and_then(|v| v.to_f64()),
            simple_return: metrics.simple_return.to_f64().unwrap_or(0.0),
            annualized_simple_return: metrics.annualized_simple_return.to_f64().unwrap_or(0.0),
            cumulative_mwr: metrics.cumulative_mwr.and_then(|v| v.to_f64()),
            annualized_mwr: metrics.annualized_mwr.and_then(|v| v.to_f64()),
            volatility: metrics.volatility.to_f64().unwrap_or(0.0),
            max_drawdown: metrics.max_drawdown.to_f64().unwrap_or(0.0),
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
    }

    #[tokio::test]
    async fn test_period_conversion() {
        let today = NaiveDate::from_ymd_opt(2024, 6, 15).unwrap();

        // Test YTD
        let ytd_start = period_to_start_date("YTD", today);
        assert_eq!(ytd_start, NaiveDate::from_ymd_opt(2024, 1, 1));

        // Test 1M (30 days back)
        let one_month_start = period_to_start_date("1M", today);
        assert_eq!(one_month_start, NaiveDate::from_ymd_opt(2024, 5, 16));

        // Test 1Y (365 days back)
        let one_year_start = period_to_start_date("1Y", today);
        assert_eq!(one_year_start, NaiveDate::from_ymd_opt(2023, 6, 16));

        // Test ALL - returns None (no start date filter)
        let all_start = period_to_start_date("ALL", today);
        assert_eq!(all_start, None);
    }
}
