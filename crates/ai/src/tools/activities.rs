//! Activities tool - search transactions using rig-core Tool trait.

use rig::{completion::ToolDefinition, tool::Tool};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::constants::{DEFAULT_ACTIVITIES_DAYS, MAX_ACTIVITIES_ROWS};
use crate::env::AiEnvironment;
use crate::error::AiError;
use wealthfolio_core::activities::Sort;

// ============================================================================
// Tool Arguments and Output
// ============================================================================

/// Arguments for the search_activities tool.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchActivitiesArgs {
    /// Account ID filter (optional, all accounts if not provided).
    pub account_id: Option<String>,
    /// Activity type filter (e.g., "BUY", "SELL", "DIVIDEND").
    pub activity_type: Option<String>,
    /// Symbol/asset keyword filter.
    pub symbol: Option<String>,
    /// Number of days to search back (default: 90).
    #[serde(default)]
    pub days: Option<i64>,
}

/// DTO for activity data in tool output.
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
    pub account_name: Option<String>,
}

/// Output envelope for activities tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchActivitiesOutput {
    pub activities: Vec<ActivityDto>,
    pub count: usize,
    pub total_row_count: usize,
    pub account_scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_amount: Option<f64>,
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to search activities/transactions.
pub struct SearchActivitiesTool<E: AiEnvironment> {
    env: Arc<E>,
}

impl<E: AiEnvironment> SearchActivitiesTool<E> {
    pub fn new(env: Arc<E>) -> Self {
        Self { env }
    }
}

impl<E: AiEnvironment> Clone for SearchActivitiesTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
        }
    }
}

impl<E: AiEnvironment + 'static> Tool for SearchActivitiesTool<E> {
    const NAME: &'static str = "search_activities";

    type Error = AiError;
    type Args = SearchActivitiesArgs;
    type Output = SearchActivitiesOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Search investment activities (transactions) such as buys, sells, dividends, deposits, and withdrawals. Can filter by account, activity type, symbol, and date range.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "accountId": {
                        "type": "string",
                        "description": "Filter by account ID (optional, all accounts if not provided)"
                    },
                    "activityType": {
                        "type": "string",
                        "description": "Filter by activity type: BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, TRANSFER_IN, TRANSFER_OUT, INTEREST, FEE, SPLIT, TAX",
                        "enum": ["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL", "TRANSFER_IN", "TRANSFER_OUT", "INTEREST", "FEE", "SPLIT", "TAX"]
                    },
                    "symbol": {
                        "type": "string",
                        "description": "Filter by symbol or asset keyword"
                    },
                    "days": {
                        "type": "integer",
                        "description": "Number of days to search back (default: 90)",
                        "default": 90
                    }
                },
                "required": []
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        // Determine search parameters
        let account_ids = args.account_id.clone().map(|id| vec![id]);
        let activity_types = args.activity_type.map(|t| vec![t]);
        let symbol_keyword = args.symbol;
        let _days = args.days.unwrap_or(DEFAULT_ACTIVITIES_DAYS);

        // Sort by date descending
        let sort = Sort {
            id: "date".to_string(),
            desc: true,
        };

        // Search activities
        let response = self
            .env
            .activity_service()
            .search_activities(
                1,                          // page
                MAX_ACTIVITIES_ROWS as i64, // page_size
                account_ids.clone(),
                activity_types,
                symbol_keyword,
                Some(sort),
                None, // needs_review_filter
            )
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        let total_row_count = response.meta.total_row_count as usize;

        // Convert to DTOs
        let activities: Vec<ActivityDto> = response
            .data
            .into_iter()
            .take(MAX_ACTIVITIES_ROWS)
            .map(|a| {
                // Parse numeric strings to f64
                let quantity = a.quantity.parse::<f64>().ok();
                let unit_price = a.unit_price.parse::<f64>().ok();
                let fee = a.fee.parse::<f64>().ok();
                let amount = a.amount.as_ref().and_then(|s| s.parse::<f64>().ok());

                ActivityDto {
                    id: a.id,
                    date: a.date.clone(),
                    activity_type: a.activity_type,
                    symbol: if a.asset_id.is_empty() {
                        None
                    } else {
                        Some(a.asset_id)
                    },
                    quantity,
                    unit_price,
                    amount,
                    fee,
                    currency: a.currency,
                    account_id: a.account_id.clone(),
                    account_name: Some(a.account_name),
                }
            })
            .collect();

        let returned_count = activities.len();
        let truncated = total_row_count > returned_count;

        // Calculate totals for metadata
        let total_amount: f64 = activities.iter().filter_map(|a| a.amount).sum();

        let account_scope = args
            .account_id
            .unwrap_or_else(|| "all".to_string());

        Ok(SearchActivitiesOutput {
            activities,
            count: returned_count,
            total_row_count,
            account_scope,
            truncated: if truncated { Some(true) } else { None },
            total_amount: if total_amount > 0.0 {
                Some(total_amount)
            } else {
                None
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_search_activities_tool() {
        let env = Arc::new(MockEnvironment::new());
        let tool = SearchActivitiesTool::new(env);

        let result = tool.call(SearchActivitiesArgs::default()).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.count, output.activities.len());
    }

    #[tokio::test]
    async fn test_search_activities_with_filters() {
        let env = Arc::new(MockEnvironment::new());
        let tool = SearchActivitiesTool::new(env);

        let result = tool
            .call(SearchActivitiesArgs {
                activity_type: Some("DIVIDEND".to_string()),
                days: Some(30),
                ..Default::default()
            })
            .await;
        assert!(result.is_ok());
    }
}
