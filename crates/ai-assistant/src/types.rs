//! Shared types for AI assistant - DTOs, events, and models.
//!
//! These types are used by both backend (Axum/Tauri) and can be serialized
//! for frontend consumption.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// ============================================================================
// Chat Thread and Message Types
// ============================================================================

/// A chat thread containing messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThread {
    /// Unique thread ID (uuid7).
    pub id: String,
    /// Thread title (auto-generated or user-set).
    pub title: Option<String>,
    /// When the thread was created.
    pub created_at: DateTime<Utc>,
    /// When the thread was last updated.
    pub updated_at: DateTime<Utc>,
    /// Optional tags for filtering.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

impl ChatThread {
    /// Create a new chat thread with a generated ID.
    pub fn new() -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::now_v7().to_string(),
            title: None,
            created_at: now,
            updated_at: now,
            tags: Vec::new(),
        }
    }
}

impl Default for ChatThread {
    fn default() -> Self {
        Self::new()
    }
}

/// Message role in a chat thread.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    /// User message.
    User,
    /// Assistant (model) response.
    Assistant,
    /// System message (prompt template).
    System,
    /// Tool result message.
    Tool,
}

/// A single message in a chat thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// Unique message ID (uuid7).
    pub id: String,
    /// Parent thread ID.
    pub thread_id: String,
    /// Message role.
    pub role: MessageRole,
    /// Text content of the message.
    pub content: String,
    /// Tool calls made by the assistant (if any).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    /// Tool call ID this message responds to (for role=tool).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// When the message was created.
    pub created_at: DateTime<Utc>,
}

impl ChatMessage {
    /// Create a new user message.
    pub fn user(thread_id: &str, content: &str) -> Self {
        Self {
            id: Uuid::now_v7().to_string(),
            thread_id: thread_id.to_string(),
            role: MessageRole::User,
            content: content.to_string(),
            tool_calls: Vec::new(),
            tool_call_id: None,
            created_at: Utc::now(),
        }
    }

    /// Create a new assistant message.
    pub fn assistant(thread_id: &str, content: &str) -> Self {
        Self {
            id: Uuid::now_v7().to_string(),
            thread_id: thread_id.to_string(),
            role: MessageRole::Assistant,
            content: content.to_string(),
            tool_calls: Vec::new(),
            tool_call_id: None,
            created_at: Utc::now(),
        }
    }

    /// Create a new assistant message with a specific ID (for streaming).
    pub fn assistant_with_id(id: &str, thread_id: &str) -> Self {
        Self {
            id: id.to_string(),
            thread_id: thread_id.to_string(),
            role: MessageRole::Assistant,
            content: String::new(),
            tool_calls: Vec::new(),
            tool_call_id: None,
            created_at: Utc::now(),
        }
    }

    /// Create a new system message.
    pub fn system(thread_id: &str, content: &str) -> Self {
        Self {
            id: Uuid::now_v7().to_string(),
            thread_id: thread_id.to_string(),
            role: MessageRole::System,
            content: content.to_string(),
            tool_calls: Vec::new(),
            tool_call_id: None,
            created_at: Utc::now(),
        }
    }

    /// Create a new tool result message.
    pub fn tool_result(thread_id: &str, tool_call_id: &str, content: &str) -> Self {
        Self {
            id: Uuid::now_v7().to_string(),
            thread_id: thread_id.to_string(),
            role: MessageRole::Tool,
            content: content.to_string(),
            tool_calls: Vec::new(),
            tool_call_id: Some(tool_call_id.to_string()),
            created_at: Utc::now(),
        }
    }
}

// ============================================================================
// Tool Types
// ============================================================================

/// A tool call made by the assistant.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    /// Unique tool call ID.
    pub id: String,
    /// Name of the tool being called.
    pub name: String,
    /// Arguments passed to the tool (structured JSON).
    pub arguments: serde_json::Value,
}

impl ToolCall {
    /// Create a new tool call.
    pub fn new(name: &str, arguments: serde_json::Value) -> Self {
        Self {
            id: Uuid::now_v7().to_string(),
            name: name.to_string(),
            arguments,
        }
    }
}

/// Result of executing a tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultData {
    /// The tool call this result responds to.
    pub tool_call_id: String,
    /// Whether the tool execution succeeded.
    pub success: bool,
    /// The result data (structured JSON, not stringified).
    pub data: serde_json::Value,
    /// Metadata about the result (counts, truncation info, etc.).
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub meta: HashMap<String, serde_json::Value>,
    /// Error message if execution failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ============================================================================
// Stream Event Types
// ============================================================================

/// Events emitted during chat streaming.
///
/// All events include `message_id` for correlation.
/// The stream ends with a terminal `Done` event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiStreamEvent {
    /// Text delta - partial text content.
    #[serde(rename_all = "camelCase")]
    TextDelta {
        /// The message ID this delta belongs to.
        message_id: String,
        /// The text content delta.
        delta: String,
    },

    /// Tool call event - model wants to call a tool.
    #[serde(rename_all = "camelCase")]
    ToolCall {
        /// The message ID this tool call belongs to.
        message_id: String,
        /// The tool call details.
        tool_call: ToolCall,
    },

    /// Tool result event - tool execution completed.
    #[serde(rename_all = "camelCase")]
    ToolResult {
        /// The message ID this result belongs to.
        message_id: String,
        /// The tool result.
        result: ToolResultData,
    },

    /// Error event - something went wrong.
    #[serde(rename_all = "camelCase")]
    Error {
        /// The message ID (if available).
        message_id: Option<String>,
        /// Error code for programmatic handling.
        code: String,
        /// Human-readable error message.
        message: String,
    },

    /// Done event - stream completed (terminal).
    #[serde(rename_all = "camelCase")]
    Done {
        /// The message ID of the completed message.
        message_id: String,
        /// The final complete message.
        message: ChatMessage,
        /// Usage statistics (if available).
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<UsageStats>,
    },
}

impl AiStreamEvent {
    /// Create a text delta event.
    pub fn text_delta(message_id: &str, delta: &str) -> Self {
        Self::TextDelta {
            message_id: message_id.to_string(),
            delta: delta.to_string(),
        }
    }

    /// Create a tool call event.
    pub fn tool_call(message_id: &str, tool_call: ToolCall) -> Self {
        Self::ToolCall {
            message_id: message_id.to_string(),
            tool_call,
        }
    }

    /// Create a tool result event.
    pub fn tool_result(message_id: &str, result: ToolResultData) -> Self {
        Self::ToolResult {
            message_id: message_id.to_string(),
            result,
        }
    }

    /// Create an error event.
    pub fn error(message_id: Option<&str>, code: &str, message: &str) -> Self {
        Self::Error {
            message_id: message_id.map(|s| s.to_string()),
            code: code.to_string(),
            message: message.to_string(),
        }
    }

    /// Create a done event.
    pub fn done(message: ChatMessage, usage: Option<UsageStats>) -> Self {
        Self::Done {
            message_id: message.id.clone(),
            message,
            usage,
        }
    }
}

/// Token usage statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    /// Number of prompt tokens used.
    pub prompt_tokens: u32,
    /// Number of completion tokens generated.
    pub completion_tokens: u32,
    /// Total tokens (prompt + completion).
    pub total_tokens: u32,
}

// ============================================================================
// Request Types
// ============================================================================

/// Request to send a chat message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    /// Thread ID (creates new thread if not provided).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// The message content.
    pub content: String,
    /// Override provider ID (uses default if not specified).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    /// Override model ID (uses provider default if not specified).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    /// Tool allowlist for this request (uses all if not specified).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_tools: Option<Vec<String>>,
}

/// Configuration for a chat run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRunConfig {
    /// Provider to use.
    pub provider_id: String,
    /// Model to use.
    pub model_id: String,
    /// System prompt (built from template).
    pub system_prompt: String,
    /// Tool names allowed for this run.
    pub allowed_tools: Vec<String>,
    /// Whether streaming is enabled.
    pub streaming: bool,
}

// ============================================================================
// Error Types
// ============================================================================

/// AI assistant errors.
#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiAssistantError {
    /// Provider not found or not configured.
    #[error("Provider not configured: {provider_id}")]
    #[serde(rename_all = "camelCase")]
    ProviderNotConfigured { provider_id: String },

    /// API key required but missing.
    #[error("API key required for provider: {provider_id}")]
    #[serde(rename_all = "camelCase")]
    MissingApiKey { provider_id: String },

    /// Model not found.
    #[error("Model not found: {model_id}")]
    #[serde(rename_all = "camelCase")]
    ModelNotFound { model_id: String },

    /// Tool not found in registry.
    #[error("Tool not found: {tool_name}")]
    #[serde(rename_all = "camelCase")]
    ToolNotFound { tool_name: String },

    /// Tool not allowed for this thread.
    #[error("Tool not allowed: {tool_name}")]
    #[serde(rename_all = "camelCase")]
    ToolNotAllowed { tool_name: String },

    /// Tool execution failed.
    #[error("Tool execution failed: {message}")]
    #[serde(rename_all = "camelCase")]
    ToolExecutionError { tool_name: String, message: String },

    /// Provider API error.
    #[error("Provider error: {message}")]
    #[serde(rename_all = "camelCase")]
    ProviderError { message: String },

    /// Thread not found.
    #[error("Thread not found: {thread_id}")]
    #[serde(rename_all = "camelCase")]
    ThreadNotFound { thread_id: String },

    /// Invalid input.
    #[error("Invalid input: {message}")]
    #[serde(rename_all = "camelCase")]
    InvalidInput { message: String },

    /// Internal error.
    #[error("Internal error: {message}")]
    #[serde(rename_all = "camelCase")]
    Internal { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_thread_creation() {
        let thread = ChatThread::new();
        assert!(!thread.id.is_empty());
        assert!(thread.title.is_none());
        assert!(thread.tags.is_empty());
    }

    #[test]
    fn test_chat_message_user() {
        let msg = ChatMessage::user("thread-1", "Hello");
        assert_eq!(msg.thread_id, "thread-1");
        assert_eq!(msg.role, MessageRole::User);
        assert_eq!(msg.content, "Hello");
    }

    #[test]
    fn test_ai_stream_event_serialization() {
        let event = AiStreamEvent::text_delta("msg-1", "Hello");
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("textDelta"));
        assert!(json.contains("msg-1"));
    }

    #[test]
    fn test_tool_call_creation() {
        let tc = ToolCall::new("get_holdings", serde_json::json!({"account_id": "123"}));
        assert_eq!(tc.name, "get_holdings");
        assert!(!tc.id.is_empty());
    }
}
