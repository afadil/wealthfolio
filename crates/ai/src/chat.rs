//! Chat orchestration - model ↔ tools ↔ model loop with streaming.
//!
//! This module provides the main chat streaming functionality using rig-core.
//! It handles:
//! - Building agents with tools via rig's AgentBuilder
//! - Streaming responses with text deltas and tool calls
//! - Multi-turn tool execution
//! - Emitting structured stream events for the frontend

use futures::stream::BoxStream;
use futures::StreamExt;
use log::{debug, error, info};
use reqwest::Client as HttpClient;
use rig::{
    agent::{Agent, MultiTurnStreamItem},
    client::{CompletionClient, Nothing},
    completion::{CompletionModel, Message},
    message::{
        AssistantContent, Reasoning, Text, ToolCall as RigToolCall, ToolChoice, ToolResultContent,
        UserContent,
    },
    providers::{
        anthropic, gemini, groq,
        groq::{GroqAdditionalParameters, ReasoningFormat},
        ollama, openai, openrouter,
    },
    streaming::{StreamedAssistantContent, StreamedUserContent, StreamingChat},
    OneOrMany,
};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::env::AiEnvironment;
use crate::error::AiError;
use crate::providers::ProviderService;
use crate::title_generator::truncate_to_title;
use crate::title_generator::{TitleGenerator, TitleGeneratorConfig, TitleGeneratorTrait};
use crate::tools::ToolSet;
use crate::types::{
    AiStreamEvent, ChatMessage, ChatMessageContent, ChatMessagePart, ChatMessageRole,
    ChatRepositoryTrait, ChatThread, ListThreadsRequest, SendMessageRequest, SimpleChatMessage,
    ThreadPage, ToolCall, ToolResultData,
};

fn derive_initial_thread_title(first_user_message: &str) -> Option<String> {
    let trimmed = first_user_message.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(truncate_to_title(trimmed, 50))
}

// ============================================================================
// Chat Stream Configuration
// ============================================================================

/// Configuration for chat streaming.
pub struct ChatConfig {
    /// Maximum number of tool call rounds before stopping.
    pub max_tool_rounds: usize,
    /// Maximum tokens for each completion.
    pub max_tokens: Option<u32>,
    /// Temperature for sampling.
    pub temperature: Option<f32>,
}

impl Default for ChatConfig {
    fn default() -> Self {
        Self {
            max_tool_rounds: 5,
            max_tokens: Some(4096),
            temperature: Some(0.7),
        }
    }
}

// ============================================================================
// Chat Service
// ============================================================================

/// Chat service for managing threads and streaming responses.
pub struct ChatService<E: AiEnvironment + 'static> {
    env: Arc<E>,
    #[allow(dead_code)]
    config: ChatConfig,
}

impl<E: AiEnvironment + 'static> ChatService<E> {
    /// Create a new chat service.
    pub fn new(env: Arc<E>, config: ChatConfig) -> Self {
        Self { env, config }
    }

    /// Create a new chat thread and persist it to the repository.
    pub async fn create_thread(&self) -> Result<ChatThread, AiError> {
        let thread = ChatThread::new();
        self.env.chat_repository().create_thread(thread).await
    }

    /// Get a thread by ID from the repository.
    pub fn get_thread(&self, thread_id: &str) -> Result<Option<ChatThread>, AiError> {
        self.env.chat_repository().get_thread(thread_id)
    }

    /// Get messages for a thread from the repository.
    pub fn get_messages(&self, thread_id: &str) -> Result<Vec<ChatMessage>, AiError> {
        self.env.chat_repository().get_messages_by_thread(thread_id)
    }

    /// List all threads from the repository.
    pub fn list_threads(&self, limit: i64, offset: i64) -> Result<Vec<ChatThread>, AiError> {
        self.env.chat_repository().list_threads(limit, offset)
    }

    /// List threads with cursor-based pagination and optional search.
    pub fn list_threads_paginated(
        &self,
        request: &ListThreadsRequest,
    ) -> Result<ThreadPage, AiError> {
        self.env.chat_repository().list_threads_paginated(request)
    }

    /// Update thread title in the repository.
    pub async fn update_thread_title(
        &self,
        thread_id: &str,
        title: String,
    ) -> Result<ChatThread, AiError> {
        let repo = self.env.chat_repository();
        let thread = repo
            .get_thread(thread_id)?
            .ok_or_else(|| AiError::ThreadNotFound(thread_id.to_string()))?;

        let updated = ChatThread {
            title: Some(title),
            updated_at: chrono::Utc::now(),
            ..thread
        };
        repo.update_thread(updated).await
    }

    /// Update thread pinned status in the repository.
    pub async fn update_thread_pinned(
        &self,
        thread_id: &str,
        is_pinned: bool,
    ) -> Result<ChatThread, AiError> {
        let repo = self.env.chat_repository();
        let thread = repo
            .get_thread(thread_id)?
            .ok_or_else(|| AiError::ThreadNotFound(thread_id.to_string()))?;

        let updated = ChatThread {
            is_pinned,
            updated_at: chrono::Utc::now(),
            ..thread
        };
        repo.update_thread(updated).await
    }

    /// Delete a thread and its messages from the repository.
    pub async fn delete_thread(&self, thread_id: &str) -> Result<(), AiError> {
        self.env.chat_repository().delete_thread(thread_id).await
    }

    /// Send a message and get a streaming response.
    pub async fn send_message(
        &self,
        request: SendMessageRequest,
    ) -> Result<BoxStream<'static, AiStreamEvent>, AiError> {
        let repo = self.env.chat_repository();

        // Get or create thread
        let (thread, is_new_thread, initial_title) = match &request.thread_id {
            Some(id) => {
                let thread = repo
                    .get_thread(id)?
                    .ok_or_else(|| AiError::ThreadNotFound(id.clone()))?;
                (thread, false, None)
            }
            None => {
                let mut new_thread = ChatThread::new();
                new_thread.title = derive_initial_thread_title(&request.content);
                let created = repo.create_thread(new_thread).await?;
                let initial_title = created.title.clone();
                (created, true, initial_title)
            }
        };

        let thread_id = thread.id.clone();
        info!("Processing message for thread {}", thread_id);

        // Load previous messages for context (history)
        let previous_messages = repo.get_messages_by_thread(&thread_id)?;
        let history_messages: Vec<SimpleChatMessage> = previous_messages
            .iter()
            .filter_map(|msg| {
                let text = msg.content.get_text_content();
                if text.is_empty() {
                    return None;
                }
                match msg.role {
                    ChatMessageRole::User => Some(SimpleChatMessage::user(&text)),
                    ChatMessageRole::Assistant => Some(SimpleChatMessage::assistant(&text)),
                    _ => None, // Skip system/tool messages in history
                }
            })
            .collect();

        // Save user message immediately to repository
        let user_message = ChatMessage::user(&thread_id, &request.content);
        repo.create_message(user_message).await?;

        // Get provider settings
        let provider_service = ProviderService::new(self.env.clone());
        let settings = provider_service.get_settings()?;

        let provider_id = request
            .effective_provider_id()
            .map(|s| s.to_string())
            .unwrap_or_else(|| settings.provider_id.clone());
        let model_id = request
            .effective_model_id()
            .map(|s| s.to_string())
            .unwrap_or_else(|| settings.model.clone());

        debug!("Using provider {} with model {}", provider_id, model_id);

        // Generate IDs for this run
        let run_id = Uuid::now_v7().to_string();
        let message_id = Uuid::now_v7().to_string();

        // Create channel for events
        let (tx, rx) = mpsc::channel::<AiStreamEvent>(100);

        // Clone what we need for the async task
        let env = self.env.clone();
        let content = request.content.clone();
        let thread_id_clone = thread_id.clone();
        let run_id_clone = run_id.clone();
        let message_id_clone = message_id.clone();
        let thread_title = thread.title.clone();
        let initial_title_clone = initial_title.clone();
        let is_new_thread_clone = is_new_thread;
        let thinking_override = request.config.as_ref().and_then(|c| c.thinking);

        // Spawn the streaming task
        tokio::spawn(async move {
            if let Err(e) = spawn_chat_stream(
                env,
                tx.clone(),
                content,
                history_messages,
                provider_id,
                model_id,
                thread_id_clone.clone(),
                run_id_clone.clone(),
                message_id_clone,
                thread_title,
                initial_title_clone,
                is_new_thread_clone,
                thinking_override,
            )
            .await
            {
                error!("Chat stream error: {}", e);
                let _ = tx
                    .send(AiStreamEvent::error(
                        &thread_id_clone,
                        &run_id_clone,
                        None,
                        e.code(),
                        &e.to_string(),
                    ))
                    .await;
            }
        });

        // Convert receiver to stream
        let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
        Ok(Box::pin(stream))
    }

    /// List available tool names.
    pub fn list_tools(&self) -> Vec<String> {
        vec![
            "get_holdings".to_string(),
            "get_accounts".to_string(),
            "search_activities".to_string(),
            "get_goals".to_string(),
            "get_valuation_history".to_string(),
            "get_income".to_string(),
            "get_asset_allocation".to_string(),
            "get_performance".to_string(),
            "record_activity".to_string(),
            "import_csv".to_string(),
        ]
    }

    /// Get environment reference.
    pub fn env(&self) -> &Arc<E> {
        &self.env
    }

    /// Update a tool result in a message by merging a patch into the result data.
    ///
    /// This is used by the frontend to persist submission state for mutation tools
    /// (e.g., record_activity). After the user confirms and the activity is created,
    /// the frontend calls this to store the created_activity_id in the tool result.
    ///
    /// The thread_id is used to search for the message containing the tool_call_id.
    pub async fn update_tool_result(
        &self,
        thread_id: &str,
        tool_call_id: &str,
        result_patch: serde_json::Value,
    ) -> Result<ChatMessage, AiError> {
        let repo = self.env.chat_repository();

        // Get all messages in the thread to find the one with this tool call
        let messages = repo.get_messages_by_thread(thread_id)?;

        // Find the message containing this tool_call_id
        let mut target_message: Option<ChatMessage> = None;
        for msg in messages {
            for part in &msg.content.parts {
                if let ChatMessagePart::ToolResult {
                    tool_call_id: ref id,
                    ..
                } = part
                {
                    if id == tool_call_id {
                        target_message = Some(msg);
                        break;
                    }
                }
            }
            if target_message.is_some() {
                break;
            }
        }

        let mut message = target_message.ok_or_else(|| {
            AiError::InvalidInput(format!(
                "Tool result not found for tool_call_id: {}",
                tool_call_id
            ))
        })?;

        // Find and update the tool result part
        for part in &mut message.content.parts {
            if let ChatMessagePart::ToolResult {
                tool_call_id: ref id,
                ref mut data,
                ref mut meta,
                ..
            } = part
            {
                if id == tool_call_id {
                    // Merge the patch into data
                    if let serde_json::Value::Object(patch_obj) = &result_patch {
                        if let serde_json::Value::Object(data_obj) = data {
                            for (key, value) in patch_obj {
                                data_obj.insert(key.clone(), value.clone());
                            }
                        }
                        // Also store in meta for easier access
                        for (key, value) in patch_obj {
                            meta.insert(key.clone(), value.clone());
                        }
                    }
                    break;
                }
            }
        }

        // Save the updated message
        repo.update_message(message).await
    }
}

// ============================================================================
// Spawn Chat Stream
// ============================================================================

/// Context needed for title generation after stream completes.
struct TitleContext<E: AiEnvironment> {
    /// Environment for creating TitleGenerator.
    env: Arc<E>,
    /// Current thread title (None or empty triggers generation).
    current_title: Option<String>,
    /// Deterministic title set at creation (used to avoid overwriting user edits).
    initial_title: Option<String>,
    /// Whether this stream created a new thread.
    is_new_thread: bool,
    /// User message to generate title from.
    user_message: String,
    /// Provider ID to use for title generation.
    provider_id: String,
    /// Model ID being used for chat (fallback for title generation).
    model_id: String,
}

/// Spawn a chat stream with the appropriate provider.
async fn spawn_chat_stream<E: AiEnvironment + 'static>(
    env: Arc<E>,
    tx: mpsc::Sender<AiStreamEvent>,
    user_message: String,
    history_messages: Vec<SimpleChatMessage>,
    provider_id: String,
    model_id: String,
    thread_id: String,
    run_id: String,
    message_id: String,
    thread_title: Option<String>,
    initial_title: Option<String>,
    is_new_thread: bool,
    thinking_override: Option<bool>,
) -> Result<(), AiError> {
    // Send system event first
    tx.send(AiStreamEvent::system(&thread_id, &run_id, &message_id))
        .await
        .map_err(|e| AiError::Internal(e.to_string()))?;

    // Get provider settings and model capabilities
    let provider_service = ProviderService::new(env.clone());
    let api_key = provider_service.get_api_key(&provider_id)?;
    let provider_url = provider_service.get_provider_url(&provider_id);
    let mut capabilities = provider_service.get_model_capabilities(&provider_id, &model_id);

    // Apply thinking override from request if provided
    if let Some(thinking) = thinking_override {
        capabilities.thinking = thinking;
    }

    debug!(
        "Starting chat stream: provider={}, model={}, supports_tools={}, thinking={}",
        provider_id, model_id, capabilities.tools, capabilities.thinking
    );

    // Build preamble - include tool limitation notice if model doesn't support tools
    let base_preamble = include_str!("system_prompt.txt").trim();

    // Build dynamic context
    let base_currency = env.base_currency();
    let current_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let current_datetime = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();

    // Get accounts for context
    let accounts = env
        .account_service()
        .get_active_accounts()
        .unwrap_or_default();
    let account_count = accounts.len();
    let account_list: String = if accounts.is_empty() {
        "No accounts configured.".to_string()
    } else {
        accounts
            .iter()
            .map(|a| format!("- {} ({}): {}", a.name, a.account_type, a.currency))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let dynamic_context = format!(
        "\n\n## Current Context\n\
        - Current date: {}\n\
        - Current datetime: {}\n\
        - Base currency: {}\n\
        - Number of accounts: {}\n\
        - Accounts:\n{}",
        current_date, current_datetime, base_currency, account_count, account_list
    );

    // Build preamble with capability-specific instructions
    let mut preamble = format!("{}{}", base_preamble, dynamic_context);

    // Add tool limitation notice if model doesn't support tools
    if !capabilities.tools {
        preamble.push_str(
            "\n\n## Important Limitation\n\
            You do not have access to tools or function calling. You cannot retrieve real-time \
            portfolio data, account information, or transaction history. When users ask about \
            their specific holdings, accounts, or financial data, politely explain that you \
            cannot access this information with the current model and suggest they switch to \
            a model that supports tools (look for the wrench icon in the model picker).",
        );
    }

    // Create title context for post-stream title generation (clone user_message before move)
    let title_ctx = TitleContext {
        env: env.clone(),
        current_title: thread_title,
        initial_title,
        is_new_thread,
        user_message: user_message.clone(),
        provider_id: provider_id.clone(),
        model_id: model_id.clone(),
    };

    let prompt = Message::User {
        content: OneOrMany::one(UserContent::Text(Text { text: user_message })),
    };

    // Build history from previous messages
    let history: Vec<Message> = history_messages
        .iter()
        .map(|msg| {
            if msg.role.eq_ignore_ascii_case("user") {
                Message::User {
                    content: OneOrMany::one(UserContent::Text(Text {
                        text: msg.content.clone(),
                    })),
                }
            } else {
                Message::Assistant {
                    id: None,
                    content: OneOrMany::one(AssistantContent::Text(Text {
                        text: msg.content.clone(),
                    })),
                }
            }
        })
        .collect();

    // Clone env for repository access in stream_agent_response
    let repo = env.chat_repository();

    // Helper macro to build agent WITH tools and stream
    macro_rules! build_with_tools_and_stream {
        ($client:expr, $thinking_params:expr) => {
            build_with_tools_and_stream!($client, $thinking_params, None::<u64>)
        };
        ($client:expr, $thinking_params:expr, $max_tokens:expr) => {{
            let tools = ToolSet::new(env.clone(), env.base_currency());
            let mut builder = $client
                .agent(&model_id)
                .preamble(&preamble)
                .tool(tools.holdings)
                .tool(tools.accounts)
                .tool(tools.activities)
                .tool(tools.goals)
                .tool(tools.valuation)
                .tool(tools.income)
                .tool(tools.allocation)
                .tool(tools.performance)
                .tool(tools.record_activity)
                .tool(tools.import_csv)
                .tool_choice(ToolChoice::Auto);

            // Ollama cannot enforce tool_choice and some local models are brittle at higher
            // temperatures; use a deterministic temperature to improve tool-call reliability.
            if provider_id == "ollama" {
                builder = builder.temperature(0.0);
            }

            if let Some(tokens) = Into::<Option<u64>>::into($max_tokens) {
                builder = builder.max_tokens(tokens);
            }

            if let Some(params) = $thinking_params {
                builder = builder.additional_params(params);
            }

            let agent = builder.build();
            stream_agent_response(
                agent, prompt, history, tx, repo, thread_id, run_id, message_id, title_ctx,
            )
            .await
        }};
    }

    // Helper macro to build agent WITHOUT tools and stream
    macro_rules! build_without_tools_and_stream {
        ($client:expr, $thinking_params:expr) => {
            build_without_tools_and_stream!($client, $thinking_params, None::<u64>)
        };
        ($client:expr, $thinking_params:expr, $max_tokens:expr) => {{
            let mut builder = $client.agent(&model_id).preamble(&preamble);

            if let Some(tokens) = Into::<Option<u64>>::into($max_tokens) {
                builder = builder.max_tokens(tokens);
            }

            if let Some(params) = $thinking_params {
                builder = builder.additional_params(params);
            }

            let agent = builder.build();
            stream_agent_response(
                agent, prompt, history, tx, repo, thread_id, run_id, message_id, title_ctx,
            )
            .await
        }};
    }

    // Provider-specific reasoning params using rig-core native types where available:
    // - Groq: GroqAdditionalParameters with reasoning_format OR include_reasoning (mutually exclusive!)
    //   Note: gpt-oss models don't support reasoning_format - they include reasoning by default
    // - Ollama: Raw JSON with think: true/false
    // - Gemini: GenerationConfig with ThinkingConfig
    // - Anthropic: Raw JSON (no native rig-core struct)
    // - OpenAI: Raw JSON (Reasoning struct is for responses_api only)
    let is_groq_gpt_oss = model_id.contains("gpt-oss");

    // Groq params: reasoning_format and include_reasoning are MUTUALLY EXCLUSIVE
    // For gpt-oss models: don't send reasoning_format (not supported), reasoning is on by default
    // For reasoning-capable models: use reasoning_format to control output format
    // For non-reasoning models (compound, etc.): don't send any reasoning params
    let groq_reasoning_params_with_tools: Option<serde_json::Value> = if is_groq_gpt_oss {
        // gpt-oss models don't support reasoning_format, reasoning is included by default
        // When tools are used, reasoning is automatically hidden in the response
        None
    } else if capabilities.thinking {
        // Use reasoning_format only (not include_reasoning) - they're mutually exclusive
        serde_json::to_value(GroqAdditionalParameters {
            reasoning_format: Some(ReasoningFormat::Hidden), // Model reasons but output hidden with tools
            include_reasoning: None,
            extra: None,
        })
        .ok()
    } else {
        // Non-reasoning models don't support reasoning params at all
        None
    };

    let groq_reasoning_params_no_tools: Option<serde_json::Value> = if is_groq_gpt_oss {
        // gpt-oss models include reasoning by default in the reasoning field
        None
    } else if capabilities.thinking {
        // Use reasoning_format only (not include_reasoning) - they're mutually exclusive
        serde_json::to_value(GroqAdditionalParameters {
            reasoning_format: Some(ReasoningFormat::Parsed), // Reasoning exposed in response
            include_reasoning: None,
            extra: None,
        })
        .ok()
    } else {
        // Non-reasoning models don't support reasoning params at all
        None
    };

    // Ollama: pass think parameter to enable/disable thinking mode
    // When false, models like qwen3 and deepseek-r1 skip chain-of-thought reasoning
    // Note: Some models may ignore the API parameter and still emit thinking.
    let ollama_thinking_params: Option<serde_json::Value> = Some(serde_json::json!({
        "think": capabilities.thinking
    }));

    // Anthropic: extended thinking with budget_tokens
    // Only enable thinking when capabilities.thinking is true
    let anthropic_thinking_params: Option<serde_json::Value> = if capabilities.thinking {
        Some(serde_json::json!({
            "thinking": {
                "type": "enabled",
                "budget_tokens": 8000
            }
        }))
    } else {
        None
    };
    // Anthropic requires max_tokens on the CompletionRequest (not in additional_params).
    // With thinking enabled, budget_tokens counts against max_tokens so it must be larger.
    let anthropic_max_tokens: u64 = if capabilities.thinking { 16000 } else { 8096 };

    // OpenAI: reasoning_effort for o1/o3 models
    // NOTE: Reasoning with tool calls causes "reasoning item without required following item" errors
    // in multi-turn conversations. Only enable reasoning when NOT using tools.
    // See: https://community.openai.com/t/error-badrequesterror-400-item-of-type-reasoning-was-provided-without-its-required-following-item/1303809
    let openai_thinking_params_no_tools: Option<serde_json::Value> = if capabilities.thinking {
        Some(serde_json::json!({
            "reasoning_effort": "medium"
        }))
    } else {
        None // Don't send reasoning_effort when thinking disabled
    };

    // Gemini: Only pass thinking_config to avoid sending unsupported fields.
    // The full GenerationConfig struct includes fields (temperature, maxOutputTokens)
    // that may not be accepted by all Gemini API versions/models.
    let gemini_thinking_params: Option<serde_json::Value> = if capabilities.thinking {
        // Enable thinking with a reasonable budget
        Some(serde_json::json!({
            "thinking_config": {
                "thinking_budget": 8192,
                "include_thoughts": true
            }
        }))
    } else {
        // Don't send thinking_config at all when disabled - simpler and avoids API issues
        None
    };

    // Route to provider with tool support check
    if capabilities.tools {
        match provider_id.as_str() {
            "anthropic" => {
                let client = create_anthropic_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client, anthropic_thinking_params.clone(), Some(anthropic_max_tokens))
            }
            "gemini" | "google" => {
                let client = create_gemini_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client, gemini_thinking_params.clone())
            }
            "groq" => {
                let client = create_groq_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client, groq_reasoning_params_with_tools.clone())
            }
            "ollama" => {
                let client = create_ollama_client(provider_url)?;
                build_with_tools_and_stream!(client, ollama_thinking_params.clone())
            }
            "openai" => {
                // Don't pass reasoning params with tools - causes multi-turn errors
                let client = create_openai_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client, None::<serde_json::Value>)
            }
            "openrouter" => {
                let client = create_openrouter_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client, None::<serde_json::Value>)
            }
            _ => {
                let client = create_openai_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client, None::<serde_json::Value>)
            }
        }
    } else {
        match provider_id.as_str() {
            "anthropic" => {
                let client = create_anthropic_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client, anthropic_thinking_params.clone(), Some(anthropic_max_tokens))
            }
            "gemini" | "google" => {
                let client = create_gemini_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client, gemini_thinking_params.clone())
            }
            "groq" => {
                let client = create_groq_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client, groq_reasoning_params_no_tools.clone())
            }
            "ollama" => {
                let client = create_ollama_client(provider_url)?;
                build_without_tools_and_stream!(client, ollama_thinking_params.clone())
            }
            "openai" => {
                // Reasoning params OK without tools
                let client = create_openai_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client, openai_thinking_params_no_tools.clone())
            }
            "openrouter" => {
                let client = create_openrouter_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client, None::<serde_json::Value>)
            }
            _ => {
                let client = create_openai_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client, None::<serde_json::Value>)
            }
        }
    }
}

// ============================================================================
// Provider Client Factories
// ============================================================================

fn create_anthropic_client(
    api_key: Option<String>,
    provider_id: &str,
) -> Result<anthropic::Client<HttpClient>, AiError> {
    let key = api_key.ok_or_else(|| AiError::MissingApiKey(provider_id.to_string()))?;
    anthropic::Client::new(&key).map_err(|e| AiError::Provider(e.to_string()))
}

fn create_gemini_client(
    api_key: Option<String>,
    provider_id: &str,
) -> Result<gemini::Client<HttpClient>, AiError> {
    let key = api_key.ok_or_else(|| AiError::MissingApiKey(provider_id.to_string()))?;
    gemini::Client::new(&key).map_err(|e| AiError::Provider(e.to_string()))
}

fn create_groq_client(
    api_key: Option<String>,
    provider_id: &str,
) -> Result<groq::Client<HttpClient>, AiError> {
    let key = api_key.ok_or_else(|| AiError::MissingApiKey(provider_id.to_string()))?;
    groq::Client::new(&key).map_err(|e| AiError::Provider(e.to_string()))
}

/// Create OpenAI client using Completions API (not Responses API).
/// Responses API has issues with reasoning items in multi-turn conversations.
/// See: https://community.openai.com/t/error-badrequesterror-400-item-of-type-reasoning-was-provided-without-its-required-following-item/1303809
fn create_openai_client(
    api_key: Option<String>,
    provider_id: &str,
) -> Result<openai::CompletionsClient<HttpClient>, AiError> {
    let key = api_key.ok_or_else(|| AiError::MissingApiKey(provider_id.to_string()))?;
    openai::CompletionsClient::builder()
        .api_key(&key)
        .build()
        .map_err(|e| AiError::Provider(e.to_string()))
}

fn create_openrouter_client(
    api_key: Option<String>,
    provider_id: &str,
) -> Result<openrouter::Client<HttpClient>, AiError> {
    let key = api_key.ok_or_else(|| AiError::MissingApiKey(provider_id.to_string()))?;
    openrouter::Client::new(&key).map_err(|e| AiError::Provider(e.to_string()))
}

fn create_ollama_client(
    provider_url: Option<String>,
) -> Result<ollama::Client<HttpClient>, AiError> {
    let mut builder = ollama::Client::builder().api_key(Nothing);
    if let Some(url) = provider_url {
        builder = builder.base_url(&url);
    }
    builder
        .build()
        .map_err(|e| AiError::Provider(e.to_string()))
}

// ============================================================================
// Think Tag Parser (fallback for models that output <think> tags in text)
// ============================================================================

/// Lightweight parser for `<think>` tags in streamed text.
/// Only performs string operations when potential tags are detected.
#[derive(Default)]
struct ThinkTagParser {
    buffer: String,
    in_think_block: bool,
    accumulated_reasoning: String,
}

impl ThinkTagParser {
    /// Process text delta, returns (text_to_emit, reasoning_to_emit).
    fn process(&mut self, delta: &str) -> (String, String) {
        // Fast path: no potential tags and not in a think block
        if !self.in_think_block && !delta.contains('<') && self.buffer.is_empty() {
            return (delta.to_string(), String::new());
        }

        self.buffer.push_str(delta);
        let mut text_out = String::new();
        let mut reasoning_out = String::new();

        loop {
            if self.in_think_block {
                if let Some(end_idx) = self.buffer.find("</think>") {
                    reasoning_out.push_str(&self.buffer[..end_idx]);
                    self.accumulated_reasoning.push_str(&self.buffer[..end_idx]);
                    self.buffer = self.buffer[end_idx + 8..].to_string();
                    self.in_think_block = false;
                } else if self.buffer.len() > 8
                    && !self.buffer.ends_with('<')
                    && !self.buffer.ends_with("</")
                {
                    // Safe to emit most of the buffer as reasoning
                    let safe_len = self.buffer.len().saturating_sub(8);
                    reasoning_out.push_str(&self.buffer[..safe_len]);
                    self.accumulated_reasoning
                        .push_str(&self.buffer[..safe_len]);
                    self.buffer = self.buffer[safe_len..].to_string();
                    break;
                } else {
                    break;
                }
            } else if let Some(start_idx) = self.buffer.find("<think>") {
                text_out.push_str(&self.buffer[..start_idx]);
                self.buffer = self.buffer[start_idx + 7..].to_string();
                self.in_think_block = true;
            } else if self.buffer.len() > 7 && !self.buffer.ends_with('<') {
                // Safe to emit most of the buffer as text
                let safe_len = self.buffer.len().saturating_sub(7);
                text_out.push_str(&self.buffer[..safe_len]);
                self.buffer = self.buffer[safe_len..].to_string();
                break;
            } else {
                break;
            }
        }

        (text_out, reasoning_out)
    }

    /// Flush remaining buffer at end of stream.
    fn flush(&mut self) -> (String, String) {
        if self.in_think_block {
            self.accumulated_reasoning.push_str(&self.buffer);
            (String::new(), std::mem::take(&mut self.buffer))
        } else {
            (std::mem::take(&mut self.buffer), String::new())
        }
    }

    /// Get total accumulated reasoning.
    fn reasoning(&self) -> &str {
        &self.accumulated_reasoning
    }
}

// ============================================================================
// Stream Agent Response
// ============================================================================

/// Stream responses from a rig agent, converting to AiStreamEvent.
async fn stream_agent_response<M: CompletionModel + 'static, E: AiEnvironment + 'static>(
    agent: Agent<M>,
    prompt: Message,
    history: Vec<Message>,
    tx: mpsc::Sender<AiStreamEvent>,
    repo: Arc<dyn ChatRepositoryTrait>,
    thread_id: String,
    run_id: String,
    message_id: String,
    title_ctx: TitleContext<E>,
) -> Result<(), AiError> {
    // Start multi-turn streaming (up to 6 tool rounds)
    let mut stream = agent.stream_chat(prompt, history).multi_turn(6).await;

    // Generate/refine title concurrently so it can update the UI during streaming.
    let should_attempt_title = title_ctx.is_new_thread
        || title_ctx
            .current_title
            .as_deref()
            .map(str::trim)
            .map(str::is_empty)
            .unwrap_or(true);

    if should_attempt_title {
        let thread_id_bg = thread_id.clone();
        let run_id_bg = run_id.clone();
        let tx_bg = tx.clone();
        let repo_bg = repo.clone();
        let env_bg = title_ctx.env.clone();
        let user_message_bg = title_ctx.user_message.clone();
        let provider_id_bg = title_ctx.provider_id.clone();
        let model_id_bg = title_ctx.model_id.clone();
        let initial_title_bg = title_ctx.initial_title.clone();

        tokio::spawn(async move {
            debug!("Generating title for thread {} (concurrent)", thread_id_bg);
            let title_gen = TitleGenerator::new(env_bg, TitleGeneratorConfig::default());
            let new_title = title_gen
                .generate_title(&user_message_bg, &provider_id_bg, &model_id_bg)
                .await;

            let next_title = new_title.trim();
            if next_title.is_empty() {
                return;
            }

            let Ok(Some(thread)) = repo_bg.get_thread(&thread_id_bg) else {
                return;
            };

            let current_title_trimmed = thread.title.as_deref().unwrap_or("").trim();
            let should_update = if let Some(initial) = initial_title_bg.as_deref() {
                // New thread: only refine if user hasn't renamed it.
                current_title_trimmed.is_empty() || current_title_trimmed == initial.trim()
            } else {
                // Existing thread: only fill missing title.
                current_title_trimmed.is_empty()
            };

            if !should_update {
                return;
            }

            if current_title_trimmed == next_title {
                return;
            }

            let updated_thread = ChatThread {
                title: Some(next_title.to_string()),
                updated_at: chrono::Utc::now(),
                ..thread
            };

            if repo_bg.update_thread(updated_thread).await.is_ok() {
                let _ = tx_bg
                    .send(AiStreamEvent::thread_title_updated(
                        &thread_id_bg,
                        &run_id_bg,
                        next_title,
                    ))
                    .await;
            }
        });
    }

    // Track content parts for final message
    let mut content_parts: Vec<ChatMessagePart> = vec![];
    let mut accumulated_text = String::new();
    let mut accumulated_reasoning = String::new();

    // Parser for <think> tags (fallback for models that don't use native thinking API)
    let mut think_parser = ThinkTagParser::default();

    while let Some(chunk) = stream.next().await {
        match chunk {
            // Text streaming - parse for <think> tags as fallback
            Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Text(
                Text { text },
            ))) => {
                if !text.is_empty() {
                    // Parse <think> tags and emit reasoning (models should not think if disabled via API)
                    let (text_out, reasoning_out) = think_parser.process(&text);

                    // Emit reasoning if extracted from <think> tags
                    if !reasoning_out.is_empty() {
                        tx.send(AiStreamEvent::reasoning_delta(
                            &thread_id,
                            &run_id,
                            &message_id,
                            &reasoning_out,
                        ))
                        .await
                        .map_err(|e| AiError::Internal(e.to_string()))?;
                    }

                    // Emit text content
                    if !text_out.is_empty() {
                        accumulated_text.push_str(&text_out);
                        tx.send(AiStreamEvent::text_delta(
                            &thread_id,
                            &run_id,
                            &message_id,
                            &text_out,
                        ))
                        .await
                        .map_err(|e| AiError::Internal(e.to_string()))?;
                    }
                }
            }

            // Reasoning/thinking streaming (provider-native)
            Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Reasoning(
                Reasoning { reasoning, .. },
            ))) => {
                if !reasoning.is_empty() {
                    let reasoning_text = reasoning.join(" ");
                    content_parts.push(ChatMessagePart::Reasoning {
                        content: reasoning_text.clone(),
                    });
                    tx.send(AiStreamEvent::reasoning_delta(
                        &thread_id,
                        &run_id,
                        &message_id,
                        &reasoning_text,
                    ))
                    .await
                    .map_err(|e| AiError::Internal(e.to_string()))?;
                }
            }

            // Reasoning delta (provider-native streaming)
            Ok(MultiTurnStreamItem::StreamAssistantItem(
                StreamedAssistantContent::ReasoningDelta { reasoning, .. },
            )) => {
                if !reasoning.is_empty() {
                    accumulated_reasoning.push_str(&reasoning);
                    tx.send(AiStreamEvent::reasoning_delta(
                        &thread_id,
                        &run_id,
                        &message_id,
                        &reasoning,
                    ))
                    .await
                    .map_err(|e| AiError::Internal(e.to_string()))?;
                }
            }

            // Tool call
            Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::ToolCall {
                tool_call: RigToolCall { id, function, .. },
                ..
            })) => {
                // Flush any accumulated text BEFORE the tool call to preserve order
                if !accumulated_text.is_empty() {
                    content_parts.push(ChatMessagePart::Text {
                        content: std::mem::take(&mut accumulated_text),
                    });
                }

                let args: serde_json::Value =
                    serde_json::from_str(&function.arguments.to_string()).unwrap_or_default();

                content_parts.push(ChatMessagePart::ToolCall {
                    tool_call_id: id.clone(),
                    name: function.name.clone(),
                    arguments: args.clone(),
                });

                tx.send(AiStreamEvent::tool_call(
                    &thread_id,
                    &run_id,
                    &message_id,
                    ToolCall {
                        id: id.clone(),
                        name: function.name.clone(),
                        arguments: args,
                    },
                ))
                .await
                .map_err(|e| AiError::Internal(e.to_string()))?;
            }

            // Tool call delta (provider-native)
            Ok(MultiTurnStreamItem::StreamAssistantItem(
                StreamedAssistantContent::ToolCallDelta { .. },
            )) => {
                // Tool call deltas are handled by providers that stream tool args incrementally.
                // We currently rely on full ToolCall items for execution.
            }

            // Provider-specific final payload
            Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Final(_))) => {
                // No-op: FinalResponse is handled separately; some providers emit a final payload here.
            }

            // Tool result
            Ok(MultiTurnStreamItem::StreamUserItem(StreamedUserContent::ToolResult {
                tool_result,
                ..
            })) => {
                let content_to_string = |content: ToolResultContent| -> String {
                    match content {
                        ToolResultContent::Text(Text { text }) => text,
                        ToolResultContent::Image(image) => image.try_into_url().unwrap_or_default(),
                    }
                };

                let result_text = tool_result
                    .content
                    .into_iter()
                    .map(content_to_string)
                    .collect::<Vec<_>>()
                    .join("\n");

                // Parse result as JSON for structured data
                let data: serde_json::Value =
                    serde_json::from_str(&result_text).unwrap_or(serde_json::json!(result_text));

                content_parts.push(ChatMessagePart::ToolResult {
                    tool_call_id: tool_result.id.clone(),
                    success: true,
                    data: data.clone(),
                    meta: std::collections::HashMap::new(),
                    error: None,
                });

                tx.send(AiStreamEvent::tool_result(
                    &thread_id,
                    &run_id,
                    &message_id,
                    ToolResultData {
                        tool_call_id: tool_result.id,
                        success: true,
                        data,
                        meta: std::collections::HashMap::new(),
                        error: None,
                    },
                ))
                .await
                .map_err(|e| AiError::Internal(e.to_string()))?;
            }

            // Final response - use if no meaningful text was accumulated (some providers like Gemini
            // may not stream text deltas for tool-calling responses, and Ollama/DeepSeek may
            // send reasoning natively without streaming text deltas)
            Ok(MultiTurnStreamItem::FinalResponse(final_response)) => {
                let response_text = final_response.response().to_string();
                // Use trim() to handle cases where only whitespace was accumulated
                if accumulated_text.trim().is_empty() && !response_text.trim().is_empty() {
                    accumulated_text = response_text.clone();
                    tx.send(AiStreamEvent::text_delta(
                        &thread_id,
                        &run_id,
                        &message_id,
                        &response_text,
                    ))
                    .await
                    .map_err(|e| AiError::Internal(e.to_string()))?;
                }
            }

            // Other stream items - ignore
            Ok(_) => {}

            // Errors
            Err(error) => {
                error!("Stream error: {}", error);
                tx.send(AiStreamEvent::error(
                    &thread_id,
                    &run_id,
                    Some(&message_id),
                    "STREAM_ERROR",
                    &error.to_string(),
                ))
                .await
                .map_err(|e| AiError::Internal(e.to_string()))?;
                return Err(AiError::Provider(error.to_string()));
            }
        }
    }

    // Flush any remaining buffered content from the think parser
    let (remaining_text, remaining_reasoning) = think_parser.flush();
    if !remaining_reasoning.is_empty() {
        tx.send(AiStreamEvent::reasoning_delta(
            &thread_id,
            &run_id,
            &message_id,
            &remaining_reasoning,
        ))
        .await
        .map_err(|e| AiError::Internal(e.to_string()))?;
    }
    if !remaining_text.is_empty() {
        accumulated_text.push_str(&remaining_text);
        tx.send(AiStreamEvent::text_delta(
            &thread_id,
            &run_id,
            &message_id,
            &remaining_text,
        ))
        .await
        .map_err(|e| AiError::Internal(e.to_string()))?;
    }

    // Add reasoning parsed from <think> tags to content parts
    let parsed_reasoning = think_parser.reasoning();
    if !parsed_reasoning.is_empty() {
        content_parts.insert(
            0,
            ChatMessagePart::Reasoning {
                content: parsed_reasoning.to_string(),
            },
        );
    }

    if !accumulated_reasoning.is_empty() {
        content_parts.push(ChatMessagePart::Reasoning {
            content: accumulated_reasoning,
        });
    }

    // Push any remaining accumulated text at the END to preserve interleaved order
    // (text before tool calls was already flushed when tool calls arrived)
    if !accumulated_text.is_empty() {
        content_parts.push(ChatMessagePart::Text {
            content: accumulated_text,
        });
    }

    // Build final message
    let mut final_message = ChatMessage::assistant_with_id(&message_id, &thread_id);
    final_message.content = ChatMessageContent::new(content_parts);

    // Save assistant message to repository after stream completes
    if let Err(e) = repo.create_message(final_message.clone()).await {
        error!("Failed to save assistant message to repository: {}", e);
        // Continue anyway - the message was streamed successfully
    }

    // Send done event - this is the terminal event, stream closes after this
    tx.send(AiStreamEvent::done(
        &thread_id,
        &run_id,
        final_message,
        None,
    ))
    .await
    .map_err(|e| AiError::Internal(e.to_string()))?;

    Ok(())
}

// ============================================================================
// History Building (for future use)
// ============================================================================

/// Build rig Message history from SimpleChatMessage list.
#[allow(dead_code)]
fn build_history(messages: &[SimpleChatMessage]) -> Result<(Message, Vec<Message>), AiError> {
    let Some(last_user_index) = messages
        .iter()
        .rposition(|msg| msg.role.eq_ignore_ascii_case("user"))
    else {
        return Err(AiError::InvalidInput(
            "A user message is required to start the chat".to_string(),
        ));
    };

    let prompt_content = messages
        .get(last_user_index)
        .map(|msg| msg.content.clone())
        .unwrap_or_default();

    let prompt = Message::User {
        content: OneOrMany::one(UserContent::Text(Text {
            text: prompt_content,
        })),
    };

    let mut history = Vec::new();

    for (idx, msg) in messages.iter().enumerate() {
        if idx == last_user_index {
            continue;
        }

        match msg.role.as_str() {
            role if role.eq_ignore_ascii_case("user") => {
                history.push(Message::User {
                    content: OneOrMany::one(UserContent::Text(Text {
                        text: msg.content.clone(),
                    })),
                });
            }
            role if role.eq_ignore_ascii_case("assistant") => {
                history.push(Message::Assistant {
                    id: None,
                    content: OneOrMany::one(AssistantContent::Text(Text {
                        text: msg.content.clone(),
                    })),
                });
            }
            _ => {}
        }
    }

    Ok((prompt, history))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_chat_service_create_thread() {
        let env = Arc::new(MockEnvironment::new());
        let service = ChatService::new(env, ChatConfig::default());

        let thread = service.create_thread().await.unwrap();
        assert!(!thread.id.is_empty());
    }

    #[tokio::test]
    async fn test_chat_service_create_and_get_thread() {
        let env = Arc::new(MockEnvironment::new());
        let service = ChatService::new(env, ChatConfig::default());

        let thread = service.create_thread().await.unwrap();
        let thread_id = thread.id.clone();

        let retrieved = service.get_thread(&thread_id).unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().id, thread_id);
    }

    #[test]
    fn test_chat_service_list_tools() {
        let env = Arc::new(MockEnvironment::new());
        let service = ChatService::new(env, ChatConfig::default());

        let tools = service.list_tools();
        assert!(tools.contains(&"get_accounts".to_string()));
        assert!(tools.contains(&"get_holdings".to_string()));
    }

    #[tokio::test]
    async fn test_chat_service_update_thread_title() {
        let env = Arc::new(MockEnvironment::new());
        let service = ChatService::new(env, ChatConfig::default());

        let thread = service.create_thread().await.unwrap();
        let thread_id = thread.id.clone();

        let updated = service
            .update_thread_title(&thread_id, "New Title".to_string())
            .await
            .unwrap();
        assert_eq!(updated.title, Some("New Title".to_string()));

        // Verify it persists
        let retrieved = service.get_thread(&thread_id).unwrap().unwrap();
        assert_eq!(retrieved.title, Some("New Title".to_string()));
    }

    #[tokio::test]
    async fn test_chat_service_delete_thread() {
        let env = Arc::new(MockEnvironment::new());
        let service = ChatService::new(env, ChatConfig::default());

        let thread = service.create_thread().await.unwrap();
        let thread_id = thread.id.clone();

        service.delete_thread(&thread_id).await.unwrap();

        let retrieved = service.get_thread(&thread_id).unwrap();
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_chat_service_list_threads() {
        let env = Arc::new(MockEnvironment::new());
        let service = ChatService::new(env, ChatConfig::default());

        // Create a few threads
        service.create_thread().await.unwrap();
        service.create_thread().await.unwrap();
        service.create_thread().await.unwrap();

        let threads = service.list_threads(10, 0).unwrap();
        assert_eq!(threads.len(), 3);
    }

    #[test]
    fn test_build_history() {
        let messages = vec![
            SimpleChatMessage::user("Hello"),
            SimpleChatMessage::assistant("Hi there!"),
            SimpleChatMessage::user("How are you?"),
        ];

        let result = build_history(&messages);
        assert!(result.is_ok());

        let (prompt, history) = result.unwrap();
        assert!(matches!(prompt, Message::User { .. }));
        assert_eq!(history.len(), 2);
    }
}
