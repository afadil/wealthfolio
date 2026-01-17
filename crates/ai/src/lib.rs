//! Wealthfolio AI - LLM orchestration using rig-core.
//!
//! This crate provides the AI assistant functionality for Wealthfolio,
//! handling the model ↔ tools ↔ model orchestration loop and streaming
//! `AiStreamEvent` to Tauri/Axum consumers.
//!
//! # Architecture
//!
//! - `chat`: Main streaming chat service with tool execution loop
//! - `providers`: Provider catalog and rig-core client factory
//! - `tools`: Tool registry, schemas, and bounded outputs
//! - `types`: Shared DTOs/events used by Axum/Tauri + frontend
//! - `env`: Environment abstraction for services/secrets/config
//! - `title_generator`: Auto-generates thread titles from user messages
//! - `eval`: Behavioral evaluation harness (test only)
//! - `provider_model`: AI provider domain models (catalog, settings, merged views)
//! - `provider_service`: AI provider service for settings management
//! - `prompt_template`: Versioned prompt templates
//! - `prompt_template_service`: Prompt template service
//!
//! # Example
//!
//! ```ignore
//! use wealthfolio_ai::{ChatService, ChatConfig, AiEnvironment};
//!
//! // Create environment (Tauri/Axum implements AiEnvironment)
//! let env = create_runtime_environment(...);
//!
//! // Create chat service
//! let service = ChatService::new(Arc::new(env), ChatConfig::default());
//!
//! // Send message and get stream
//! let stream = service.send_message(SendMessageRequest {
//!     thread_id: None,
//!     content: "Show me my holdings".to_string(),
//!     ..Default::default()
//! }).await?;
//!
//! // Process stream events
//! while let Some(event) = stream.next().await {
//!     match event {
//!         AiStreamEvent::TextDelta { delta, .. } => print!("{}", delta),
//!         AiStreamEvent::ToolResult { result, .. } => render_tool_result(result),
//!         AiStreamEvent::Done { message, .. } => break,
//!         _ => {}
//!     }
//! }
//! ```

pub mod chat;
pub mod env;
pub mod error;
#[cfg(test)]
pub mod eval;
pub mod prompt_template;
pub mod prompt_template_service;
pub mod provider_model;
pub mod provider_service;
pub mod providers;
pub mod title_generator;
pub mod tools;
pub mod types;

// Re-export main types for convenience
pub use chat::{ChatConfig, ChatService};
pub use env::AiEnvironment;
pub use error::AiError;
pub use providers::ProviderService;
pub use title_generator::{
    truncate_to_title, FakeTitleGenerator, TitleGenerator, TitleGeneratorConfig,
    TitleGeneratorTrait,
};
pub use tools::{
    GetAccountsTool, GetGoalsTool, GetHoldingsTool, SearchActivitiesTool, ToolSet,
    DEFAULT_ACTIVITIES_DAYS, DEFAULT_VALUATIONS_DAYS, MAX_ACTIVITIES_ROWS, MAX_GOALS,
    MAX_HOLDINGS, MAX_ACCOUNTS, MAX_INCOME_RECORDS, MAX_VALUATIONS_POINTS,
};
pub use types::{
    // Domain types (chat thread, message, content)
    ChatMessage, ChatMessageContent, ChatMessagePart, ChatMessageRole, ChatRepositoryResult,
    ChatRepositoryTrait, ChatThread, ChatThreadConfig,
    // Streaming and request types
    AiStreamEvent, ChatModelConfig, SendMessageRequest, SimpleChatMessage, ToolCall, ToolResult,
    ToolResultData, UsageStats,
    // Pagination types
    ListThreadsRequest, ThreadPage,
    // Constants
    CHAT_CONFIG_SCHEMA_VERSION, CHAT_CONTENT_SCHEMA_VERSION, CHAT_MAX_CONTENT_SIZE_BYTES,
    DEFAULT_TOOLS_ALLOWLIST,
};

// Provider model types
pub use provider_model::{
    // Catalog types
    AiProviderCatalog, CapabilityInfo, CatalogModel, CatalogProvider, ConnectionField,
    ModelCapabilities, ProviderDefaultConfig,
    // User settings types
    AiProviderSettings, ModelCapabilityOverrides, ProviderUserSettings,
    // Merged view types
    AiProvidersResponse, MergedModel, MergedProvider,
    // Update types
    ModelCapabilityOverrideUpdate, SetDefaultProviderRequest, UpdateProviderSettingsRequest,
    // Provider API error
    ProviderApiError,
    // Provider config types
    FetchedModel, ListModelsResponse, ProviderConfig,
    // Constants
    AI_PROVIDER_SETTINGS_KEY, AI_PROVIDER_SETTINGS_SCHEMA_VERSION,
};

// Provider service
pub use provider_service::{AiProviderService, AiProviderServiceTrait};

// Prompt template types
pub use prompt_template::{
    ChatRunConfig, DetailLevel, KnobType, PromptTemplate, PromptTemplateCatalog,
    TemplateCatalogMetadata, TemplateKnob, TemplateSection, TemplateSections,
    PROMPT_TEMPLATE_SCHEMA_VERSION,
};

// Prompt template service
pub use prompt_template_service::{
    build_run_config_from_context, PromptTemplateInfo, PromptTemplateService,
    PromptTemplateServiceTrait,
};
