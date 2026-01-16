//! AI Chat Tauri command for streaming responses.
//!
//! Uses Tauri's IPC Channel for efficient streaming of AI events.

use std::sync::Arc;

use futures::StreamExt;
use tauri::{ipc::Channel, State};
use wealthfolio_ai_assistant::types::{AiAssistantError, AiStreamEvent, SendMessageRequest};

use crate::context::ServiceContext;

use super::error::CommandResult;

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
