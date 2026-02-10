//! Golden scenarios for behavioral testing.

/// A golden scenario for behavioral testing.
#[derive(Debug, Clone)]
pub struct GoldenScenario {
    /// Scenario name for test output.
    pub name: &'static str,
    /// User query to send.
    pub user_query: &'static str,
    /// Expected tool calls in order (tool_name, expected_args_contains).
    pub expected_tool_sequence: Vec<ExpectedToolCall>,
    /// Expected final text to contain (optional substring checks).
    pub expected_text_contains: Vec<&'static str>,
    /// Whether the scenario uses multiple tool rounds.
    pub multi_round: bool,
}

/// Expected tool call in a scenario.
#[derive(Debug, Clone)]
pub struct ExpectedToolCall {
    /// Tool name that should be called.
    pub tool_name: &'static str,
    /// Keys that should appear in the args (optional validation).
    pub expected_arg_keys: Vec<&'static str>,
}

impl ExpectedToolCall {
    pub fn new(tool_name: &'static str) -> Self {
        Self {
            tool_name,
            expected_arg_keys: vec![],
        }
    }

    pub fn with_args(tool_name: &'static str, keys: Vec<&'static str>) -> Self {
        Self {
            tool_name,
            expected_arg_keys: keys,
        }
    }
}

/// Get all predefined golden scenarios.
pub fn get_golden_scenarios() -> Vec<GoldenScenario> {
    vec![
        // Scenario 1: Holdings overview
        GoldenScenario {
            name: "holdings_overview",
            user_query: "Show me my current holdings",
            expected_tool_sequence: vec![ExpectedToolCall::new("get_holdings")],
            expected_text_contains: vec![],
            multi_round: false,
        },
        // Scenario 2: Recent activity search
        GoldenScenario {
            name: "recent_activity",
            user_query: "What trades did I make recently?",
            expected_tool_sequence: vec![ExpectedToolCall::new("search_activities")],
            expected_text_contains: vec![],
            multi_round: false,
        },
        // Scenario 3: Account list
        GoldenScenario {
            name: "account_list",
            user_query: "What accounts do I have?",
            expected_tool_sequence: vec![ExpectedToolCall::new("get_accounts")],
            expected_text_contains: vec![],
            multi_round: false,
        },
        // Scenario 4: Goals progress
        GoldenScenario {
            name: "goals_progress",
            user_query: "How am I doing on my investment goals?",
            expected_tool_sequence: vec![ExpectedToolCall::new("get_goals")],
            expected_text_contains: vec![],
            multi_round: false,
        },
        // Scenario 5: Holdings for specific account
        GoldenScenario {
            name: "holdings_specific_account",
            user_query: "Show me holdings in my retirement account",
            expected_tool_sequence: vec![ExpectedToolCall::with_args(
                "get_holdings",
                vec!["accountId"],
            )],
            expected_text_contains: vec![],
            multi_round: false,
        },
        // Scenario 6: Income summary
        GoldenScenario {
            name: "income_summary",
            user_query: "Show me my income summary",
            expected_tool_sequence: vec![ExpectedToolCall::new("get_income")],
            expected_text_contains: vec![],
            multi_round: false,
        },
    ]
}
