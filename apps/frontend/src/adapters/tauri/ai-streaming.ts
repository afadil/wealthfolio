// AI Chat Streaming - Tauri-specific implementation
// Uses Tauri's Channel for efficient streaming of events from the backend

import { matchesProfileScope, profileScope } from "@/features/profiles/session";
import { Channel } from "@tauri-apps/api/core";
import { tauriInvoke } from "./core";

import type { AiSendMessageRequest, AiStreamEvent } from "@/features/ai-assistant/types";

/**
 * Stream AI chat responses via Tauri IPC.
 *
 * Uses Tauri's Channel for efficient streaming of events from the backend.
 *
 * @param request - The chat message request
 * @param signal - Optional AbortSignal for cancellation
 * @yields AiStreamEvent objects from the stream
 */
export async function* streamAiChat(
  request: AiSendMessageRequest,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent, void, undefined> {
  const scope = profileScope();
  const channel = new Channel<{ scopeId: string; data: AiStreamEvent }>();
  const queue: AiStreamEvent[] = [];
  let done = false;
  let pendingResolve: (() => void) | null = null;

  const notifyPending = () => {
    if (pendingResolve) {
      pendingResolve();
      pendingResolve = null;
    }
  };

  channel.onmessage = (event) => {
    if (event.scopeId !== scope || !matchesProfileScope(scope)) return;
    queue.push(event.data);
    notifyPending();
  };

  const invokePromise = tauriInvoke("stream_ai_chat", {
    request,
    onEvent: channel,
  })
    .catch((err) => {
      queue.push({
        type: "error",
        threadId: "",
        runId: "",
        messageId: undefined,
        code: "network",
        message: err instanceof Error ? err.message : String(err),
      } as AiStreamEvent);
      notifyPending();
    })
    .finally(() => {
      done = true;
      notifyPending();
    });

  try {
    while (!done || queue.length > 0) {
      if (signal?.aborted || !matchesProfileScope(scope)) {
        break;
      }

      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          pendingResolve = resolve;
        });
        continue;
      }

      const next = queue.shift();
      if (next) {
        yield next;

        // Stop on terminal events
        if (next.type === "done" || next.type === "error") {
          return;
        }
      }
    }
  } finally {
    // @ts-expect-error - Tauri Channel doesn't have a proper cleanup method
    channel.onmessage = null;
    if (!signal?.aborted) {
      await invokePromise;
    }
  }
}
