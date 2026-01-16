//! Provider adapters for rig-core integration.
//!
//! This module provides an abstraction layer over different LLM providers,
//! allowing the AI assistant to work with various backends through a
//! consistent interface. The adapter pattern enables:
//!
//! - Swapping providers without changing service code
//! - Testing with fake providers (no network access)
//! - Runtime provider selection based on user settings

use async_trait::async_trait;
use futures::stream::BoxStream;
use std::collections::HashMap;
use std::sync::Arc;

use crate::env::AiEnvironment;
use crate::types::{AiAssistantError, AiStreamEvent, ChatMessage, ToolCall};

// ============================================================================
// Provider Adapter Trait
// ============================================================================

/// Configuration for a chat completion request.
#[derive(Debug, Clone)]
pub struct CompletionConfig {
    /// Model ID to use.
    pub model_id: String,
    /// System prompt.
    pub system_prompt: String,
    /// Conversation history.
    pub messages: Vec<ChatMessage>,
    /// Available tools for this request.
    pub tools: Vec<ToolDefinition>,
    /// Whether to stream the response.
    pub stream: bool,
    /// Maximum tokens to generate (optional).
    pub max_tokens: Option<u32>,
    /// Temperature for sampling (optional).
    pub temperature: Option<f32>,
}

/// Definition of a tool that can be called by the model.
#[derive(Debug, Clone)]
pub struct ToolDefinition {
    /// Tool name.
    pub name: String,
    /// Tool description for the model.
    pub description: String,
    /// JSON schema for the tool parameters.
    pub parameters: serde_json::Value,
}

/// Result of a non-streaming completion.
#[derive(Debug, Clone)]
pub struct CompletionResult {
    /// The response content.
    pub content: String,
    /// Tool calls made by the model.
    pub tool_calls: Vec<ToolCall>,
    /// Token usage (if available).
    pub usage: Option<crate::types::UsageStats>,
}

/// Provider adapter trait for LLM providers.
///
/// Implementations wrap provider-specific SDKs (via rig-core) and expose
/// a uniform interface for chat completions.
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// Get the provider ID.
    fn provider_id(&self) -> &str;

    /// Check if this provider supports streaming.
    fn supports_streaming(&self) -> bool;

    /// Check if this provider supports tool calling.
    fn supports_tools(&self) -> bool;

    /// Perform a chat completion (non-streaming).
    async fn complete(&self, config: CompletionConfig)
        -> Result<CompletionResult, AiAssistantError>;

    /// Perform a streaming chat completion.
    ///
    /// Returns a stream of `AiStreamEvent` that ends with a `Done` event.
    async fn stream(
        &self,
        config: CompletionConfig,
        message_id: &str,
    ) -> Result<BoxStream<'static, AiStreamEvent>, AiAssistantError>;
}

// ============================================================================
// Provider Registry
// ============================================================================

/// Registry of available provider adapters.
///
/// The registry is injectable, allowing tests to register fake providers
/// that don't make network calls.
pub struct ProviderRegistry {
    adapters: HashMap<String, Arc<dyn ProviderAdapter>>,
    env: Arc<dyn AiEnvironment>,
}

impl ProviderRegistry {
    /// Create a new provider registry.
    pub fn new(env: Arc<dyn AiEnvironment>) -> Self {
        Self {
            adapters: HashMap::new(),
            env,
        }
    }

    /// Register a provider adapter.
    pub fn register(&mut self, adapter: Arc<dyn ProviderAdapter>) {
        self.adapters
            .insert(adapter.provider_id().to_string(), adapter);
    }

    /// Get a provider adapter by ID.
    pub fn get(&self, provider_id: &str) -> Option<Arc<dyn ProviderAdapter>> {
        self.adapters.get(provider_id).cloned()
    }

    /// Get the default provider adapter.
    pub fn get_default(&self) -> Option<Arc<dyn ProviderAdapter>> {
        self.env
            .get_default_provider()
            .and_then(|id| self.get(&id))
    }

    /// List all registered provider IDs.
    pub fn list_providers(&self) -> Vec<String> {
        self.adapters.keys().cloned().collect()
    }

    /// Get the environment reference.
    pub fn env(&self) -> &Arc<dyn AiEnvironment> {
        &self.env
    }
}

// ============================================================================
// Stub Provider (for initial implementation)
// ============================================================================

/// A stub provider that returns fixed responses.
/// Used for testing and as a placeholder until real providers are implemented.
pub struct StubProvider {
    id: String,
    response: String,
}

impl StubProvider {
    /// Create a new stub provider.
    pub fn new(id: &str, response: &str) -> Self {
        Self {
            id: id.to_string(),
            response: response.to_string(),
        }
    }
}

#[async_trait]
impl ProviderAdapter for StubProvider {
    fn provider_id(&self) -> &str {
        &self.id
    }

    fn supports_streaming(&self) -> bool {
        true
    }

    fn supports_tools(&self) -> bool {
        false
    }

    async fn complete(
        &self,
        _config: CompletionConfig,
    ) -> Result<CompletionResult, AiAssistantError> {
        Ok(CompletionResult {
            content: self.response.clone(),
            tool_calls: Vec::new(),
            usage: None,
        })
    }

    async fn stream(
        &self,
        _config: CompletionConfig,
        message_id: &str,
    ) -> Result<BoxStream<'static, AiStreamEvent>, AiAssistantError> {
        use futures::stream;

        let message_id = message_id.to_string();
        let response = self.response.clone();

        // Emit the response as a single text delta followed by done
        let msg = ChatMessage::assistant_with_id(&message_id, "stub-thread");
        let mut final_msg = msg;
        final_msg.content = response.clone();

        let events = vec![
            AiStreamEvent::text_delta(&message_id, &response),
            AiStreamEvent::done(final_msg, None),
        ];

        Ok(Box::pin(stream::iter(events)))
    }
}

// ============================================================================
// Real Provider Implementations (rig-core based)
// ============================================================================

// Note: Real provider implementations using rig-core will be added here.
// They will use the ProviderConfig from AiEnvironment to get API keys
// and base URLs without ever exposing secrets to the frontend.

/// Factory function to create a provider registry with standard providers.
///
/// This is called by Tauri/Axum to set up the production registry.
/// The registry reads secrets from the environment (via AiEnvironment)
/// and creates provider adapters with rig-core clients.
pub fn create_standard_registry(env: Arc<dyn AiEnvironment>) -> ProviderRegistry {
    let mut registry = ProviderRegistry::new(env);

    // TODO: Add real provider implementations here:
    // - OpenAI (using rig::providers::openai)
    // - Anthropic (using rig::providers::anthropic)
    // - Ollama (using rig::providers::ollama)
    // - etc.

    // For now, register a stub provider for testing
    registry.register(Arc::new(StubProvider::new(
        "stub",
        "I'm a stub provider. Real providers will be implemented soon.",
    )));

    registry
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_stub_provider_complete() {
        let provider = StubProvider::new("test", "Hello from stub!");
        let config = CompletionConfig {
            model_id: "test-model".to_string(),
            system_prompt: "You are helpful.".to_string(),
            messages: vec![],
            tools: vec![],
            stream: false,
            max_tokens: None,
            temperature: None,
        };

        let result = provider.complete(config).await.unwrap();
        assert_eq!(result.content, "Hello from stub!");
    }

    #[tokio::test]
    async fn test_provider_registry() {
        let env = Arc::new(MockEnvironment::new());
        let mut registry = ProviderRegistry::new(env);

        registry.register(Arc::new(StubProvider::new("openai", "OpenAI response")));
        registry.register(Arc::new(StubProvider::new("anthropic", "Anthropic response")));

        assert!(registry.get("openai").is_some());
        assert!(registry.get("anthropic").is_some());
        assert!(registry.get("unknown").is_none());

        let providers = registry.list_providers();
        assert_eq!(providers.len(), 2);
    }
}
