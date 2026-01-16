//! AI Chat Tauri commands for streaming responses and thread management.
//!
//! Uses Tauri's IPC Channel for efficient streaming of AI events.

use std::sync::Arc;

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, State};
use wealthfolio_ai_assistant::types::{AiAssistantError, AiStreamEvent, SendMessageRequest};
use wealthfolio_core::ai::{AiChatRepositoryTrait, AiThread};

use crate::context::ServiceContext;

use super::error::CommandResult;

/// Request for updating thread title or pinned status.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateThreadRequest {
    pub id: String,
    pub title: Option<String>,
    pub is_pinned: Option<bool>,
}

/// Stream a chat message and receive AI events through a Tauri Channel.
///
/// The channel will receive `AiStreamEvent` objects:
/// - `system`: Initial event with thread_id, run_id, message_id
/// - `textDelta`: Partial text content
/// - `reasoningDelta`: Optional reasoning/thinking content
/// - `toolCall`: Tool invocation request
/// - `toolResult`: Tool execution result
/// - `error`: Error event
/// - `done`: Terminal event with final message
///
/// Returns Ok(()) when the stream completes successfully.
#[tauri::command]
pub async fn stream_ai_chat(
    context: State<'_, Arc<ServiceContext>>,
    request: SendMessageRequest,
    on_event: Channel<AiStreamEvent>,
) -> CommandResult<()> {
    let service = context
        .ai_assistant_service()
        .ok_or_else(|| AiAssistantError::ProviderNotConfigured {
            provider_id: "default".to_string(),
        })?;

    let mut event_stream = service.send_message(request).await?;

    // Stream events to the frontend via the Tauri channel
    while let Some(event) = event_stream.next().await {
        if let Err(e) = on_event.send(event) {
            log::error!("Failed to send AI event to channel: {}", e);
            break;
        }
    }

    Ok(())
}

// ============================================================================
// Thread Management Commands
// ============================================================================

/// List all chat threads, sorted by pinned status then updated_at.
#[tauri::command]
pub async fn list_ai_threads(
    context: State<'_, Arc<ServiceContext>>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> CommandResult<Vec<AiThread>> {
    let repo = context.ai_chat_repository();
    let threads = repo.list_threads(limit.unwrap_or(100), offset.unwrap_or(0))?;
    Ok(threads)
}

/// Get a single chat thread by ID.
#[tauri::command]
pub async fn get_ai_thread(
    context: State<'_, Arc<ServiceContext>>,
    thread_id: String,
) -> CommandResult<Option<AiThread>> {
    let repo = context.ai_chat_repository();
    let thread = repo.get_thread(&thread_id)?;
    Ok(thread)
}

/// Update a chat thread's title and/or pinned status.
#[tauri::command]
pub async fn update_ai_thread(
    context: State<'_, Arc<ServiceContext>>,
    request: UpdateThreadRequest,
) -> CommandResult<AiThread> {
    let repo = context.ai_chat_repository();

    // Get existing thread
    let existing = repo.get_thread(&request.id)?.ok_or_else(|| {
        AiAssistantError::ThreadNotFound {
            thread_id: request.id.clone(),
        }
    })?;

    // Apply updates
    let mut updated = existing;
    if let Some(title) = request.title {
        updated.title = Some(title);
    }
    if let Some(is_pinned) = request.is_pinned {
        updated.is_pinned = is_pinned;
    }

    let result = repo.update_thread(updated).await?;
    Ok(result)
}

/// Delete a chat thread and all its messages.
#[tauri::command]
pub async fn delete_ai_thread(
    context: State<'_, Arc<ServiceContext>>,
    thread_id: String,
) -> CommandResult<()> {
    let repo = context.ai_chat_repository();
    repo.delete_thread(&thread_id).await?;
    Ok(())
}
