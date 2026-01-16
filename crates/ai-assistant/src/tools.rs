//! Tool registry and execution for AI assistant.
//!
//! This module provides:
//! - Tool trait and registry for available tools
//! - Per-thread tool allowlist support
//! - Input validation and output shaping
//! - Result DTOs with `{ data, meta }` envelope

use async_trait::async_trait;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::providers::ToolDefinition;
use crate::types::{AiAssistantError, ToolResultData};

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

// ============================================================================
// Placeholder Tools (to be replaced with real implementations)
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
///
/// These will be replaced with real implementations that access
/// the portfolio data layer.
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

    #[test]
    fn test_tool_result_creation() {
        let result = ToolResult::ok(serde_json::json!({"value": 100}))
            .with_meta("count", 5)
            .with_truncation(100, 50);

        assert!(result.meta.contains_key("count"));
        assert!(result.meta.contains_key("truncated"));
        assert_eq!(result.meta["truncated"], true);
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

        let ctx = ToolContext {
            base_currency: "USD".to_string(),
            now: chrono::Utc::now(),
            locale: None,
        };

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
        let registry = create_placeholder_registry();

        // Get all definitions
        let all_defs = registry.get_definitions(None);
        assert!(all_defs.len() > 1);

        // Get only specific tools
        let allowlist = vec!["get_holdings".to_string(), "get_accounts".to_string()];
        let filtered_defs = registry.get_definitions(Some(&allowlist));
        assert_eq!(filtered_defs.len(), 2);
    }
}
