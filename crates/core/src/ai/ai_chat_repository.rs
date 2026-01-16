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

/// Maximum size in bytes for persisted message content (256KB).
pub const AI_MAX_CONTENT_SIZE_BYTES: usize = 256 * 1024;

// ============================================================================
// Domain Types
// ============================================================================

/// A chat thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiThread {
    pub id: String,
    pub title: Option<String>,
    pub tags: Vec<String>,
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
            tags: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Create a thread with specific ID (for reconstruction from DB).
    pub fn with_id(id: String, title: Option<String>, created_at: DateTime<Utc>, updated_at: DateTime<Utc>) -> Self {
        Self {
            id,
            title,
            tags: Vec::new(),
            created_at,
            updated_at,
        }
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
}
