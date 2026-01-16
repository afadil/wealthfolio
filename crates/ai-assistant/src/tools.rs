//! Tool registry and execution for AI assistant.
//!
//! This module provides:
//! - Tool trait and registry for available tools
//! - Per-thread tool allowlist support
//! - Input validation and output shaping
//! - Result DTOs with `{ data, meta }` envelope
//! - Real portfolio tools with strict schemas and bounded outputs

use async_trait::async_trait;
use chrono::{Duration, NaiveDate};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Instant;

use crate::portfolio_data::{
    GetAllocationsParams, GetHoldingsParams, GetIncomeParams, GetPerformanceParams,
    GetValuationsParams, PortfolioDataProvider, SearchActivitiesParams,
};
use crate::providers::ToolDefinition;
use crate::types::{AiAssistantError, ToolResultData};

// ============================================================================
// Constants - Default Guardrails
// ============================================================================

/// Default lookback for search_activities: 90 days
pub const DEFAULT_ACTIVITIES_DAYS: i64 = 90;
/// Maximum rows for search_activities
pub const MAX_ACTIVITIES_ROWS: usize = 200;

/// Default lookback for get_valuations: 1 year (365 days)
pub const DEFAULT_VALUATIONS_DAYS: i64 = 365;
/// Maximum data points for get_valuations
pub const MAX_VALUATIONS_POINTS: usize = 400;

/// Maximum holdings to return
pub const MAX_HOLDINGS: usize = 100;

/// Maximum income records to return
pub const MAX_INCOME_RECORDS: usize = 50;

// ============================================================================
// Tool Trait
// ============================================================================

/// Result of tool execution with structured data and metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    /// The result data (structured JSON).
    pub data: Value,
    /// Metadata about the result.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub meta: HashMap<String, Value>,
}

impl ToolResult {
    /// Create a successful result with data.
    pub fn ok(data: impl Serialize) -> Self {
        Self {
            data: serde_json::to_value(data).unwrap_or(Value::Null),
            meta: HashMap::new(),
        }
    }

    /// Create a result with metadata.
    pub fn with_meta(mut self, key: &str, value: impl Serialize) -> Self {
        self.meta
            .insert(key.to_string(), serde_json::to_value(value).unwrap());
        self
    }

    /// Add truncation info to metadata.
    pub fn with_truncation(self, original_count: usize, returned_count: usize) -> Self {
        self.with_meta("originalCount", original_count)
            .with_meta("returnedCount", returned_count)
            .with_meta("truncated", original_count > returned_count)
    }

    /// Add duration to metadata.
    pub fn with_duration_ms(self, duration_ms: u128) -> Self {
        self.with_meta("durationMs", duration_ms)
    }

    /// Add account scope to metadata.
    pub fn with_account_scope(self, scope: &str) -> Self {
        self.with_meta("accountScope", scope)
    }

    /// Add row/point count to metadata.
    pub fn with_count(self, count: usize) -> Self {
        self.with_meta("count", count)
    }

    /// Convert to ToolResultData for streaming events.
    pub fn to_result_data(self, tool_call_id: &str, success: bool) -> ToolResultData {
        ToolResultData {
            tool_call_id: tool_call_id.to_string(),
            success,
            data: self.data,
            meta: self.meta,
            error: None,
        }
    }
}

/// Context available to tools during execution.
pub struct ToolContext {
    /// Base currency for monetary values.
    pub base_currency: String,
    /// Current timestamp for time-sensitive queries.
    pub now: chrono::DateTime<chrono::Utc>,
    /// Locale for formatting.
    pub locale: Option<String>,
    /// Portfolio data provider for accessing portfolio data.
    pub data_provider: Arc<dyn PortfolioDataProvider>,
}

/// Trait for AI assistant tools.
///
/// Tools are read-only in v1 and have strict input validation.
/// They return structured results with `{ data, meta }` envelope.
#[async_trait]
pub trait Tool: Send + Sync {
    /// Get the tool name (used in function calling).
    fn name(&self) -> &str;

    /// Get a description of what the tool does.
    fn description(&self) -> &str;

    /// Get the JSON schema for tool parameters.
    fn parameters_schema(&self) -> Value;

    /// Execute the tool with the given arguments.
    ///
    /// # Arguments
    /// * `args` - The arguments as a JSON value
    /// * `ctx` - The execution context
    ///
    /// # Returns
    /// * `Ok(ToolResult)` - Success with data and metadata
    /// * `Err(AiAssistantError)` - Execution failed
    async fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, AiAssistantError>;

    /// Convert to a ToolDefinition for the provider.
    fn to_definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: self.name().to_string(),
            description: self.description().to_string(),
            parameters: self.parameters_schema(),
        }
    }
}

// ============================================================================
// Tool Registry
// ============================================================================

/// Registry of available tools with allowlist support.
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl ToolRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// Register a tool.
    pub fn register(&mut self, tool: Arc<dyn Tool>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    /// Get a tool by name.
    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }

    /// List all registered tool names.
    pub fn list_names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    /// Get tool definitions for a subset of tools.
    ///
    /// # Arguments
    /// * `allowlist` - If Some, only include tools in this list. If None, include all.
    pub fn get_definitions(&self, allowlist: Option<&[String]>) -> Vec<ToolDefinition> {
        match allowlist {
            Some(names) => {
                let allowed: HashSet<_> = names.iter().collect();
                self.tools
                    .values()
                    .filter(|t| allowed.contains(&t.name().to_string()))
                    .map(|t| t.to_definition())
                    .collect()
            }
            None => self.tools.values().map(|t| t.to_definition()).collect(),
        }
    }

    /// Execute a tool by name.
    ///
    /// # Arguments
    /// * `name` - Tool name
    /// * `args` - Arguments as JSON value
    /// * `ctx` - Execution context
    /// * `allowlist` - If Some, the tool must be in this list
    pub async fn execute(
        &self,
        name: &str,
        args: Value,
        ctx: &ToolContext,
        allowlist: Option<&[String]>,
    ) -> Result<ToolResult, AiAssistantError> {
        // Check if tool is allowed
        if let Some(allowed) = allowlist {
            if !allowed.iter().any(|n| n == name) {
                return Err(AiAssistantError::ToolNotAllowed {
                    tool_name: name.to_string(),
                });
            }
        }

        // Get and execute tool
        let tool = self.get(name).ok_or_else(|| AiAssistantError::ToolNotFound {
            tool_name: name.to_string(),
        })?;

        tool.execute(args, ctx).await
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Helper for parsing tool arguments
// ============================================================================

/// Parse tool arguments from JSON value with validation.
pub fn parse_args<T: DeserializeOwned>(args: Value) -> Result<T, AiAssistantError> {
    serde_json::from_value(args).map_err(|e| AiAssistantError::InvalidInput {
        message: format!("Invalid tool arguments: {}", e),
    })
}

/// Parse a date string (YYYY-MM-DD) to NaiveDate.
fn parse_date(date_str: &str) -> Result<NaiveDate, AiAssistantError> {
    NaiveDate::parse_from_str(date_str, "%Y-%m-%d").map_err(|e| AiAssistantError::InvalidInput {
        message: format!("Invalid date format '{}': {}. Expected YYYY-MM-DD.", date_str, e),
    })
}

// ============================================================================
// Real Tool Implementations
// ============================================================================

// ----------------------------------------------------------------------------
// GetAccountsTool
// ----------------------------------------------------------------------------

/// Tool to get list of investment accounts.
pub struct GetAccountsTool;

#[async_trait]
impl Tool for GetAccountsTool {
    fn name(&self) -> &str {
        "get_accounts"
    }

    fn description(&self) -> &str {
        "Get list of investment accounts with their names, types, currencies, and active status."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    async fn execute(&self, _args: Value, ctx: &ToolContext) -> Result<ToolResult, AiAssistantError> {
        let start = Instant::now();
        let accounts = ctx.data_provider.get_accounts().await?;
        let count = accounts.len();
        let duration_ms = start.elapsed().as_millis();

        Ok(ToolResult::ok(accounts)
            .with_count(count)
            .with_duration_ms(duration_ms)
            .with_account_scope("all"))
    }
}

// ----------------------------------------------------------------------------
// GetHoldingsTool
// ----------------------------------------------------------------------------

/// Arguments for get_holdings tool.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetHoldingsArgs {
    /// Account ID to filter by. Use "TOTAL" or omit for all accounts.
    #[serde(default = "default_account_id")]
    account_id: String,
}

fn default_account_id() -> String {
    "TOTAL".to_string()
}

/// Tool to get current portfolio holdings.
pub struct GetHoldingsTool;

#[async_trait]
impl Tool for GetHoldingsTool {
    fn name(&self) -> &str {
        "get_holdings"
    }

    fn description(&self) -> &str {
        "Get current portfolio holdings with quantities, market values, cost basis, and performance. Returns up to 100 holdings."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "accountId": {
                    "type": "string",
                    "description": "Account ID to filter holdings. Use 'TOTAL' for all accounts."
                }
            },
            "required": []
        })
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, AiAssistantError> {
        let start = Instant::now();
        let parsed: GetHoldingsArgs = parse_args(args)?;

        let params = GetHoldingsParams {
            account_id: parsed.account_id.clone(),
            limit: MAX_HOLDINGS,
        };

        let result = ctx.data_provider.get_holdings(params).await?;
        let duration_ms = start.elapsed().as_millis();

        Ok(ToolResult::ok(&result.data)
            .with_truncation(result.original_count, result.returned_count)
            .with_duration_ms(duration_ms)
            .with_account_scope(&result.account_scope))
    }
}

// ----------------------------------------------------------------------------
// SearchActivitiesTool
// ----------------------------------------------------------------------------

/// Arguments for search_activities tool.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchActivitiesArgs {
    /// Account IDs to filter by.
    #[serde(default)]
    account_ids: Option<Vec<String>>,
    /// Activity types to filter by (e.g., "BUY", "SELL", "DIVIDEND").
    #[serde(default)]
    activity_types: Option<Vec<String>>,
    /// Symbol/asset keyword to search.
    #[serde(default)]
    symbol_keyword: Option<String>,
    /// Start date (YYYY-MM-DD). Defaults to 90 days ago.
    #[serde(default)]
    start_date: Option<String>,
    /// End date (YYYY-MM-DD). Defaults to today.
    #[serde(default)]
    end_date: Option<String>,
}

/// Tool to search activities/transactions.
pub struct SearchActivitiesTool;

#[async_trait]
impl Tool for SearchActivitiesTool {
    fn name(&self) -> &str {
        "search_activities"
    }

    fn description(&self) -> &str {
        "Search recent activities/transactions with filters. Default: last 90 days, max 200 rows. Supports filtering by account, activity type, symbol, and date range."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "accountIds": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Filter by account IDs. Omit for all accounts."
                },
                "activityTypes": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Filter by activity types (BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, etc.)."
                },
                "symbolKeyword": {
                    "type": "string",
                    "description": "Filter by symbol/asset keyword."
                },
                "startDate": {
                    "type": "string",
                    "description": "Start date (YYYY-MM-DD). Default: 90 days ago."
                },
                "endDate": {
                    "type": "string",
                    "description": "End date (YYYY-MM-DD). Default: today."
                }
            },
            "required": []
        })
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, AiAssistantError> {
        let start = Instant::now();
        let parsed: SearchActivitiesArgs = parse_args(args)?;

        // Apply default date range: last 90 days
        let today = ctx.now.date_naive();
        let default_start = today - Duration::days(DEFAULT_ACTIVITIES_DAYS);

        let start_date = match &parsed.start_date {
            Some(s) => Some(parse_date(s)?),
            None => Some(default_start),
        };
        let end_date = match &parsed.end_date {
            Some(s) => Some(parse_date(s)?),
            None => Some(today),
        };

        let params = SearchActivitiesParams {
            account_ids: parsed.account_ids.clone(),
            activity_types: parsed.activity_types,
            symbol_keyword: parsed.symbol_keyword,
            start_date,
            end_date,
            limit: MAX_ACTIVITIES_ROWS,
        };

        let account_scope = parsed
            .account_ids
            .as_ref()
            .map(|ids| ids.join(","))
            .unwrap_or_else(|| "all".to_string());

        let result = ctx.data_provider.search_activities(params).await?;
        let duration_ms = start.elapsed().as_millis();

        Ok(ToolResult::ok(&result.data)
            .with_truncation(result.original_count, result.returned_count)
            .with_duration_ms(duration_ms)
            .with_account_scope(&account_scope))
    }
}

// ----------------------------------------------------------------------------
// GetValuationsTool
// ----------------------------------------------------------------------------

/// Arguments for get_valuations tool.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetValuationsArgs {
    /// Account ID. Use "TOTAL" for aggregate across all accounts.
    #[serde(default = "default_account_id")]
    account_id: String,
    /// Start date (YYYY-MM-DD). Default: 1 year ago.
    #[serde(default)]
    start_date: Option<String>,
    /// End date (YYYY-MM-DD). Default: today.
    #[serde(default)]
    end_date: Option<String>,
}

/// Tool to get historical valuations.
pub struct GetValuationsTool;

#[async_trait]
impl Tool for GetValuationsTool {
    fn name(&self) -> &str {
        "get_valuations"
    }

    fn description(&self) -> &str {
        "Get historical portfolio valuations over time. Default: last 1 year, max 400 data points. Returns daily total value, cash, investments, and net contributions."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "accountId": {
                    "type": "string",
                    "description": "Account ID. Use 'TOTAL' for aggregate across all accounts."
                },
                "startDate": {
                    "type": "string",
                    "description": "Start date (YYYY-MM-DD). Default: 1 year ago."
                },
                "endDate": {
                    "type": "string",
                    "description": "End date (YYYY-MM-DD). Default: today."
                }
            },
            "required": []
        })
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, AiAssistantError> {
        let start = Instant::now();
        let parsed: GetValuationsArgs = parse_args(args)?;

        // Apply default date range: last 1 year
        let today = ctx.now.date_naive();
        let default_start = today - Duration::days(DEFAULT_VALUATIONS_DAYS);

        let start_date = match &parsed.start_date {
            Some(s) => Some(parse_date(s)?),
            None => Some(default_start),
        };
        let end_date = match &parsed.end_date {
            Some(s) => Some(parse_date(s)?),
            None => Some(today),
        };

        let params = GetValuationsParams {
            account_id: parsed.account_id.clone(),
            start_date,
            end_date,
            limit: MAX_VALUATIONS_POINTS,
        };

        let result = ctx.data_provider.get_valuations(params).await?;
        let duration_ms = start.elapsed().as_millis();

        Ok(ToolResult::ok(&result.data)
            .with_meta("pointCount", result.returned_count)
            .with_truncation(result.original_count, result.returned_count)
            .with_duration_ms(duration_ms)
            .with_account_scope(&result.account_scope))
    }
}

// ----------------------------------------------------------------------------
// GetPerformanceTool
// ----------------------------------------------------------------------------

/// Arguments for get_performance tool.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetPerformanceArgs {
    /// Account ID. Use "TOTAL" for all accounts.
    #[serde(default = "default_account_id")]
    account_id: String,
    /// Start date (YYYY-MM-DD).
    #[serde(default)]
    start_date: Option<String>,
    /// End date (YYYY-MM-DD). Default: today.
    #[serde(default)]
    end_date: Option<String>,
}

/// Tool to get portfolio performance metrics.
pub struct GetPerformanceTool;

#[async_trait]
impl Tool for GetPerformanceTool {
    fn name(&self) -> &str {
        "get_performance"
    }

    fn description(&self) -> &str {
        "Get portfolio performance metrics including total return percentage, gains, and contributions/withdrawals over a time period."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "accountId": {
                    "type": "string",
                    "description": "Account ID. Use 'TOTAL' for all accounts."
                },
                "startDate": {
                    "type": "string",
                    "description": "Start date (YYYY-MM-DD). Default: inception."
                },
                "endDate": {
                    "type": "string",
                    "description": "End date (YYYY-MM-DD). Default: today."
                }
            },
            "required": []
        })
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, AiAssistantError> {
        let start = Instant::now();
        let parsed: GetPerformanceArgs = parse_args(args)?;

        let start_date = match &parsed.start_date {
            Some(s) => Some(parse_date(s)?),
            None => None,
        };
        let end_date = match &parsed.end_date {
            Some(s) => Some(parse_date(s)?),
            None => Some(ctx.now.date_naive()),
        };

        let params = GetPerformanceParams {
            account_id: parsed.account_id.clone(),
            start_date,
            end_date,
        };

        let result = ctx.data_provider.get_performance(params).await?;
        let duration_ms = start.elapsed().as_millis();

        Ok(ToolResult::ok(result)
            .with_duration_ms(duration_ms)
            .with_account_scope(&parsed.account_id))
    }
}

// ----------------------------------------------------------------------------
// GetDividendsTool (renamed from get_income for clarity)
// ----------------------------------------------------------------------------

/// Arguments for get_dividends tool.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetDividendsArgs {
    /// Account ID filter.
    #[serde(default)]
    account_id: Option<String>,
    /// Start date (YYYY-MM-DD).
    #[serde(default)]
    start_date: Option<String>,
    /// End date (YYYY-MM-DD).
    #[serde(default)]
    end_date: Option<String>,
}

/// Tool to get dividend/income history.
pub struct GetDividendsTool;

#[async_trait]
impl Tool for GetDividendsTool {
    fn name(&self) -> &str {
        "get_dividends"
    }

    fn description(&self) -> &str {
        "Get dividend/income history and summary by symbol. Shows total amounts, payment counts, and last payment dates. Max 50 records."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "accountId": {
                    "type": "string",
                    "description": "Filter by account ID. Omit for all accounts."
                },
                "startDate": {
                    "type": "string",
                    "description": "Start date (YYYY-MM-DD)."
                },
                "endDate": {
                    "type": "string",
                    "description": "End date (YYYY-MM-DD)."
                }
            },
            "required": []
        })
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, AiAssistantError> {
        let start = Instant::now();
        let parsed: GetDividendsArgs = parse_args(args)?;

        let start_date = match &parsed.start_date {
            Some(s) => Some(parse_date(s)?),
            None => None,
        };
        let end_date = match &parsed.end_date {
            Some(s) => Some(parse_date(s)?),
            None => None,
        };

        let params = GetIncomeParams {
            account_id: parsed.account_id.clone(),
            start_date,
            end_date,
            limit: MAX_INCOME_RECORDS,
        };

        let account_scope = parsed.account_id.clone().unwrap_or_else(|| "all".to_string());
        let result = ctx.data_provider.get_income(params).await?;
        let duration_ms = start.elapsed().as_millis();

        Ok(ToolResult::ok(&result.data)
            .with_truncation(result.original_count, result.returned_count)
            .with_duration_ms(duration_ms)
            .with_account_scope(&account_scope))
    }
}

// ----------------------------------------------------------------------------
// GetAssetAllocationTool
// ----------------------------------------------------------------------------

/// Arguments for get_asset_allocation tool.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetAssetAllocationArgs {
    /// Account ID. Use "TOTAL" for all accounts.
    #[serde(default = "default_account_id")]
    account_id: String,
    /// Allocation category: "asset_class", "sector", "geography", "currency".
    #[serde(default = "default_allocation_category")]
    category: String,
}

fn default_allocation_category() -> String {
    "asset_class".to_string()
}

/// Tool to get asset allocation breakdown.
pub struct GetAssetAllocationTool;

#[async_trait]
impl Tool for GetAssetAllocationTool {
    fn name(&self) -> &str {
        "get_asset_allocation"
    }

    fn description(&self) -> &str {
        "Get asset allocation breakdown by category (asset_class, sector, geography, or currency). Shows values and percentages."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "accountId": {
                    "type": "string",
                    "description": "Account ID. Use 'TOTAL' for all accounts."
                },
                "category": {
                    "type": "string",
                    "enum": ["asset_class", "sector", "geography", "currency"],
                    "description": "Allocation category to group by. Default: asset_class."
                }
            },
            "required": []
        })
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, AiAssistantError> {
        let start = Instant::now();
        let parsed: GetAssetAllocationArgs = parse_args(args)?;

        let params = GetAllocationsParams {
            account_id: parsed.account_id.clone(),
            category: parsed.category.clone(),
        };

        let result = ctx.data_provider.get_allocations(params).await?;
        let duration_ms = start.elapsed().as_millis();
        let count = result.len();

        Ok(ToolResult::ok(result)
            .with_count(count)
            .with_duration_ms(duration_ms)
            .with_account_scope(&parsed.account_id)
            .with_meta("category", &parsed.category))
    }
}

// ============================================================================
// Registry Factory
// ============================================================================

/// Create a registry with all portfolio read-only tools.
pub fn create_portfolio_tools_registry() -> ToolRegistry {
    let mut registry = ToolRegistry::new();

    registry.register(Arc::new(GetAccountsTool));
    registry.register(Arc::new(GetHoldingsTool));
    registry.register(Arc::new(SearchActivitiesTool));
    registry.register(Arc::new(GetValuationsTool));
    registry.register(Arc::new(GetPerformanceTool));
    registry.register(Arc::new(GetDividendsTool));
    registry.register(Arc::new(GetAssetAllocationTool));

    registry
}

// ============================================================================
// Placeholder Tools (for backward compatibility during testing)
// ============================================================================

/// A placeholder tool that returns a static message.
/// Used for testing and as a template for real tools.
pub struct PlaceholderTool {
    name: String,
    description: String,
}

impl PlaceholderTool {
    pub fn new(name: &str, description: &str) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
        }
    }
}

#[async_trait]
impl Tool for PlaceholderTool {
    fn name(&self) -> &str {
        &self.name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    async fn execute(&self, _args: Value, _ctx: &ToolContext) -> Result<ToolResult, AiAssistantError> {
        Ok(ToolResult::ok(serde_json::json!({
            "message": format!("Tool '{}' is not yet implemented", self.name)
        })))
    }
}

/// Create a registry with placeholder tools for portfolio operations.
/// DEPRECATED: Use create_portfolio_tools_registry() instead.
pub fn create_placeholder_registry() -> ToolRegistry {
    let mut registry = ToolRegistry::new();

    // Portfolio read tools (v1 - read-only)
    registry.register(Arc::new(PlaceholderTool::new(
        "get_holdings",
        "Get current portfolio holdings with quantities, values, and allocations",
    )));
    registry.register(Arc::new(PlaceholderTool::new(
        "get_accounts",
        "Get list of investment accounts with balances",
    )));
    registry.register(Arc::new(PlaceholderTool::new(
        "get_performance",
        "Get portfolio performance metrics over a time period",
    )));
    registry.register(Arc::new(PlaceholderTool::new(
        "get_transactions",
        "Get recent transactions with filters",
    )));
    registry.register(Arc::new(PlaceholderTool::new(
        "get_dividends",
        "Get dividend income history and projections",
    )));
    registry.register(Arc::new(PlaceholderTool::new(
        "get_asset_allocation",
        "Get asset allocation breakdown by category",
    )));

    registry
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, Utc};
    use crate::portfolio_data::MockPortfolioDataProvider;

    fn create_test_context() -> ToolContext {
        ToolContext {
            base_currency: "USD".to_string(),
            now: Utc::now(),
            locale: None,
            data_provider: Arc::new(MockPortfolioDataProvider::new()),
        }
    }

    #[test]
    fn test_tool_result_creation() {
        let result = ToolResult::ok(serde_json::json!({"value": 100}))
            .with_meta("count", 5)
            .with_truncation(100, 50);

        assert!(result.meta.contains_key("count"));
        assert!(result.meta.contains_key("truncated"));
        assert_eq!(result.meta["truncated"], true);
    }

    #[test]
    fn test_tool_result_metadata() {
        let result = ToolResult::ok(serde_json::json!({"test": true}))
            .with_duration_ms(150)
            .with_account_scope("acc-123")
            .with_count(42);

        assert_eq!(result.meta["durationMs"], 150);
        assert_eq!(result.meta["accountScope"], "acc-123");
        assert_eq!(result.meta["count"], 42);
    }

    #[tokio::test]
    async fn test_tool_registry() {
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(PlaceholderTool::new("test_tool", "A test tool")));

        assert!(registry.get("test_tool").is_some());
        assert!(registry.get("unknown").is_none());

        let names = registry.list_names();
        assert_eq!(names.len(), 1);
        assert!(names.contains(&"test_tool".to_string()));
    }

    #[tokio::test]
    async fn test_tool_allowlist() {
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(PlaceholderTool::new("allowed_tool", "Allowed")));
        registry.register(Arc::new(PlaceholderTool::new("blocked_tool", "Blocked")));

        let ctx = create_test_context();
        let allowlist = vec!["allowed_tool".to_string()];

        // Allowed tool should work
        let result = registry
            .execute("allowed_tool", Value::Null, &ctx, Some(&allowlist))
            .await;
        assert!(result.is_ok());

        // Blocked tool should fail
        let result = registry
            .execute("blocked_tool", Value::Null, &ctx, Some(&allowlist))
            .await;
        assert!(matches!(
            result,
            Err(AiAssistantError::ToolNotAllowed { .. })
        ));
    }

    #[tokio::test]
    async fn test_tool_definitions_with_allowlist() {
        let registry = create_portfolio_tools_registry();

        // Get all definitions
        let all_defs = registry.get_definitions(None);
        assert!(all_defs.len() >= 6); // At least 6 tools

        // Get only specific tools
        let allowlist = vec!["get_holdings".to_string(), "get_accounts".to_string()];
        let filtered_defs = registry.get_definitions(Some(&allowlist));
        assert_eq!(filtered_defs.len(), 2);
    }

    #[tokio::test]
    async fn test_get_accounts_tool() {
        use crate::portfolio_data::AccountDto;

        let provider = MockPortfolioDataProvider::new().with_accounts(vec![
            AccountDto {
                id: "acc-1".to_string(),
                name: "Main Account".to_string(),
                account_type: "SECURITIES".to_string(),
                currency: "USD".to_string(),
                is_active: true,
            },
        ]);

        let ctx = ToolContext {
            base_currency: "USD".to_string(),
            now: Utc::now(),
            locale: None,
            data_provider: Arc::new(provider),
        };

        let tool = GetAccountsTool;
        let result = tool.execute(Value::Null, &ctx).await.unwrap();

        // Check metadata
        assert!(result.meta.contains_key("count"));
        assert!(result.meta.contains_key("durationMs"));
        assert!(result.meta.contains_key("accountScope"));
    }

    #[tokio::test]
    async fn test_get_holdings_tool_with_account_id() {
        use crate::portfolio_data::HoldingDto;

        let provider = MockPortfolioDataProvider::new().with_holdings(vec![
            HoldingDto {
                account_id: "acc-1".to_string(),
                symbol: "AAPL".to_string(),
                name: Some("Apple Inc.".to_string()),
                holding_type: "Security".to_string(),
                quantity: 10.0,
                market_value_base: 1500.0,
                cost_basis_base: Some(1200.0),
                unrealized_gain_pct: Some(25.0),
                day_change_pct: Some(1.5),
                weight: 0.15,
                currency: "USD".to_string(),
            },
        ]);

        let ctx = ToolContext {
            base_currency: "USD".to_string(),
            now: Utc::now(),
            locale: None,
            data_provider: Arc::new(provider),
        };

        let tool = GetHoldingsTool;
        let args = serde_json::json!({ "accountId": "acc-1" });
        let result = tool.execute(args, &ctx).await.unwrap();

        assert!(result.meta.contains_key("accountScope"));
        assert_eq!(result.meta["accountScope"], "acc-1");
    }

    #[tokio::test]
    async fn test_search_activities_default_date_range() {
        let ctx = create_test_context();

        let tool = SearchActivitiesTool;
        let result = tool.execute(serde_json::json!({}), &ctx).await.unwrap();

        // Should succeed with empty args (uses defaults)
        assert!(result.meta.contains_key("durationMs"));
        assert!(result.meta.contains_key("accountScope"));
        assert_eq!(result.meta["accountScope"], "all");
    }

    #[test]
    fn test_parse_date_valid() {
        let date = parse_date("2024-01-15").unwrap();
        assert_eq!(date.year(), 2024);
        assert_eq!(date.month(), 1);
        assert_eq!(date.day(), 15);
    }

    #[test]
    fn test_parse_date_invalid() {
        let result = parse_date("invalid");
        assert!(result.is_err());

        let result = parse_date("01-15-2024"); // Wrong format
        assert!(result.is_err());
    }

    #[test]
    fn test_default_guardrails() {
        assert_eq!(DEFAULT_ACTIVITIES_DAYS, 90);
        assert_eq!(MAX_ACTIVITIES_ROWS, 200);
        assert_eq!(DEFAULT_VALUATIONS_DAYS, 365);
        assert_eq!(MAX_VALUATIONS_POINTS, 400);
    }
}
