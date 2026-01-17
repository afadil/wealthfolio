/**
 * Chat runtime hook for @assistant-ui/react integration.
 *
 * Adapts the Wealthfolio AI streaming API to the assistant-ui ChatModelAdapter interface.
 */

import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadAssistantMessagePart,
  type ToolCallMessagePart,
} from "@assistant-ui/react";
import { useMemo, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { streamChatResponse, type ChatModelConfig } from "../api";
import type { AiStreamEvent, ChatThread } from "../types";
import { QueryKeys } from "@/lib/query-keys";
import { AI_THREADS_KEY } from "./use-threads";

/**
 * Mutable thread state holder for use with ChatModelAdapter.
 * This allows the stateless adapter to maintain thread_id across calls.
 */
interface ThreadStateRef {
  /** Current thread ID. Null means start a new thread. */
  threadId: string | null;
  /** Set thread ID (typically from system event). */
  setThreadId: (id: string) => void;
  /** Reset to start a new thread. */
  reset: () => void;
}

interface ToolCallState {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Callback type for handling thread title updates from stream events.
 */
type ThreadTitleUpdateHandler = (threadId: string, title: string) => void;

/**
 * Build a ChatModelAdapter that streams responses from the Wealthfolio AI backend.
 */
function buildAdapter(
  config?: ChatModelConfig,
  threadState?: ThreadStateRef,
  onThreadTitleUpdate?: ThreadTitleUpdateHandler,
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      // Convert assistant-ui messages to plain text for the API
      const lastUserMessage = messages
        .filter((m) => m.role === "user")
        .pop();

      const content = lastUserMessage?.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n") ?? "";

      // Get current thread ID from ref (null = new thread)
      const threadId = threadState?.threadId ?? undefined;

      let text = "";
      let reasoning = "";
      const toolCalls = new Map<string, ToolCallState>();

      const buildContent = (): ThreadAssistantMessagePart[] => {
        const parts: ThreadAssistantMessagePart[] = [];

        // Add reasoning first if present
        if (reasoning.trim()) {
          parts.push({ type: "reasoning", text: reasoning });
        }

        // Add tool calls
        for (const tc of toolCalls.values()) {
          // Include meta in result if present (for truncation indicator)
          const resultWithMeta = tc.result !== undefined
            ? tc.meta
              ? { data: tc.result, meta: tc.meta }
              : tc.result
            : undefined;

          const toolCallPart: ToolCallMessagePart = {
            type: "tool-call",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.args as ToolCallMessagePart["args"],
            argsText: tc.argsText,
            result: resultWithMeta,
          };
          parts.push(toolCallPart);
        }

        // Add text content last (only if present)
        if (text) {
          parts.push({ type: "text", text });
        }

        return parts;
      };

      const handleEvent = (event: AiStreamEvent) => {
        switch (event.type) {
          case "textDelta":
            text += event.delta;
            break;

          case "reasoningDelta":
            reasoning += event.delta;
            break;

          case "toolCall":
            toolCalls.set(event.toolCall.id, {
              toolCallId: event.toolCall.id,
              toolName: event.toolCall.name,
              args: event.toolCall.arguments,
              argsText: JSON.stringify(event.toolCall.arguments, null, 2),
            });
            break;

          case "toolResult": {
            const existing = toolCalls.get(event.result.toolCallId);
            if (existing) {
              existing.result = event.result.success
                ? event.result.data
                : { error: event.result.error };
              // Preserve metadata (includes truncation info)
              existing.meta = event.result.meta;
            }
            break;
          }
        }
      };

      try {
        for await (const event of streamChatResponse(
          { content, config, threadId },
          abortSignal,
        )) {
          if (abortSignal?.aborted) {
            yield {
              content: buildContent(),
              status: { type: "incomplete", reason: "cancelled" },
            };
            return;
          }

          if (event.type === "error") {
            yield {
              content: buildContent(),
              status: {
                type: "incomplete",
                reason: "error",
                error: event.message,
              },
            };
            return;
          }

          // Capture thread_id from system event (first event in stream)
          if (event.type === "system") {
            // Store the thread_id for subsequent messages in this conversation
            if (event.threadId && threadState) {
              threadState.setThreadId(event.threadId);
            }
            continue;
          }

          // Handle thread title updates (cache update only, doesn't produce content)
          // This can arrive after "done" event, so we process it before checking done
          if (event.type === "threadTitleUpdated") {
            onThreadTitleUpdate?.(event.threadId, event.title);
            continue;
          }

          if (event.type === "done") {
            // Use final content from done event (ensure text is always a string)
            if (typeof event.message.content === "string") {
              text = event.message.content;
            }
            if (typeof event.message.reasoning === "string") {
              reasoning = event.message.reasoning;
            }
            yield {
              content: buildContent(),
              status: { type: "complete", reason: "stop" },
            };
            // Don't return yet - continue processing for threadTitleUpdated event
            continue;
          }

          // Handle content-producing events
          handleEvent(event);

          yield {
            content: buildContent(),
            status: { type: "running" },
          };
        }

        // Stream ended without done event
        if (abortSignal?.aborted) {
          yield {
            content: buildContent(),
            status: { type: "incomplete", reason: "cancelled" },
          };
          return;
        }

        yield {
          content: buildContent(),
          status: { type: "complete", reason: "stop" },
        };
      } catch (error) {
        if (abortSignal?.aborted) {
          yield {
            content: buildContent(),
            status: { type: "incomplete", reason: "cancelled" },
          };
          return;
        }

        yield {
          content: buildContent(),
          status: {
            type: "incomplete",
            reason: "error",
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

/**
 * Hook to create a chat runtime for use with AssistantRuntimeProvider.
 *
 * @param config - Optional model configuration (provider and model selection)
 * @returns A runtime instance for use with AssistantRuntimeProvider
 *
 * @example
 * ```tsx
 * function ChatPage() {
 *   const runtime = useChatRuntime({ provider: "openai", model: "gpt-4o" });
 *   return (
 *     <AssistantRuntimeProvider runtime={runtime}>
 *       <Thread />
 *     </AssistantRuntimeProvider>
 *   );
 * }
 * ```
 */
export function useChatRuntime(config?: ChatModelConfig) {
  const queryClient = useQueryClient();

  // Mutable thread state ref - persists across adapter calls
  const threadIdRef = useRef<string | null>(null);

  // Create stable thread state object
  const threadState = useMemo<ThreadStateRef>(() => ({
    get threadId() {
      return threadIdRef.current;
    },
    setThreadId: (id: string) => {
      threadIdRef.current = id;
    },
    reset: () => {
      threadIdRef.current = null;
    },
  }), []);

  // Handler to update thread title in cache when received from stream
  const handleThreadTitleUpdate = useCallback(
    (threadId: string, title: string) => {
      // Update individual thread cache
      queryClient.setQueryData(
        QueryKeys.aiThread(threadId),
        (old: ChatThread | undefined) =>
          old ? { ...old, title } : old,
      );

      // Invalidate threads list to refresh with new title
      queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
    },
    [queryClient],
  );

  const adapter = useMemo(
    () => buildAdapter(config, threadState, handleThreadTitleUpdate),
    [config, threadState, handleThreadTitleUpdate],
  );

  const runtime = useLocalRuntime(adapter);

  // Return runtime with additional thread management
  return useMemo(() => ({
    ...runtime,
    /** Reset thread state to start a new conversation */
    resetThread: threadState.reset,
    /** Get current thread ID */
    getCurrentThreadId: () => threadState.threadId,
  }), [runtime, threadState]);
}
