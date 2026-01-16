//! AI Chat Repository trait and domain types.
//!
//! Defines the interface for persisting chat threads and messages.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::Result;

// ============================================================================
// Constants
// ============================================================================

/// Current schema version for message content.
pub const AI_CONTENT_SCHEMA_VERSION: u32 = 1;

/// Current schema version for thread config snapshot.
pub const AI_CONFIG_SCHEMA_VERSION: u32 = 1;

/// Default read-only tools allowed in v1.
pub const DEFAULT_TOOLS_ALLOWLIST: &[&str] = &[
    "get_holdings",
    "get_accounts",
    "get_performance",
    "search_activities",
    "get_valuations",
    "get_dividends",
    "get_asset_allocation",
];

/// Maximum size in bytes for persisted message content (256KB).
pub const AI_MAX_CONTENT_SIZE_BYTES: usize = 256 * 1024;

// ============================================================================
// Thread Configuration
// ============================================================================

/// Per-thread agent configuration snapshot.
///
/// Captures the model, prompt template, and tool allowlist at thread creation.
/// This enables deterministic replay and debugging of conversations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiThreadConfig {
    /// Schema version for backward compatibility.
    pub schema_version: u32,

    /// Provider ID (e.g., "openai", "anthropic").
    pub provider_id: String,

    /// Model ID (e.g., "gpt-4o", "claude-3-sonnet").
    pub model_id: String,

    /// Prompt template ID.
    pub prompt_template_id: String,

    /// Prompt template version.
    pub prompt_version: String,

    /// Locale for formatting and language.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,

    /// Detail level for responses.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail_level: Option<String>,

    /// Allowlist of tool names that can be used in this thread.
    /// If None, uses default read-only tools.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools_allowlist: Option<Vec<String>>,
}

impl AiThreadConfig {
    /// Create a new config with default settings.
    pub fn new(provider_id: &str, model_id: &str, template_id: &str, template_version: &str) -> Self {
        Self {
            schema_version: AI_CONFIG_SCHEMA_VERSION,
            provider_id: provider_id.to_string(),
            model_id: model_id.to_string(),
            prompt_template_id: template_id.to_string(),
            prompt_version: template_version.to_string(),
            locale: None,
            detail_level: None,
            tools_allowlist: None,
        }
    }

    /// Create config with default read-only tools allowlist.
    pub fn with_default_tools(mut self) -> Self {
        self.tools_allowlist = Some(DEFAULT_TOOLS_ALLOWLIST.iter().map(|s| s.to_string()).collect());
        self
    }

    /// Get the effective tools allowlist.
    pub fn get_tools_allowlist(&self) -> Vec<String> {
        self.tools_allowlist
            .clone()
            .unwrap_or_else(|| DEFAULT_TOOLS_ALLOWLIST.iter().map(|s| s.to_string()).collect())
    }

    /// Serialize to JSON.
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string(self).map_err(crate::Error::from)
    }

    /// Deserialize from JSON.
    pub fn from_json(json: &str) -> Result<Self> {
        serde_json::from_str(json).map_err(crate::Error::from)
    }
}

impl Default for AiThreadConfig {
    fn default() -> Self {
        Self {
            schema_version: AI_CONFIG_SCHEMA_VERSION,
            provider_id: String::new(),
            model_id: String::new(),
            prompt_template_id: "wealthfolio-assistant-v1".to_string(),
            prompt_version: "1.0.0".to_string(),
            locale: None,
            detail_level: None,
            tools_allowlist: Some(DEFAULT_TOOLS_ALLOWLIST.iter().map(|s| s.to_string()).collect()),
        }
    }
}

// ============================================================================
// Domain Types
// ============================================================================

/// A chat thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiThread {
    pub id: String,
    pub title: Option<String>,
    /// Whether the thread is pinned to the top of the list.
    #[serde(default)]
    pub is_pinned: bool,
    pub tags: Vec<String>,
    /// Per-thread agent configuration snapshot.
    /// Captures model, prompt template, and tool allowlist at creation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<AiThreadConfig>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl AiThread {
    /// Create a new thread with generated UUID.
    pub fn new() -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title: None,
            is_pinned: false,
            tags: Vec::new(),
            config: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Create a new thread with config snapshot.
    pub fn with_config(config: AiThreadConfig) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title: None,
            is_pinned: false,
            tags: Vec::new(),
            config: Some(config),
            created_at: now,
            updated_at: now,
        }
    }

    /// Create a thread with specific ID (for reconstruction from DB).
    pub fn with_id(
        id: String,
        title: Option<String>,
        is_pinned: bool,
        config: Option<AiThreadConfig>,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    ) -> Self {
        Self {
            id,
            title,
            is_pinned,
            tags: Vec::new(),
            config,
            created_at,
            updated_at,
        }
    }

    /// Get the effective tools allowlist from config.
    pub fn get_tools_allowlist(&self) -> Vec<String> {
        self.config
            .as_ref()
            .map(|c| c.get_tools_allowlist())
            .unwrap_or_else(|| DEFAULT_TOOLS_ALLOWLIST.iter().map(|s| s.to_string()).collect())
    }
}

impl Default for AiThread {
    fn default() -> Self {
        Self::new()
    }
}

/// Message role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiMessageRole {
    User,
    Assistant,
    System,
    Tool,
}

impl std::fmt::Display for AiMessageRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiMessageRole::User => write!(f, "user"),
            AiMessageRole::Assistant => write!(f, "assistant"),
            AiMessageRole::System => write!(f, "system"),
            AiMessageRole::Tool => write!(f, "tool"),
        }
    }
}

impl std::str::FromStr for AiMessageRole {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "user" => Ok(AiMessageRole::User),
            "assistant" => Ok(AiMessageRole::Assistant),
            "system" => Ok(AiMessageRole::System),
            "tool" => Ok(AiMessageRole::Tool),
            _ => Err(format!("Unknown role: {}", s)),
        }
    }
}

/// A chat message with structured content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMessage {
    pub id: String,
    pub thread_id: String,
    pub role: AiMessageRole,
    pub content: AiMessageContent,
    pub created_at: DateTime<Utc>,
}

impl AiMessage {
    /// Create a new user message with text content.
    pub fn user(thread_id: &str, text: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            thread_id: thread_id.to_string(),
            role: AiMessageRole::User,
            content: AiMessageContent::text(text),
            created_at: Utc::now(),
        }
    }

    /// Create a new assistant message (empty, to be filled during streaming).
    pub fn assistant(thread_id: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            thread_id: thread_id.to_string(),
            role: AiMessageRole::Assistant,
            content: AiMessageContent::new(vec![]),
            created_at: Utc::now(),
        }
    }

    /// Create a new assistant message with specific ID.
    pub fn assistant_with_id(id: &str, thread_id: &str) -> Self {
        Self {
            id: id.to_string(),
            thread_id: thread_id.to_string(),
            role: AiMessageRole::Assistant,
            content: AiMessageContent::new(vec![]),
            created_at: Utc::now(),
        }
    }

    /// Get the plain text content.
    pub fn get_text(&self) -> String {
        self.content.get_text_content()
    }
}

/// Structured message content with versioning.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMessageContent {
    pub schema_version: u32,
    pub parts: Vec<AiMessagePart>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub truncated: bool,
}

impl AiMessageContent {
    /// Create new content with default schema version.
    pub fn new(parts: Vec<AiMessagePart>) -> Self {
        Self {
            schema_version: AI_CONTENT_SCHEMA_VERSION,
            parts,
            truncated: false,
        }
    }

    /// Create content for simple text.
    pub fn text(content: &str) -> Self {
        Self::new(vec![AiMessagePart::Text {
            content: content.to_string(),
        }])
    }

    /// Get concatenated text from all text parts.
    pub fn get_text_content(&self) -> String {
        self.parts
            .iter()
            .filter_map(|p| match p {
                AiMessagePart::Text { content } => Some(content.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }

    /// Serialize to JSON.
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string(self).map_err(crate::Error::from)
    }

    /// Deserialize from JSON.
    pub fn from_json(json: &str) -> Result<Self> {
        serde_json::from_str(json).map_err(crate::Error::from)
    }
}

/// Individual message parts representing the agent loop.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiMessagePart {
    /// System metadata.
    #[serde(rename_all = "camelCase")]
    System { content: String },

    /// Text content.
    #[serde(rename_all = "camelCase")]
    Text { content: String },

    /// Reasoning/thinking content (optional).
    #[serde(rename_all = "camelCase")]
    Reasoning { content: String },

    /// Tool call.
    #[serde(rename_all = "camelCase")]
    ToolCall {
        tool_call_id: String,
        name: String,
        arguments: serde_json::Value,
    },

    /// Tool result.
    #[serde(rename_all = "camelCase")]
    ToolResult {
        tool_call_id: String,
        success: bool,
        data: serde_json::Value,
        #[serde(default, skip_serializing_if = "HashMap::is_empty")]
        meta: HashMap<String, serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },

    /// Error.
    #[serde(rename_all = "camelCase")]
    Error { code: String, message: String },
}

// ============================================================================
// Repository Trait
// ============================================================================

/// Repository for AI chat persistence.
#[async_trait]
pub trait AiChatRepositoryTrait: Send + Sync {
    // Thread operations
    async fn create_thread(&self, thread: AiThread) -> Result<AiThread>;
    fn get_thread(&self, thread_id: &str) -> Result<Option<AiThread>>;
    fn list_threads(&self, limit: i64, offset: i64) -> Result<Vec<AiThread>>;
    async fn update_thread(&self, thread: AiThread) -> Result<AiThread>;
    async fn delete_thread(&self, thread_id: &str) -> Result<()>;

    // Message operations
    async fn create_message(&self, message: AiMessage) -> Result<AiMessage>;
    fn get_message(&self, message_id: &str) -> Result<Option<AiMessage>>;
    fn get_messages_by_thread(&self, thread_id: &str) -> Result<Vec<AiMessage>>;
    async fn update_message(&self, message: AiMessage) -> Result<AiMessage>;

    // Tag operations
    async fn add_tag(&self, thread_id: &str, tag: &str) -> Result<()>;
    async fn remove_tag(&self, thread_id: &str, tag: &str) -> Result<()>;
    fn get_tags(&self, thread_id: &str) -> Result<Vec<String>>;
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thread_creation() {
        let thread = AiThread::new();
        assert!(!thread.id.is_empty());
        assert!(thread.title.is_none());
    }

    #[test]
    fn test_message_content_serialization() {
        let content = AiMessageContent::new(vec![
            AiMessagePart::Text {
                content: "Hello".to_string(),
            },
            AiMessagePart::ToolCall {
                tool_call_id: "tc-1".to_string(),
                name: "test".to_string(),
                arguments: serde_json::json!({}),
            },
        ]);

        let json = content.to_json().unwrap();
        assert!(json.contains("schemaVersion"));
        assert!(json.contains("text"));
        assert!(json.contains("toolCall"));
    }

    #[test]
    fn test_role_parsing() {
        assert_eq!("user".parse::<AiMessageRole>().unwrap(), AiMessageRole::User);
        assert_eq!("assistant".parse::<AiMessageRole>().unwrap(), AiMessageRole::Assistant);
        assert_eq!("system".parse::<AiMessageRole>().unwrap(), AiMessageRole::System);
        assert_eq!("tool".parse::<AiMessageRole>().unwrap(), AiMessageRole::Tool);
    }

    #[test]
    fn test_thread_config_creation() {
        let config = AiThreadConfig::new("openai", "gpt-4o", "wealthfolio-assistant-v1", "1.0.0");
        assert_eq!(config.provider_id, "openai");
        assert_eq!(config.model_id, "gpt-4o");
        assert_eq!(config.prompt_template_id, "wealthfolio-assistant-v1");
        assert_eq!(config.prompt_version, "1.0.0");
        assert!(config.tools_allowlist.is_none());
    }

    #[test]
    fn test_thread_config_with_default_tools() {
        let config = AiThreadConfig::new("anthropic", "claude-3-sonnet", "test", "1.0.0").with_default_tools();
        assert!(config.tools_allowlist.is_some());
        let tools = config.get_tools_allowlist();
        assert!(tools.contains(&"get_holdings".to_string()));
        assert!(tools.contains(&"get_accounts".to_string()));
    }

    #[test]
    fn test_thread_config_serialization() {
        let config = AiThreadConfig::new("openai", "gpt-4o", "template-v1", "1.0.0")
            .with_default_tools();

        let json = config.to_json().unwrap();
        assert!(json.contains("schemaVersion"));
        assert!(json.contains("providerId"));
        assert!(json.contains("modelId"));
        assert!(json.contains("toolsAllowlist"));

        let parsed = AiThreadConfig::from_json(&json).unwrap();
        assert_eq!(parsed, config);
    }

    #[test]
    fn test_thread_with_config() {
        let config = AiThreadConfig::new("openai", "gpt-4o", "template", "1.0.0");
        let thread = AiThread::with_config(config.clone());

        assert!(thread.config.is_some());
        assert_eq!(thread.config.as_ref().unwrap().provider_id, "openai");
    }

    #[test]
    fn test_thread_tools_allowlist_fallback() {
        // Thread without config uses default tools
        let thread = AiThread::new();
        let tools = thread.get_tools_allowlist();
        assert!(!tools.is_empty());
        assert!(tools.contains(&"get_holdings".to_string()));

        // Thread with config uses config tools
        let config = AiThreadConfig {
            tools_allowlist: Some(vec!["custom_tool".to_string()]),
            ..Default::default()
        };
        let thread_with_config = AiThread::with_config(config);
        let tools = thread_with_config.get_tools_allowlist();
        assert_eq!(tools, vec!["custom_tool".to_string()]);
    }
}
