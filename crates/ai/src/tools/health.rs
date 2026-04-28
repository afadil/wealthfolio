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
    /// One of the `Severity` values (INFO | WARNING | ERROR | CRITICAL) or the
    /// synthetic string `"NOT_COMPUTED"` when no cached status exists. Not a
    /// real `Severity` variant — do not deserialize back into the enum.
    pub overall_severity: String,
    pub issues: Vec<HealthIssueDto>,
    pub is_stale: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
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
            description: "Read the cached portfolio health status produced by the Health Center. \
                `overallSeverity` is one of INFO | WARNING | ERROR | CRITICAL, or NOT_COMPUTED when \
                no check has run yet in this session (in that case `issues` is empty and `note` \
                tells the user how to populate it). \
                Each issue has `severity` (same scale), `category` (PRICE_STALENESS | FX_INTEGRITY | \
                CLASSIFICATION | DATA_CONSISTENCY | ACCOUNT_CONFIGURATION | SETTINGS_CONFIGURATION), \
                `title`, `message`, `affectedCount`, optional `affectedMvPct` (share of portfolio \
                market value impacted, as a fraction 0.0-1.0), and optional `details`. \
                `isStale` is true when the cache is older than 5 minutes. \
                Use this to diagnose data problems (missing prices, stale FX rates, negative \
                balances, unclassified assets) and guide the user to fixes in the Health Center."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        }
    }

    async fn call(&self, _args: Self::Args) -> Result<Self::Output, Self::Error> {
        let Some(status) = self.env.health_service().get_cached_status().await else {
            return Ok(GetHealthStatusOutput {
                overall_severity: "NOT_COMPUTED".to_string(),
                issues: Vec::new(),
                is_stale: false,
                note: Some(
                    "No health check has run yet in this session. Ask the user to open \
                     the Health Center to run a check."
                        .to_string(),
                ),
            });
        };

        let issues = status
            .issues
            .iter()
            .map(|issue| HealthIssueDto {
                id: issue.id.clone(),
                severity: issue.severity.as_str().to_string(),
                category: issue.category.as_str().to_string(),
                title: issue.title.clone(),
                message: issue.message.clone(),
                affected_count: issue.affected_count,
                affected_mv_pct: issue.affected_mv_pct,
                details: issue.details.clone(),
            })
            .collect::<Vec<_>>();

        Ok(GetHealthStatusOutput {
            overall_severity: status.overall_severity.as_str().to_string(),
            issues,
            is_stale: status.is_stale,
            note: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::{MockEnvironment, MockHealthService};
    use wealthfolio_core::health::{HealthCategory, HealthIssue, HealthStatus, Severity};

    fn env_with_status(status: Option<HealthStatus>) -> MockEnvironment {
        let mut env = MockEnvironment::new();
        env.health_service = Arc::new(MockHealthService {
            cached_status: status,
        });
        env
    }

    fn make_issue(id: &str, severity: Severity, category: HealthCategory) -> HealthIssue {
        HealthIssue::builder()
            .id(id)
            .severity(severity)
            .category(category)
            .title("t")
            .message("m")
            .data_hash("h")
            .build()
    }

    #[tokio::test]
    async fn no_cache_returns_not_computed_payload() {
        let tool = GetHealthStatusTool::new(Arc::new(env_with_status(None)));

        let out = tool.call(GetHealthStatusArgs {}).await.unwrap();

        assert_eq!(out.overall_severity, "NOT_COMPUTED");
        assert!(out.issues.is_empty());
        assert!(!out.is_stale);
        assert!(out.note.is_some());
    }

    #[tokio::test]
    async fn single_issue_maps_fields_and_formats() {
        let issue = HealthIssue::builder()
            .id("price_stale:AAPL")
            .severity(Severity::Warning)
            .category(HealthCategory::PriceStaleness)
            .title("Outdated prices")
            .message("AAPL has stale price data.")
            .affected_count(1)
            .affected_mv_pct(0.05)
            .details("Last updated 10 days ago.")
            .data_hash("abc123")
            .build();

        let status = HealthStatus::from_issues(vec![issue]);
        let tool = GetHealthStatusTool::new(Arc::new(env_with_status(Some(status))));

        let out = tool.call(GetHealthStatusArgs {}).await.unwrap();

        assert_eq!(out.overall_severity, "WARNING");
        assert_eq!(out.issues.len(), 1);
        let dto = &out.issues[0];
        assert_eq!(dto.id, "price_stale:AAPL");
        assert_eq!(dto.severity, "WARNING");
        assert_eq!(dto.category, "PRICE_STALENESS");
        assert_eq!(dto.title, "Outdated prices");
        assert_eq!(dto.affected_count, 1);
        assert_eq!(dto.affected_mv_pct, Some(0.05));
        assert_eq!(dto.details.as_deref(), Some("Last updated 10 days ago."));
    }

    #[tokio::test]
    async fn overall_severity_rolls_up_to_highest() {
        let status = HealthStatus::from_issues(vec![
            make_issue("info:x", Severity::Info, HealthCategory::Classification),
            make_issue("warn:y", Severity::Warning, HealthCategory::FxIntegrity),
            make_issue(
                "crit:z",
                Severity::Critical,
                HealthCategory::DataConsistency,
            ),
        ]);
        let tool = GetHealthStatusTool::new(Arc::new(env_with_status(Some(status))));

        let out = tool.call(GetHealthStatusArgs {}).await.unwrap();

        assert_eq!(out.overall_severity, "CRITICAL");
        assert_eq!(out.issues.len(), 3);
    }
}
