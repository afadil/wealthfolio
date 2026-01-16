//! AI Assistant Service - orchestrates the model ↔ tools ↔ model loop.
//!
//! This module provides the main service API for streaming chat events.
//! It coordinates between:
//! - Provider adapters (via rig-core)
//! - Tool registry and execution
//! - Prompt template service
//! - Environment abstraction for secrets/config
//! - Title generation for new threads

use async_trait::async_trait;
use futures::stream::BoxStream;
use log::{debug, info};
use std::sync::Arc;
use uuid::Uuid;

use wealthfolio_core::ai::{
    build_run_config_from_context, PromptTemplateService, PromptTemplateServiceTrait,
};

use crate::env::AiEnvironment;
use crate::portfolio_data::{MockPortfolioDataProvider, PortfolioDataProvider};
use crate::providers::{CompletionConfig, ProviderRegistry};
use crate::title_generator::{TitleGenerator, TitleGeneratorConfig, TitleGeneratorTrait};
use crate::tools::{ToolContext, ToolRegistry};
use crate::types::{
    AiAssistantError, AiStreamEvent, ChatMessage, ChatThread, SendMessageRequest,
};

// ============================================================================
// Service Trait
// ============================================================================

/// Trait defining the AI assistant service API.
#[async_trait]
pub trait AiAssistantServiceTrait: Send + Sync {
    /// Send a message and get a streaming response.
    ///
    /// This is the main entry point for chat. It:
    /// 1. Creates or retrieves the thread
    /// 2. Builds the system prompt from templates
    /// 3. Sends to the provider with available tools
    /// 4. Returns a stream of events (text deltas, tool calls, etc.)
    /// 5. Handles the model ↔ tools loop until done
    ///
    /// The stream always ends with a `Done` event containing the final message.
    async fn send_message(
        &self,
        request: SendMessageRequest,
    ) -> Result<BoxStream<'static, AiStreamEvent>, AiAssistantError>;

    /// Create a new chat thread.
    fn create_thread(&self) -> ChatThread;

    /// Get a thread by ID.
    async fn get_thread(&self, thread_id: &str) -> Result<ChatThread, AiAssistantError>;

    /// List all threads.
    async fn list_threads(&self) -> Result<Vec<ChatThread>, AiAssistantError>;

    /// Get messages for a thread.
    async fn get_messages(&self, thread_id: &str) -> Result<Vec<ChatMessage>, AiAssistantError>;

    /// List available tool names.
    fn list_tools(&self) -> Vec<String>;
}

// ============================================================================
// Service Implementation
// ============================================================================

/// Configuration for the AI assistant service.
pub struct AiAssistantConfig {
    /// Maximum number of tool call rounds before stopping.
    pub max_tool_rounds: usize,
    /// Maximum tokens for each completion.
    pub max_tokens: Option<u32>,
    /// Default temperature for sampling.
    pub temperature: Option<f32>,
}

impl Default for AiAssistantConfig {
    fn default() -> Self {
        Self {
            max_tool_rounds: 5,
            max_tokens: Some(4096),
            temperature: Some(0.7),
        }
    }
}

/// AI Assistant Service implementation.
pub struct AiAssistantService {
    env: Arc<dyn AiEnvironment>,
    provider_registry: Arc<ProviderRegistry>,
    tool_registry: Arc<ToolRegistry>,
    prompt_service: Arc<PromptTemplateService>,
    title_generator: Arc<dyn TitleGeneratorTrait>,
    data_provider: Arc<dyn PortfolioDataProvider>,
    config: AiAssistantConfig,
    // In-memory thread storage (will be replaced with DB in future)
    threads: std::sync::RwLock<std::collections::HashMap<String, ChatThread>>,
    messages: std::sync::RwLock<std::collections::HashMap<String, Vec<ChatMessage>>>,
}

impl AiAssistantService {
    /// Create a new AI assistant service.
    pub fn new(
        env: Arc<dyn AiEnvironment>,
        provider_registry: Arc<ProviderRegistry>,
        tool_registry: Arc<ToolRegistry>,
        prompt_service: Arc<PromptTemplateService>,
        data_provider: Arc<dyn PortfolioDataProvider>,
        config: AiAssistantConfig,
    ) -> Self {
        // Create title generator using the provider registry
        let title_generator = Arc::new(TitleGenerator::new(
            env.clone(),
            provider_registry.clone(),
            TitleGeneratorConfig::default(),
        ));

        Self {
            env,
            provider_registry,
            tool_registry,
            prompt_service,
            title_generator,
            data_provider,
            config,
            threads: std::sync::RwLock::new(std::collections::HashMap::new()),
            messages: std::sync::RwLock::new(std::collections::HashMap::new()),
        }
    }

    /// Create a new AI assistant service with a custom title generator.
    /// This is useful for testing with a fake title generator.
    pub fn with_title_generator(
        env: Arc<dyn AiEnvironment>,
        provider_registry: Arc<ProviderRegistry>,
        tool_registry: Arc<ToolRegistry>,
        prompt_service: Arc<PromptTemplateService>,
        data_provider: Arc<dyn PortfolioDataProvider>,
        title_generator: Arc<dyn TitleGeneratorTrait>,
        config: AiAssistantConfig,
    ) -> Self {
        Self {
            env,
            provider_registry,
            tool_registry,
            prompt_service,
            title_generator,
            data_provider,
            config,
            threads: std::sync::RwLock::new(std::collections::HashMap::new()),
            messages: std::sync::RwLock::new(std::collections::HashMap::new()),
        }
    }

    /// Build system prompt from template.
    fn build_system_prompt(&self) -> Result<String, AiAssistantError> {
        let locale = self.env.get_locale();
        let config = build_run_config_from_context(locale.as_deref(), None);

        self.prompt_service
            .build_system_prompt(&config)
            .map_err(|e| AiAssistantError::Internal {
                message: format!("Failed to build system prompt: {}", e),
            })
    }

    /// Get the provider to use for a request.
    fn get_provider(
        &self,
        provider_id: Option<&str>,
    ) -> Result<Arc<dyn crate::providers::ProviderAdapter>, AiAssistantError> {
        let id = provider_id
            .map(|s| s.to_string())
            .or_else(|| self.env.get_default_provider());

        match id {
            Some(id) => self.provider_registry.get(&id).ok_or_else(|| {
                AiAssistantError::ProviderNotConfigured {
                    provider_id: id.clone(),
                }
            }),
            None => self
                .provider_registry
                .get_default()
                .ok_or_else(|| AiAssistantError::ProviderNotConfigured {
                    provider_id: "default".to_string(),
                }),
        }
    }

    /// Get the model to use for a provider.
    fn get_model(&self, provider_id: &str, model_id: Option<&str>) -> String {
        model_id
            .map(|s| s.to_string())
            .or_else(|| self.env.get_default_model(provider_id))
            .unwrap_or_else(|| "default".to_string())
    }

    /// Create tool context for execution.
    #[allow(dead_code)] // Will be used in tool execution loop
    fn create_tool_context(&self) -> ToolContext {
        ToolContext {
            base_currency: self.env.get_base_currency(),
            now: self.env.now(),
            locale: self.env.get_locale(),
            data_provider: self.data_provider.clone(),
        }
    }

    /// Store a message for a thread.
    fn store_message(&self, message: ChatMessage) {
        let thread_id = message.thread_id.clone();
        let mut messages = self.messages.write().unwrap();
        messages.entry(thread_id).or_default().push(message);
    }

    /// Update a thread's title.
    fn update_thread_title(&self, thread_id: &str, title: String) {
        let mut threads = self.threads.write().unwrap();
        if let Some(thread) = threads.get_mut(thread_id) {
            thread.title = Some(title);
            thread.updated_at = chrono::Utc::now();
        }
    }

    /// Check if this is the first message in a thread.
    fn is_first_message(&self, thread_id: &str) -> bool {
        let messages = self.messages.read().unwrap();
        messages.get(thread_id).map(|m| m.is_empty()).unwrap_or(true)
    }

    /// Generate and set the title for a thread based on the first user message.
    /// This runs asynchronously without blocking the chat response.
    async fn generate_title_for_thread(&self, thread_id: &str, user_message: &str, provider_id: &str) {
        // Note: We intentionally do NOT log user_message content to avoid
        // potentially exposing sensitive portfolio-related information in logs.
        debug!("Generating title for thread {} (message_len={})", thread_id, user_message.len());

        let title = self
            .title_generator
            .generate_title(user_message, provider_id)
            .await;

        info!("Generated title for thread {}: {}", thread_id, title);
        self.update_thread_title(thread_id, title);
    }
}

#[async_trait]
impl AiAssistantServiceTrait for AiAssistantService {
    async fn send_message(
        &self,
        request: SendMessageRequest,
    ) -> Result<BoxStream<'static, AiStreamEvent>, AiAssistantError> {
        // Check if this will be a new thread (for title generation)
        let is_new_thread = request.thread_id.is_none();

        // Get or create thread
        let thread = match &request.thread_id {
            Some(id) => self.get_thread(id).await?,
            None => {
                let thread = self.create_thread();
                let mut threads = self.threads.write().unwrap();
                threads.insert(thread.id.clone(), thread.clone());
                thread
            }
        };

        info!("Processing message for thread {}", thread.id);

        // Check if this is the first message (for existing threads without title)
        let needs_title = is_new_thread || (thread.title.is_none() && self.is_first_message(&thread.id));

        // Create and store user message
        let user_message = ChatMessage::user(&thread.id, &request.content);
        self.store_message(user_message.clone());

        // Get provider and model
        let provider = self.get_provider(request.provider_id.as_deref())?;
        let provider_id = provider.provider_id().to_string();
        let model_id = self.get_model(&provider_id, request.model_id.as_deref());

        debug!(
            "Using provider {} with model {}",
            provider_id,
            model_id
        );

        // Generate title for new threads
        // This uses the title model configured for the provider
        // Title generation runs before the chat response to ensure the title is available
        // Note: In production with database persistence, this could run in background
        if needs_title {
            self.generate_title_for_thread(&thread.id, &request.content, &provider_id).await;
        }

        // Build system prompt
        let system_prompt = self.build_system_prompt()?;

        // Get tool definitions based on allowlist
        let tool_defs = self
            .tool_registry
            .get_definitions(request.allowed_tools.as_deref());

        // Get conversation history
        let history = {
            let messages = self.messages.read().unwrap();
            messages.get(&thread.id).cloned().unwrap_or_default()
        };

        // Build completion config
        let config = CompletionConfig {
            model_id: model_id.clone(),
            system_prompt,
            messages: history,
            tools: tool_defs,
            stream: true,
            max_tokens: self.config.max_tokens,
            temperature: self.config.temperature,
        };

        // Generate run ID and message ID for the assistant response
        let run_id = Uuid::now_v7().to_string();
        let message_id = Uuid::now_v7().to_string();

        // Get streaming response from provider
        let stream = provider
            .stream(config, &thread.id, &run_id, &message_id)
            .await?;

        // TODO: Wrap stream to handle tool calls and store final message
        // Variables prepared for future tool execution loop:
        // - thread_id: thread.id.clone()
        // - tool_registry: self.tool_registry.clone()
        // - tool_ctx: self.create_tool_context()
        // - allowed_tools: request.allowed_tools.clone()

        // For now, return the raw provider stream
        // The tool execution loop will be added in a future iteration
        Ok(stream)
    }

    fn create_thread(&self) -> ChatThread {
        ChatThread::new()
    }

    async fn get_thread(&self, thread_id: &str) -> Result<ChatThread, AiAssistantError> {
        let threads = self.threads.read().unwrap();
        threads
            .get(thread_id)
            .cloned()
            .ok_or_else(|| AiAssistantError::ThreadNotFound {
                thread_id: thread_id.to_string(),
            })
    }

    async fn list_threads(&self) -> Result<Vec<ChatThread>, AiAssistantError> {
        let threads = self.threads.read().unwrap();
        let mut list: Vec<_> = threads.values().cloned().collect();
        list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(list)
    }

    async fn get_messages(&self, thread_id: &str) -> Result<Vec<ChatMessage>, AiAssistantError> {
        // Verify thread exists
        self.get_thread(thread_id).await?;

        let messages = self.messages.read().unwrap();
        Ok(messages.get(thread_id).cloned().unwrap_or_default())
    }

    fn list_tools(&self) -> Vec<String> {
        self.tool_registry.list_names()
    }
}

// ============================================================================
// Builder Pattern
// ============================================================================

/// Builder for creating an AiAssistantService.
pub struct AiAssistantServiceBuilder {
    env: Option<Arc<dyn AiEnvironment>>,
    provider_registry: Option<Arc<ProviderRegistry>>,
    tool_registry: Option<Arc<ToolRegistry>>,
    prompt_service: Option<Arc<PromptTemplateService>>,
    data_provider: Option<Arc<dyn PortfolioDataProvider>>,
    config: AiAssistantConfig,
}

impl AiAssistantServiceBuilder {
    /// Create a new builder.
    pub fn new() -> Self {
        Self {
            env: None,
            provider_registry: None,
            tool_registry: None,
            prompt_service: None,
            data_provider: None,
            config: AiAssistantConfig::default(),
        }
    }

    /// Set the environment.
    pub fn with_env(mut self, env: Arc<dyn AiEnvironment>) -> Self {
        self.env = Some(env);
        self
    }

    /// Set the provider registry.
    pub fn with_providers(mut self, registry: Arc<ProviderRegistry>) -> Self {
        self.provider_registry = Some(registry);
        self
    }

    /// Set the tool registry.
    pub fn with_tools(mut self, registry: Arc<ToolRegistry>) -> Self {
        self.tool_registry = Some(registry);
        self
    }

    /// Set the prompt service.
    pub fn with_prompts(mut self, service: Arc<PromptTemplateService>) -> Self {
        self.prompt_service = Some(service);
        self
    }

    /// Set the portfolio data provider.
    pub fn with_data_provider(mut self, provider: Arc<dyn PortfolioDataProvider>) -> Self {
        self.data_provider = Some(provider);
        self
    }

    /// Set the configuration.
    pub fn with_config(mut self, config: AiAssistantConfig) -> Self {
        self.config = config;
        self
    }

    /// Build the service.
    pub fn build(self) -> Result<AiAssistantService, &'static str> {
        // Use mock provider if none specified
        let data_provider = self
            .data_provider
            .unwrap_or_else(|| Arc::new(MockPortfolioDataProvider::new()));

        Ok(AiAssistantService::new(
            self.env.ok_or("Environment required")?,
            self.provider_registry.ok_or("Provider registry required")?,
            self.tool_registry.ok_or("Tool registry required")?,
            self.prompt_service.ok_or("Prompt service required")?,
            data_provider,
            self.config,
        ))
    }
}

impl Default for AiAssistantServiceBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;
    use crate::providers::StubProvider;
    use crate::title_generator::FakeTitleGenerator;
    use crate::tools::create_placeholder_registry;

    fn create_test_service() -> AiAssistantService {
        let env = Arc::new(MockEnvironment::new().with_ollama("http://localhost:11434"));
        let mut provider_registry = ProviderRegistry::new(env.clone());
        provider_registry.register(Arc::new(StubProvider::new("stub", "Hello!")));

        let tool_registry = create_placeholder_registry();
        let prompt_service =
            PromptTemplateService::new(include_str!("../../../src-front/lib/ai-prompt-templates.json"))
                .expect("Failed to load prompt templates");
        let data_provider = Arc::new(MockPortfolioDataProvider::new());

        AiAssistantService::new(
            env,
            Arc::new(provider_registry),
            Arc::new(tool_registry),
            Arc::new(prompt_service),
            data_provider,
            AiAssistantConfig::default(),
        )
    }

    fn create_test_service_with_fake_title_gen(
        title_generator: Arc<dyn TitleGeneratorTrait>,
    ) -> AiAssistantService {
        let env = Arc::new(MockEnvironment::new().with_ollama("http://localhost:11434"));
        let mut provider_registry = ProviderRegistry::new(env.clone());
        provider_registry.register(Arc::new(StubProvider::new("stub", "Hello!")));

        let tool_registry = create_placeholder_registry();
        let prompt_service =
            PromptTemplateService::new(include_str!("../../../src-front/lib/ai-prompt-templates.json"))
                .expect("Failed to load prompt templates");
        let data_provider = Arc::new(MockPortfolioDataProvider::new());

        AiAssistantService::with_title_generator(
            env,
            Arc::new(provider_registry),
            Arc::new(tool_registry),
            Arc::new(prompt_service),
            data_provider,
            title_generator,
            AiAssistantConfig::default(),
        )
    }

    #[test]
    fn test_create_thread() {
        let service = create_test_service();
        let thread = service.create_thread();
        assert!(!thread.id.is_empty());
    }

    #[tokio::test]
    async fn test_thread_storage() {
        let service = create_test_service();

        // Create and store a thread
        let thread = service.create_thread();
        let thread_id = thread.id.clone();

        {
            let mut threads = service.threads.write().unwrap();
            threads.insert(thread_id.clone(), thread);
        }

        // Retrieve it
        let retrieved = service.get_thread(&thread_id).await.unwrap();
        assert_eq!(retrieved.id, thread_id);

        // List threads
        let list = service.list_threads().await.unwrap();
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn test_list_tools() {
        let service = create_test_service();
        let tools = service.list_tools();
        assert!(!tools.is_empty());
        assert!(tools.contains(&"get_holdings".to_string()));
    }

    // =========================================================================
    // Title Generation Tests (deterministic, no network)
    // =========================================================================

    #[tokio::test]
    async fn test_title_generation_with_fake_provider_fixed_title() {
        // Use fake title generator that returns a fixed title
        let fake_gen = Arc::new(FakeTitleGenerator::with_title("Portfolio Analysis"));
        let service = create_test_service_with_fake_title_gen(fake_gen);

        // Create a new thread and send first message
        let request = SendMessageRequest {
            thread_id: None,
            content: "What is my portfolio value?".to_string(),
            provider_id: Some("stub".to_string()),
            model_id: None,
            allowed_tools: None,
        };

        let _stream = service.send_message(request).await.unwrap();

        // Get the thread and verify title was set
        let threads = service.list_threads().await.unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].title, Some("Portfolio Analysis".to_string()));
    }

    #[tokio::test]
    async fn test_title_generation_with_fallback_truncation() {
        // Use fake title generator that uses fallback (truncation)
        let fake_gen = Arc::new(FakeTitleGenerator::with_fallback());
        let service = create_test_service_with_fake_title_gen(fake_gen);

        // Create a new thread with a short message
        let request = SendMessageRequest {
            thread_id: None,
            content: "Show my holdings".to_string(),
            provider_id: Some("stub".to_string()),
            model_id: None,
            allowed_tools: None,
        };

        let _stream = service.send_message(request).await.unwrap();

        // Title should be the message itself (short enough)
        let threads = service.list_threads().await.unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].title, Some("Show my holdings".to_string()));
    }

    #[tokio::test]
    async fn test_title_generation_fallback_truncates_long_message() {
        // Use fake title generator that uses fallback (truncation)
        let fake_gen = Arc::new(FakeTitleGenerator::with_fallback());
        let service = create_test_service_with_fake_title_gen(fake_gen);

        // Create a new thread with a long message
        let request = SendMessageRequest {
            thread_id: None,
            content: "Can you provide a detailed analysis of all my investment holdings across multiple accounts including stocks, bonds, and ETFs with their current market values and historical performance?".to_string(),
            provider_id: Some("stub".to_string()),
            model_id: None,
            allowed_tools: None,
        };

        let _stream = service.send_message(request).await.unwrap();

        // Title should be truncated
        let threads = service.list_threads().await.unwrap();
        assert_eq!(threads.len(), 1);

        let title = threads[0].title.as_ref().unwrap();
        assert!(title.len() <= 53); // 50 chars + "..."
        assert!(title.ends_with("..."));
    }

    #[tokio::test]
    async fn test_no_title_regeneration_on_subsequent_messages() {
        // Use fake title generator that returns a fixed title
        let fake_gen = Arc::new(FakeTitleGenerator::with_title("First Title"));
        let service = create_test_service_with_fake_title_gen(fake_gen);

        // Create a new thread
        let request1 = SendMessageRequest {
            thread_id: None,
            content: "First message".to_string(),
            provider_id: Some("stub".to_string()),
            model_id: None,
            allowed_tools: None,
        };

        let _stream = service.send_message(request1).await.unwrap();

        // Get thread ID
        let threads = service.list_threads().await.unwrap();
        let thread_id = threads[0].id.clone();
        assert_eq!(threads[0].title, Some("First Title".to_string()));

        // Manually change the title to verify it doesn't get regenerated
        service.update_thread_title(&thread_id, "Modified Title".to_string());

        // Send second message to existing thread
        let request2 = SendMessageRequest {
            thread_id: Some(thread_id.clone()),
            content: "Second message".to_string(),
            provider_id: Some("stub".to_string()),
            model_id: None,
            allowed_tools: None,
        };

        let _stream = service.send_message(request2).await.unwrap();

        // Title should not change
        let thread = service.get_thread(&thread_id).await.unwrap();
        assert_eq!(thread.title, Some("Modified Title".to_string()));
    }
}
