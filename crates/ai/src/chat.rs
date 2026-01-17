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
    message::{AssistantContent, Reasoning, Text, ToolCall as RigToolCall, ToolChoice, ToolResultContent, UserContent},
    providers::{anthropic, gemini, groq, ollama, openai},
    streaming::{StreamedAssistantContent, StreamedUserContent, StreamingChat},
    OneOrMany,
};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::env::AiEnvironment;
use crate::error::AiError;
use crate::providers::ProviderService;
use crate::title_generator::{TitleGenerator, TitleGeneratorConfig, TitleGeneratorTrait};
use crate::tools::ToolSet;
use crate::types::{
    AiStreamEvent, ChatMessage, ChatMessageContent, ChatMessagePart, ChatMessageRole, ChatRepositoryTrait, ChatThread,
    ListThreadsRequest, SendMessageRequest, SimpleChatMessage, ThreadPage, ToolCall, ToolResultData,
};

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
    pub fn list_threads_paginated(&self, request: &ListThreadsRequest) -> Result<ThreadPage, AiError> {
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
        let thread = match &request.thread_id {
            Some(id) => repo
                .get_thread(id)?
                .ok_or_else(|| AiError::ThreadNotFound(id.clone()))?,
            None => {
                let new_thread = ChatThread::new();
                repo.create_thread(new_thread).await?
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
            "get_dividends".to_string(),
            "get_asset_allocation".to_string(),
            "get_performance".to_string(),
        ]
    }

    /// Get environment reference.
    pub fn env(&self) -> &Arc<E> {
        &self.env
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
) -> Result<(), AiError> {
    // Send system event first
    tx.send(AiStreamEvent::system(&thread_id, &run_id, &message_id))
        .await
        .map_err(|e| AiError::Internal(e.to_string()))?;

    // Get provider settings and model capabilities
    let provider_service = ProviderService::new(env.clone());
    let api_key = provider_service.get_api_key(&provider_id)?;
    let provider_url = provider_service.get_provider_url(&provider_id);
    let capabilities = provider_service.get_model_capabilities(&provider_id, &model_id);

    debug!(
        "Starting chat stream: provider={}, model={}, supports_tools={}",
        provider_id, model_id, capabilities.tools
    );

    // Build preamble - include tool limitation notice if model doesn't support tools
    let base_preamble = include_str!("system_prompt.txt").trim();
    let preamble = if capabilities.tools {
        base_preamble.to_string()
    } else {
        format!(
            "{}\n\n## Important Limitation\n\
            You do not have access to tools or function calling. You cannot retrieve real-time \
            portfolio data, account information, or transaction history. When users ask about \
            their specific holdings, accounts, or financial data, politely explain that you \
            cannot access this information with the current model and suggest they switch to \
            a model that supports tools (look for the wrench icon in the model picker).",
            base_preamble
        )
    };

    // Create title context for post-stream title generation (clone user_message before move)
    let title_ctx = TitleContext {
        env: env.clone(),
        current_title: thread_title,
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
        ($client:expr) => {{
            let tools = ToolSet::new(env.clone(), env.base_currency());
            let agent = $client
                .agent(&model_id)
                .preamble(&preamble)
                .tool(tools.holdings)
                .tool(tools.accounts)
                .tool(tools.activities)
                .tool(tools.goals)
                .tool(tools.valuation)
                .tool(tools.dividends)
                .tool(tools.allocation)
                .tool(tools.performance)
                .tool_choice(ToolChoice::Auto)
                .build();

            stream_agent_response(agent, prompt, history, tx, repo, thread_id, run_id, message_id, title_ctx).await
        }};
    }

    // Helper macro to build agent WITHOUT tools and stream
    macro_rules! build_without_tools_and_stream {
        ($client:expr) => {{
            let agent = $client.agent(&model_id).preamble(&preamble).build();

            stream_agent_response(agent, prompt, history, tx, repo, thread_id, run_id, message_id, title_ctx).await
        }};
    }

    // Route to provider with tool support check
    if capabilities.tools {
        match provider_id.as_str() {
            "anthropic" => {
                let client = create_anthropic_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client)
            }
            "gemini" | "google" => {
                let client = create_gemini_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client)
            }
            "groq" => {
                let client = create_groq_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client)
            }
            "ollama" => {
                let client = create_ollama_client(provider_url)?;
                build_with_tools_and_stream!(client)
            }
            _ => {
                let client = create_openai_client(api_key, &provider_id)?;
                build_with_tools_and_stream!(client)
            }
        }
    } else {
        match provider_id.as_str() {
            "anthropic" => {
                let client = create_anthropic_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client)
            }
            "gemini" | "google" => {
                let client = create_gemini_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client)
            }
            "groq" => {
                let client = create_groq_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client)
            }
            "ollama" => {
                let client = create_ollama_client(provider_url)?;
                build_without_tools_and_stream!(client)
            }
            _ => {
                let client = create_openai_client(api_key, &provider_id)?;
                build_without_tools_and_stream!(client)
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

fn create_openai_client(
    api_key: Option<String>,
    provider_id: &str,
) -> Result<openai::Client<HttpClient>, AiError> {
    let key = api_key.ok_or_else(|| AiError::MissingApiKey(provider_id.to_string()))?;
    openai::Client::new(&key).map_err(|e| AiError::Provider(e.to_string()))
}

fn create_ollama_client(provider_url: Option<String>) -> Result<ollama::Client<HttpClient>, AiError> {
    let mut builder = ollama::Client::builder().api_key(Nothing);
    if let Some(url) = provider_url {
        builder = builder.base_url(&url);
    }
    builder.build().map_err(|e| AiError::Provider(e.to_string()))
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

    // Track content parts for final message
    let mut content_parts: Vec<ChatMessagePart> = vec![];
    let mut accumulated_text = String::new();
    let mut has_streamed_text = false;

    while let Some(chunk) = stream.next().await {
        match chunk {
            // Text streaming
            Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Text(
                Text { text },
            ))) => {
                if !text.is_empty() {
                    has_streamed_text = true;
                    accumulated_text.push_str(&text);
                    tx.send(AiStreamEvent::text_delta(&thread_id, &run_id, &message_id, &text))
                        .await
                        .map_err(|e| AiError::Internal(e.to_string()))?;
                }
            }

            // Reasoning/thinking streaming
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

            // Tool call
            Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::ToolCall(
                RigToolCall { id, function, .. },
            ))) => {
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

            // Tool result
            Ok(MultiTurnStreamItem::StreamUserItem(StreamedUserContent::ToolResult(
                tool_result,
            ))) => {
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

            // Final response
            Ok(MultiTurnStreamItem::FinalResponse(final_response)) => {
                let response_text = final_response.response().to_string();
                if !has_streamed_text && !response_text.is_empty() {
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

            // Other items (ignore)
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

    // Add accumulated text to content parts
    if !accumulated_text.is_empty() {
        content_parts.insert(
            0,
            ChatMessagePart::Text {
                content: accumulated_text,
            },
        );
    }

    // Build final message
    let mut final_message = ChatMessage::assistant_with_id(&message_id, &thread_id);
    final_message.content = ChatMessageContent::new(content_parts);

    // Save assistant message to repository after stream completes
    if let Err(e) = repo.create_message(final_message.clone()).await {
        error!("Failed to save assistant message to repository: {}", e);
        // Continue anyway - the message was streamed successfully
    }

    // Generate title if thread has no title (new thread)
    // Do this BEFORE sending done event so frontend receives title update
    let needs_title = title_ctx
        .current_title
        .as_ref()
        .map(|t| t.is_empty())
        .unwrap_or(true);

    if needs_title {
        debug!("Generating title for thread {}", thread_id);
        let title_gen = TitleGenerator::new(title_ctx.env.clone(), TitleGeneratorConfig::default());
        let new_title = title_gen
            .generate_title(&title_ctx.user_message, &title_ctx.provider_id, &title_ctx.model_id)
            .await;

        // Update title in repository
        let thread = repo.get_thread(&thread_id)?;
        if let Some(thread) = thread {
            let updated_thread = ChatThread {
                title: Some(new_title.clone()),
                updated_at: chrono::Utc::now(),
                ..thread
            };
            if let Err(e) = repo.update_thread(updated_thread).await {
                error!("Failed to update thread title: {}", e);
            } else {
                // Send title update event BEFORE done
                let _ = tx
                    .send(AiStreamEvent::thread_title_updated(&thread_id, &new_title))
                    .await;
            }
        }
    }

    // Send done event LAST - this is the terminal event
    tx.send(AiStreamEvent::done(&thread_id, &run_id, final_message, None))
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
