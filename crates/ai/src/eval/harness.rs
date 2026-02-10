//! Evaluation harness for running golden scenarios.

use std::collections::HashMap;

use super::scenarios::GoldenScenario;
use crate::tools::{MAX_ACTIVITIES_ROWS, MAX_HOLDINGS, MAX_VALUATIONS_POINTS};
use crate::types::AiStreamEvent;

/// Result of running a golden scenario.
#[derive(Debug)]
pub struct EvalResult {
    /// Scenario name.
    pub scenario_name: String,
    /// Whether all assertions passed.
    pub passed: bool,
    /// List of failures (empty if passed).
    pub failures: Vec<String>,
    /// Tool calls observed.
    pub tool_calls_observed: Vec<String>,
    /// Tool results observed.
    pub tool_results_observed: Vec<ToolResultSummary>,
    /// Stream ended with Done event.
    pub ended_with_done: bool,
    /// Final text content.
    pub final_text: Option<String>,
}

/// Summary of a tool result for evaluation.
#[derive(Debug)]
pub struct ToolResultSummary {
    pub tool_call_id: String,
    pub success: bool,
    pub row_count: Option<usize>,
    pub truncated: Option<bool>,
    pub duration_ms: Option<u128>,
}

/// Assert stream event ordering is valid.
pub fn assert_valid_event_ordering(events: &[AiStreamEvent]) -> Result<(), String> {
    if events.is_empty() {
        return Err("Empty event stream".to_string());
    }

    // First event must be System
    if !matches!(events.first(), Some(AiStreamEvent::System { .. })) {
        return Err("First event must be System".to_string());
    }

    // Last event must be Done or Error
    match events.last() {
        Some(AiStreamEvent::Done { .. }) | Some(AiStreamEvent::Error { .. }) => {}
        _ => return Err("Last event must be Done or Error".to_string()),
    }

    // Tool results must follow tool calls
    let mut pending_tool_calls: Vec<String> = Vec::new();
    for event in events {
        match event {
            AiStreamEvent::ToolCall { tool_call, .. } => {
                pending_tool_calls.push(tool_call.id.clone());
            }
            AiStreamEvent::ToolResult { result, .. } => {
                if !pending_tool_calls.contains(&result.tool_call_id) {
                    return Err(format!(
                        "ToolResult for {} without matching ToolCall",
                        result.tool_call_id
                    ));
                }
                pending_tool_calls.retain(|id| id != &result.tool_call_id);
            }
            _ => {}
        }
    }

    Ok(())
}

/// Assert tool outputs respect guardrails.
pub fn assert_guardrails_respected(results: &[ToolResultSummary]) -> Result<(), String> {
    let max_allowed = MAX_ACTIVITIES_ROWS
        .max(MAX_HOLDINGS)
        .max(MAX_VALUATIONS_POINTS);

    for result in results {
        if let Some(count) = result.row_count {
            if count > max_allowed {
                return Err(format!(
                    "Tool result exceeded guardrail limit: {} rows (max {})",
                    count, max_allowed
                ));
            }
        }
    }

    Ok(())
}

/// Validate eval result matches expected scenario.
pub fn validate_eval_result(scenario: &GoldenScenario, result: &EvalResult) -> Vec<String> {
    let mut failures = Vec::new();

    // Check tool sequence
    let expected_tools: Vec<&str> = scenario
        .expected_tool_sequence
        .iter()
        .map(|tc| tc.tool_name)
        .collect();

    let observed_tools: Vec<&str> = result
        .tool_calls_observed
        .iter()
        .map(|s| s.as_str())
        .collect();

    if expected_tools != observed_tools {
        failures.push(format!(
            "Tool sequence mismatch. Expected: {:?}, Got: {:?}",
            expected_tools, observed_tools
        ));
    }

    // Check all tool results succeeded
    for tr in &result.tool_results_observed {
        if !tr.success {
            failures.push(format!("Tool call {} failed", tr.tool_call_id));
        }
    }

    // Check expected text content
    if let Some(ref text) = result.final_text {
        for expected in &scenario.expected_text_contains {
            if !text.contains(expected) {
                failures.push(format!("Final text missing expected: '{}'", expected));
            }
        }
    }

    // Check stream ended properly
    if !result.ended_with_done {
        failures.push("Stream did not end with Done event".to_string());
    }

    failures
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ChatMessage, ChatMessageContent, ToolCall, ToolResultData};

    /// Helper to create a ChatMessage for testing
    fn test_assistant_message(thread_id: &str, text: &str) -> ChatMessage {
        let mut msg = ChatMessage::assistant(thread_id);
        msg.content = ChatMessageContent::text(text);
        msg
    }

    #[test]
    fn test_valid_event_ordering_minimal() {
        let events = vec![
            AiStreamEvent::system("t1", "r1", "m1"),
            AiStreamEvent::text_delta("t1", "r1", "m1", "Hello"),
            AiStreamEvent::done("t1", "r1", test_assistant_message("t1", "Hello"), None),
        ];

        let result = assert_valid_event_ordering(&events);
        assert!(result.is_ok());
    }

    #[test]
    fn test_valid_event_ordering_with_tools() {
        let tool_call = ToolCall::new("get_holdings", serde_json::json!({}));
        let tool_call_id = tool_call.id.clone();

        let events = vec![
            AiStreamEvent::system("t1", "r1", "m1"),
            AiStreamEvent::tool_call("t1", "r1", "m1", tool_call),
            AiStreamEvent::tool_result(
                "t1",
                "r1",
                "m1",
                ToolResultData {
                    tool_call_id,
                    success: true,
                    data: serde_json::json!({}),
                    meta: HashMap::new(),
                    error: None,
                },
            ),
            AiStreamEvent::text_delta("t1", "r1", "m1", "Analysis"),
            AiStreamEvent::done("t1", "r1", test_assistant_message("t1", "Analysis"), None),
        ];

        let result = assert_valid_event_ordering(&events);
        assert!(result.is_ok());
    }

    #[test]
    fn test_invalid_event_ordering_no_system() {
        let events = vec![
            AiStreamEvent::text_delta("t1", "r1", "m1", "Hello"),
            AiStreamEvent::done("t1", "r1", test_assistant_message("t1", "Hello"), None),
        ];

        let result = assert_valid_event_ordering(&events);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("System"));
    }

    #[test]
    fn test_guardrails_respected() {
        let results = vec![
            ToolResultSummary {
                tool_call_id: "tc1".to_string(),
                success: true,
                row_count: Some(50),
                truncated: Some(false),
                duration_ms: Some(15),
            },
            ToolResultSummary {
                tool_call_id: "tc2".to_string(),
                success: true,
                row_count: Some(100),
                truncated: Some(false),
                duration_ms: Some(25),
            },
        ];

        let result = assert_guardrails_respected(&results);
        assert!(result.is_ok());
    }

    #[test]
    fn test_guardrails_violation() {
        let results = vec![ToolResultSummary {
            tool_call_id: "tc1".to_string(),
            success: true,
            row_count: Some(1000), // Exceeds all limits
            truncated: Some(false),
            duration_ms: Some(15),
        }];

        let result = assert_guardrails_respected(&results);
        assert!(result.is_err());
    }
}
