/**
 * AI Chat Streaming API client.
 *
 * Re-exports the streaming function from the adapter layer.
 * The adapter handles environment detection (Tauri vs Web) at build time.
 */

import { streamAiChat } from "@/adapters";
import type { AiSendMessageRequest, AiStreamEvent, AiChatModelConfig } from "../types";

// Re-export types for convenience
export type { AiSendMessageRequest, AiStreamEvent, AiChatModelConfig };

// Alias for backward compatibility
export type SendMessageRequest = AiSendMessageRequest;
export type ChatModelConfig = AiChatModelConfig;

/**
 * Stream chat response events from the AI assistant.
 *
 * The adapter handles environment detection at build time:
 * - Tauri (desktop): Uses IPC with Channel for streaming
 * - Web: Uses HTTP fetch with NDJSON streaming
 *
 * @param request - The chat message request
 * @param signal - Optional AbortSignal for cancellation
 * @yields AiStreamEvent objects from the stream
 *
 * @example
 * ```ts
 * for await (const event of streamChatResponse({ content: "Show holdings" })) {
 *   if (event.type === "textDelta") {
 *     console.log(event.delta);
 *   } else if (event.type === "done") {
 *     console.log("Complete:", event.message);
 *   }
 * }
 * ```
 */
export async function* streamChatResponse(
  request: SendMessageRequest,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent, void, undefined> {
  yield* streamAiChat(request, signal);
}

/**
 * Helper to consume the entire stream and collect all events.
 * Useful for testing or when you need all events at once.
 */
export async function collectStreamEvents(
  request: SendMessageRequest,
  signal?: AbortSignal,
): Promise<AiStreamEvent[]> {
  const events: AiStreamEvent[] = [];

  for await (const event of streamChatResponse(request, signal)) {
    events.push(event);
  }

  return events;
}
