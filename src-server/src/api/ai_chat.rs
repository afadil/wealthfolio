//! AI Chat streaming endpoint.
//!
//! Provides NDJSON streaming for AI assistant chat messages.

use std::sync::Arc;

use axum::{
    body::Body,
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use futures::StreamExt;

use crate::main_lib::AppState;
use wealthfolio_ai_assistant::types::{AiAssistantError, SendMessageRequest};

/// POST /api/v1/ai/chat/stream
///
/// Streams AI assistant responses as NDJSON (one JSON object per line).
/// Each line is a complete `AiStreamEvent` JSON object.
///
/// Event types: `system`, `textDelta`, `reasoningDelta`, `toolCall`, `toolResult`, `error`, `done`
///
/// The stream always starts with a `system` event and ends with a `done` event.
async fn stream_chat(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SendMessageRequest>,
) -> Result<Response, AiChatError> {
    let service = state
        .ai_assistant_service
        .as_ref()
        .ok_or(AiChatError::ServiceNotConfigured)?;

    let event_stream = service
        .send_message(request)
        .await
        .map_err(AiChatError::Assistant)?;

    // Convert event stream to NDJSON body
    let ndjson_stream = event_stream.map(|event| {
        let mut json = serde_json::to_string(&event).unwrap_or_else(|e| {
            // Fallback error event if serialization fails
            format!(
                r#"{{"type":"error","threadId":"","runId":"","messageId":null,"code":"serialization_error","message":"{}"}}"#,
                e
            )
        });
        json.push('\n');
        Ok::<_, std::convert::Infallible>(json)
    });

    let body = Body::from_stream(ndjson_stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/x-ndjson")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .body(body)
        .unwrap())
}

/// Error type for AI chat endpoints.
#[derive(Debug)]
pub enum AiChatError {
    ServiceNotConfigured,
    Assistant(AiAssistantError),
}

impl IntoResponse for AiChatError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AiChatError::ServiceNotConfigured => (
                StatusCode::SERVICE_UNAVAILABLE,
                "AI assistant service not configured".to_string(),
            ),
            AiChatError::Assistant(e) => (StatusCode::BAD_REQUEST, e.to_string()),
        };

        let body = serde_json::json!({
            "error": message
        });

        (status, Json(body)).into_response()
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/ai/chat/stream", post(stream_chat))
}
