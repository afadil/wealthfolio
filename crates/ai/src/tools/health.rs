//! Health status tool - expose portfolio health issues to the AI assistant.

use rig::{completion::ToolDefinition, tool::Tool};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::env::AiEnvironment;
use crate::error::AiError;

// ============================================================================
// Tool Arguments and Output
// ============================================================================

/// Arguments for the get_health_status tool (no required args).
#[derive(Debug, Default, Deserialize)]
pub struct GetHealthStatusArgs {}

/// DTO for a single health issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthIssueDto {
    pub id: String,
    pub severity: String,
    pub category: String,
    pub title: String,
    pub message: String,
    pub affected_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affected_mv_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

/// Output envelope for get_health_status tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetHealthStatusOutput {
    pub overall_severity: String,
    pub issues: Vec<HealthIssueDto>,
    pub total_count: usize,
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to get the current portfolio health status.
pub struct GetHealthStatusTool<E: AiEnvironment> {
    env: Arc<E>,
}

impl<E: AiEnvironment> GetHealthStatusTool<E> {
    pub fn new(env: Arc<E>) -> Self {
        Self { env }
    }
}

impl<E: AiEnvironment> Clone for GetHealthStatusTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
        }
    }
}

impl<E: AiEnvironment + 'static> Tool for GetHealthStatusTool<E> {
    const NAME: &'static str = "get_health_status";

    type Error = AiError;
    type Args = GetHealthStatusArgs;
    type Output = GetHealthStatusOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Get the current health status of the portfolio data. Returns detected issues (missing prices, stale FX rates, negative balances, unclassified assets, etc.) with severity levels and details. Use this to help the user diagnose and fix data problems.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        }
    }

    async fn call(&self, _args: Self::Args) -> Result<Self::Output, Self::Error> {
        let health_service = self.env.health_service();

        let status = health_service.get_cached_status().await.ok_or_else(|| {
            AiError::ToolExecutionFailed(
                "Health status not available yet. Please wait a moment and try again.".to_string(),
            )
        })?;

        let issues = status
            .issues
            .iter()
            .map(|issue| HealthIssueDto {
                id: issue.id.clone(),
                severity: issue.severity.to_string(),
                category: issue.category.to_string(),
                title: issue.title.clone(),
                message: issue.message.clone(),
                affected_count: issue.affected_count,
                affected_mv_pct: issue.affected_mv_pct,
                details: issue.details.clone(),
            })
            .collect::<Vec<_>>();

        let total_count = issues.len();

        Ok(GetHealthStatusOutput {
            overall_severity: status.overall_severity.to_string(),
            issues,
            total_count,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_get_health_status_tool() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetHealthStatusTool::new(env);

        let result = tool.call(GetHealthStatusArgs {}).await;
        // Mock returns None for cached status, so expect an error
        assert!(result.is_err());
    }
}
