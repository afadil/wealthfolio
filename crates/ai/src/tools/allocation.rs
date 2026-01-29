//! Asset allocation tool - calculate portfolio allocation by category using rig-core Tool trait.

use rig::{completion::ToolDefinition, tool::Tool};
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::env::AiEnvironment;
use crate::error::AiError;

// ============================================================================
// Tool Arguments and Output
// ============================================================================

/// Arguments for the get_asset_allocation tool.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAssetAllocationArgs {
    /// Account ID, or "TOTAL" for all accounts.
    #[serde(default = "default_account_id")]
    pub account_id: String,

    /// Grouping method: "type", "class", or "sector".
    #[serde(default = "default_group_by")]
    pub group_by: String,
}

fn default_account_id() -> String {
    "TOTAL".to_string()
}

fn default_group_by() -> String {
    "type".to_string()
}

/// DTO for allocation category in tool output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationDto {
    pub category: String,
    pub value: f64,
    pub percentage: f64,
    pub currency: String,
}

/// Output envelope for asset allocation tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAssetAllocationOutput {
    pub allocations: Vec<AllocationDto>,
    pub total_value: f64,
    pub currency: String,
    pub group_by: String,
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to get portfolio asset allocation.
pub struct GetAssetAllocationTool<E: AiEnvironment> {
    env: Arc<E>,
    base_currency: String,
}

impl<E: AiEnvironment> GetAssetAllocationTool<E> {
    pub fn new(env: Arc<E>, base_currency: String) -> Self {
        Self { env, base_currency }
    }
}

impl<E: AiEnvironment> Clone for GetAssetAllocationTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
            base_currency: self.base_currency.clone(),
        }
    }
}

impl<E: AiEnvironment + 'static> Tool for GetAssetAllocationTool<E> {
    const NAME: &'static str = "get_asset_allocation";

    type Error = AiError;
    type Args = GetAssetAllocationArgs;
    type Output = GetAssetAllocationOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Get portfolio asset allocation grouped by type, class, or sector. Returns each category's value and percentage of the total portfolio. Use account_id='TOTAL' for aggregate allocation across all accounts.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "accountId": {
                        "type": "string",
                        "description": "Account ID to get allocation for, or 'TOTAL' for all accounts",
                        "default": "TOTAL"
                    },
                    "groupBy": {
                        "type": "string",
                        "enum": ["type", "class", "sector"],
                        "description": "Grouping method: 'type' (Cash/Security/AlternativeAsset), 'class' (asset class like Stocks/Bonds), or 'sector' (industry sectors)",
                        "default": "type"
                    }
                },
                "required": []
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let account_id = &args.account_id;
        let group_by = args.group_by.to_lowercase();

        // Validate group_by parameter
        if !["type", "class", "sector"].contains(&group_by.as_str()) {
            return Err(AiError::ToolExecutionFailed(format!(
                "Invalid groupBy value '{}'. Must be 'type', 'class', or 'sector'.",
                group_by
            )));
        }

        // Fetch holdings
        let holdings = self
            .env
            .holdings_service()
            .get_holdings(account_id, &self.base_currency)
            .await
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        // Calculate total value
        let total_value: f64 = holdings
            .iter()
            .filter_map(|h| h.market_value.base.to_f64())
            .sum();

        // Group holdings by category
        let mut category_values: HashMap<String, f64> = HashMap::new();

        for holding in &holdings {
            let market_value = holding.market_value.base.to_f64().unwrap_or(0.0);

            match group_by.as_str() {
                "type" => {
                    let category = match holding.holding_type {
                        wealthfolio_core::holdings::HoldingType::Cash => "Cash",
                        wealthfolio_core::holdings::HoldingType::Security => "Security",
                        wealthfolio_core::holdings::HoldingType::AlternativeAsset => {
                            "AlternativeAsset"
                        }
                    };
                    *category_values.entry(category.to_string()).or_insert(0.0) += market_value;
                }
                "class" => {
                    // Try to get asset class from instrument classifications
                    let categories = holding
                        .instrument
                        .as_ref()
                        .and_then(|i| i.classifications.as_ref())
                        .map(|c| &c.asset_classes)
                        .filter(|classes| !classes.is_empty());

                    if let Some(asset_classes) = categories {
                        // Distribute value according to weights
                        for class in asset_classes {
                            let weight = class.weight / 100.0; // Convert from percentage
                            let weighted_value = market_value * weight;
                            *category_values
                                .entry(class.top_level_category.name.clone())
                                .or_insert(0.0) += weighted_value;
                        }
                    } else {
                        // Fallback to holding type if no asset class available
                        let fallback = match holding.holding_type {
                            wealthfolio_core::holdings::HoldingType::Cash => "Cash",
                            wealthfolio_core::holdings::HoldingType::Security => "Uncategorized",
                            wealthfolio_core::holdings::HoldingType::AlternativeAsset => {
                                "Alternative"
                            }
                        };
                        *category_values.entry(fallback.to_string()).or_insert(0.0) += market_value;
                    }
                }
                "sector" => {
                    // Try to get sector from instrument classifications
                    let sectors = holding
                        .instrument
                        .as_ref()
                        .and_then(|i| i.classifications.as_ref())
                        .map(|c| &c.sectors)
                        .filter(|s| !s.is_empty());

                    if let Some(sector_list) = sectors {
                        // Distribute value according to weights
                        for sector in sector_list {
                            let weight = sector.weight / 100.0; // Convert from percentage
                            let weighted_value = market_value * weight;
                            *category_values
                                .entry(sector.top_level_category.name.clone())
                                .or_insert(0.0) += weighted_value;
                        }
                    } else {
                        // Fallback for holdings without sector data
                        let fallback = match holding.holding_type {
                            wealthfolio_core::holdings::HoldingType::Cash => "Cash",
                            wealthfolio_core::holdings::HoldingType::AlternativeAsset => {
                                "Alternative"
                            }
                            _ => "Uncategorized",
                        };
                        *category_values.entry(fallback.to_string()).or_insert(0.0) += market_value;
                    }
                }
                _ => unreachable!(), // Already validated above
            }
        }

        // Convert to allocation DTOs with percentages
        let mut allocations: Vec<AllocationDto> = category_values
            .into_iter()
            .map(|(category, value)| {
                let percentage = if total_value > 0.0 {
                    (value / total_value) * 100.0
                } else {
                    0.0
                };
                AllocationDto {
                    category,
                    value,
                    percentage,
                    currency: self.base_currency.clone(),
                }
            })
            .collect();

        // Sort by value descending
        allocations.sort_by(|a, b| {
            b.value
                .partial_cmp(&a.value)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(GetAssetAllocationOutput {
            allocations,
            total_value,
            currency: self.base_currency.clone(),
            group_by,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_get_asset_allocation_tool_default_args() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetAssetAllocationTool::new(env, "USD".to_string());

        let result = tool
            .call(GetAssetAllocationArgs {
                account_id: "TOTAL".to_string(),
                group_by: "type".to_string(),
            })
            .await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.currency, "USD");
        assert_eq!(output.group_by, "type");
    }

    #[tokio::test]
    async fn test_get_asset_allocation_by_class() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetAssetAllocationTool::new(env, "USD".to_string());

        let result = tool
            .call(GetAssetAllocationArgs {
                account_id: "TOTAL".to_string(),
                group_by: "class".to_string(),
            })
            .await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.group_by, "class");
    }

    #[tokio::test]
    async fn test_get_asset_allocation_by_sector() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetAssetAllocationTool::new(env, "USD".to_string());

        let result = tool
            .call(GetAssetAllocationArgs {
                account_id: "acc-123".to_string(),
                group_by: "sector".to_string(),
            })
            .await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.group_by, "sector");
    }

    #[tokio::test]
    async fn test_get_asset_allocation_invalid_group_by() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetAssetAllocationTool::new(env, "USD".to_string());

        let result = tool
            .call(GetAssetAllocationArgs {
                account_id: "TOTAL".to_string(),
                group_by: "invalid".to_string(),
            })
            .await;
        assert!(result.is_err());
    }
}
