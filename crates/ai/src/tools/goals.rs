//! Goals tool - fetch investment goals using rig-core Tool trait.

use rig::{completion::ToolDefinition, tool::Tool};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::constants::MAX_GOALS;
use crate::env::AiEnvironment;
use crate::error::AiError;

// ============================================================================
// Tool Arguments and Output
// ============================================================================

/// Arguments for the get_goals tool (no required args).
#[derive(Debug, Default, Deserialize)]
pub struct GetGoalsArgs {}

/// DTO for goal data in tool output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalDto {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: f64,
    pub current_amount: f64,
    pub progress_percent: f64,
    pub deadline: Option<String>,
    pub is_achieved: bool,
}

/// Output envelope for goals tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetGoalsOutput {
    pub goals: Vec<GoalDto>,
    pub count: usize,
    pub total_target: f64,
    pub total_current: f64,
    pub achieved_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_count: Option<usize>,
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to get investment goals with progress.
pub struct GetGoalsTool<E: AiEnvironment> {
    env: Arc<E>,
}

impl<E: AiEnvironment> GetGoalsTool<E> {
    pub fn new(env: Arc<E>) -> Self {
        Self { env }
    }
}

impl<E: AiEnvironment> Clone for GetGoalsTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
        }
    }
}

impl<E: AiEnvironment + 'static> Tool for GetGoalsTool<E> {
    const NAME: &'static str = "get_goals";

    type Error = AiError;
    type Args = GetGoalsArgs;
    type Output = GetGoalsOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Get investment goals with current progress. Returns goal title, target amount, current amount, progress percentage, and deadline for each goal.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        }
    }

    async fn call(&self, _args: Self::Args) -> Result<Self::Output, Self::Error> {
        // Fetch goals
        let goals = self
            .env
            .goal_service()
            .get_goals()
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        let original_count = goals.len();

        // Convert to DTOs using cached summary fields
        let goals_dto: Vec<GoalDto> = goals
            .into_iter()
            .take(MAX_GOALS)
            .map(|g| {
                let target = g.target_amount_cached.or(g.target_amount).unwrap_or(0.0);
                let current_amount = g.current_value_cached.unwrap_or(0.0);
                let progress_percent = g.progress_cached.unwrap_or(0.0) * 100.0;

                GoalDto {
                    id: g.id,
                    title: g.title,
                    description: g.description,
                    target_amount: target,
                    current_amount,
                    progress_percent,
                    deadline: g.target_date,
                    is_achieved: g.status_lifecycle == "achieved",
                }
            })
            .collect();

        let returned_count = goals_dto.len();
        let truncated = original_count > returned_count;

        // Calculate totals
        let total_target: f64 = goals_dto.iter().map(|g| g.target_amount).sum();
        let total_current: f64 = goals_dto.iter().map(|g| g.current_amount).sum();
        let achieved_count = goals_dto.iter().filter(|g| g.is_achieved).count();

        Ok(GetGoalsOutput {
            goals: goals_dto,
            count: returned_count,
            total_target,
            total_current,
            achieved_count,
            truncated: if truncated { Some(true) } else { None },
            original_count: if truncated {
                Some(original_count)
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
    async fn test_get_goals_tool() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetGoalsTool::new(env);

        let result = tool.call(GetGoalsArgs {}).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.count, output.goals.len());
    }
}
