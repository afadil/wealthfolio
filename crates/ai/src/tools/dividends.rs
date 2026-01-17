//! Dividends tool - fetch dividend and interest payments using rig-core Tool trait.

use rig::{completion::ToolDefinition, tool::Tool};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::constants::MAX_DIVIDENDS;
use crate::env::AiEnvironment;
use crate::error::AiError;
use wealthfolio_core::activities::Sort;

// ============================================================================
// Tool Arguments and Output
// ============================================================================

/// Arguments for the get_dividends tool.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDividendsArgs {
    /// Account ID filter (optional, all accounts if not provided).
    pub account_id: Option<String>,
    /// Start date filter (ISO format: YYYY-MM-DD).
    pub start_date: Option<String>,
    /// End date filter (ISO format: YYYY-MM-DD).
    pub end_date: Option<String>,
    /// Symbol filter (optional).
    pub symbol: Option<String>,
}

/// DTO for dividend data in tool output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DividendDto {
    pub date: String,
    pub symbol: Option<String>,
    pub amount: f64,
    pub currency: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub activity_type: String,
}

/// Output envelope for dividends tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDividendsOutput {
    pub dividends: Vec<DividendDto>,
    pub total_amount: f64,
    pub currency: String,
    pub count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to fetch dividend and interest payments.
pub struct GetDividendsTool<E: AiEnvironment> {
    env: Arc<E>,
}

impl<E: AiEnvironment> GetDividendsTool<E> {
    pub fn new(env: Arc<E>) -> Self {
        Self { env }
    }
}

impl<E: AiEnvironment> Clone for GetDividendsTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
        }
    }
}

impl<E: AiEnvironment + 'static> Tool for GetDividendsTool<E> {
    const NAME: &'static str = "get_dividends";

    type Error = AiError;
    type Args = GetDividendsArgs;
    type Output = GetDividendsOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Fetch dividend and interest payments from investment accounts. Returns payment history with amounts, dates, and symbols.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "accountId": {
                        "type": "string",
                        "description": "Filter by account ID (optional, all accounts if not provided)"
                    },
                    "startDate": {
                        "type": "string",
                        "description": "Start date filter in ISO format (YYYY-MM-DD)"
                    },
                    "endDate": {
                        "type": "string",
                        "description": "End date filter in ISO format (YYYY-MM-DD)"
                    },
                    "symbol": {
                        "type": "string",
                        "description": "Filter by symbol or asset keyword"
                    }
                },
                "required": []
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        // Prepare filters
        let account_ids = args.account_id.clone().map(|id| vec![id]);
        let activity_types = Some(vec!["DIVIDEND".to_string(), "INTEREST".to_string()]);
        let symbol_keyword = args.symbol;

        // Sort by date descending
        let sort = Sort {
            id: "date".to_string(),
            desc: true,
        };

        // Search activities with dividend/interest filter
        let response = self
            .env
            .activity_service()
            .search_activities(
                1,                        // page
                MAX_DIVIDENDS as i64 + 1, // page_size (fetch one extra to detect truncation)
                account_ids,
                activity_types,
                symbol_keyword,
                Some(sort),
                None, // needs_review_filter
            )
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        let total_row_count = response.meta.total_row_count as usize;

        // Convert to DTOs and apply date filtering
        let mut dividends: Vec<DividendDto> = response
            .data
            .into_iter()
            .filter(|a| {
                // Apply date filters if provided
                let date = &a.date;
                let after_start = args
                    .start_date
                    .as_ref()
                    .map(|s| date >= s)
                    .unwrap_or(true);
                let before_end = args.end_date.as_ref().map(|e| date <= e).unwrap_or(true);
                after_start && before_end
            })
            .take(MAX_DIVIDENDS)
            .filter_map(|a| {
                // Parse amount, skip if not available
                let amount = a.amount.as_ref().and_then(|s| s.parse::<f64>().ok())?;
                Some(DividendDto {
                    date: a.date.clone(),
                    symbol: if a.asset_id.is_empty() {
                        None
                    } else {
                        Some(a.asset_id)
                    },
                    amount,
                    currency: a.currency,
                    account_id: a.account_id.clone(),
                    account_name: Some(a.account_name),
                    activity_type: a.activity_type,
                })
            })
            .collect();

        // Sort by date descending (in case filtering changed order)
        dividends.sort_by(|a, b| b.date.cmp(&a.date));

        let returned_count = dividends.len();
        let truncated = total_row_count > MAX_DIVIDENDS;

        // Calculate total amount
        let total_amount: f64 = dividends.iter().map(|d| d.amount).sum();

        // Get base currency from environment
        let currency = self.env.base_currency();

        Ok(GetDividendsOutput {
            dividends,
            total_amount,
            currency,
            count: returned_count,
            truncated: if truncated { Some(true) } else { None },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_get_dividends_tool() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetDividendsTool::new(env);

        let result = tool.call(GetDividendsArgs::default()).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.count, output.dividends.len());
        assert_eq!(output.currency, "USD");
    }

    #[tokio::test]
    async fn test_get_dividends_with_filters() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetDividendsTool::new(env);

        let result = tool
            .call(GetDividendsArgs {
                account_id: Some("test-account".to_string()),
                start_date: Some("2024-01-01".to_string()),
                end_date: Some("2024-12-31".to_string()),
                symbol: Some("AAPL".to_string()),
            })
            .await;
        assert!(result.is_ok());
    }
}
