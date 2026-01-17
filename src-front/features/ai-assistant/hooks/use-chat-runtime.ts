/**
 * Chat runtime hook for @assistant-ui/react integration.
 *
 * Uses useExternalStoreRuntime to integrate with database-backed thread storage.
 * Adapts the Wealthfolio AI streaming API to work with external message persistence.
 */

import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
  type ExternalStoreAdapter,
} from "@assistant-ui/react";
import { useMemo, useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { streamChatResponse, type ChatModelConfig } from "../api";
import type { ChatThread, ToolCall, ToolResult } from "../types";
import { QueryKeys } from "@/lib/query-keys";
import { AI_THREADS_KEY } from "./use-threads";

/**
 * Internal tool call state during streaming.
 */
interface ToolCallState {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Message stored in external state (matches DB format loosely).
 */
export interface ExternalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  reasoning?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

/**
 * JSON value types for tool arguments.
 */
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
type JSONObject = { readonly [key: string]: JSONValue };

/**
 * Content part types for the runtime.
 */
type ContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: JSONObject;
      argsText: string;
      result?: unknown;
    };

/**
 * Convert external message to assistant-ui ThreadMessageLike format.
 */
function convertMessage(msg: ExternalMessage): ThreadMessageLike {
  const parts: ContentPart[] = [];

  // Add reasoning first if present
  if (msg.reasoning?.trim()) {
    parts.push({ type: "reasoning", text: msg.reasoning });
  }

  // Add tool calls with results
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      const result = msg.toolResults?.find((r) => r.toolCallId === tc.id);
      parts.push({
        type: "tool-call",
        toolCallId: tc.id,
        toolName: tc.name,
        args: tc.arguments as JSONObject,
        argsText: JSON.stringify(tc.arguments, null, 2),
        result: result?.success
          ? result.meta
            ? { data: result.data, meta: result.meta }
            : result.data
          : result?.error
            ? { error: result.error }
            : undefined,
      });
    }
  }

  // Add text content
  if (msg.content?.trim()) {
    parts.push({ type: "text", text: msg.content });
  }

  return {
    id: msg.id,
    role: msg.role,
    content: parts,
    createdAt: msg.createdAt,
  };
}

/**
 * Hook to create a chat runtime for use with AssistantRuntimeProvider.
 *
 * Uses useExternalStoreRuntime to integrate with database-backed threads.
 * Messages are loaded from DB when switching threads and new messages are
 * streamed through the Wealthfolio AI API.
 *
 * @param config - Optional model configuration (provider and model selection)
 * @returns A runtime instance for use with AssistantRuntimeProvider
 */
export function useChatRuntime(config?: ChatModelConfig) {
  const queryClient = useQueryClient();

  // External message state (from DB or streaming)
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Thread ID ref - persists across streaming calls
  const threadIdRef = useRef<string | null>(null);

  // Abort controller for cancelling streams
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handler to update thread title in cache
  const handleThreadTitleUpdate = useCallback(
    (threadId: string, title: string) => {
      queryClient.setQueryData(
        QueryKeys.aiThread(threadId),
        (old: ChatThread | undefined) => (old ? { ...old, title } : old),
      );
      queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
    },
    [queryClient],
  );

  // Handle new user message - streams response from AI backend
  const handleNew = useCallback(
    async (message: AppendMessage) => {
      // Extract text content from the message
      const content = message.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n");

      if (!content.trim()) return;

      // Create user message
      const userMessage: ExternalMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: new Date(),
      };

      // Add user message to state
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder assistant message
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: ExternalMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsRunning(true);

      // Create abort controller
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      // Streaming state
      let text = "";
      let reasoning = "";
      const toolCalls = new Map<string, ToolCallState>();

      const updateAssistantMessage = () => {
        const tcArray: ToolCall[] = [];
        const trArray: ToolResult[] = [];

        for (const tc of toolCalls.values()) {
          tcArray.push({
            id: tc.toolCallId,
            name: tc.toolName,
            arguments: tc.args,
          });
          if (tc.result !== undefined) {
            trArray.push({
              toolCallId: tc.toolCallId,
              success: !("error" in (tc.result as Record<string, unknown> || {})),
              data: tc.result,
              meta: tc.meta,
            });
          }
        }

        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === assistantMessageId);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              content: text,
              reasoning: reasoning || undefined,
              toolCalls: tcArray.length > 0 ? tcArray : undefined,
              toolResults: trArray.length > 0 ? trArray : undefined,
            };
          }
          return updated;
        });
      };

      try {
        for await (const event of streamChatResponse(
          {
            content,
            config,
            threadId: threadIdRef.current ?? undefined,
          },
          signal,
        )) {
          if (signal.aborted) break;

          switch (event.type) {
            case "system":
              // Capture thread ID from system event
              if (event.threadId) {
                threadIdRef.current = event.threadId;
                queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
              }
              break;

            case "textDelta":
              text += event.delta;
              updateAssistantMessage();
              break;

            case "reasoningDelta":
              reasoning += event.delta;
              updateAssistantMessage();
              break;

            case "toolCall":
              toolCalls.set(event.toolCall.id, {
                toolCallId: event.toolCall.id,
                toolName: event.toolCall.name,
                args: event.toolCall.arguments,
                argsText: JSON.stringify(event.toolCall.arguments, null, 2),
              });
              updateAssistantMessage();
              break;

            case "toolResult": {
              const existing = toolCalls.get(event.result.toolCallId);
              if (existing) {
                existing.result = event.result.success
                  ? event.result.data
                  : { error: event.result.error };
                existing.meta = event.result.meta;
              }
              updateAssistantMessage();
              break;
            }

            case "done":
              // Extract final content from done event's structured message
              if (event.message.content?.parts) {
                for (const part of event.message.content.parts) {
                  if (part.type === "text") {
                    text = part.content;
                  } else if (part.type === "reasoning") {
                    reasoning = part.content;
                  }
                }
              }
              updateAssistantMessage();
              break;

            case "threadTitleUpdated":
              handleThreadTitleUpdate(event.threadId, event.title);
              break;

            case "error":
              console.error("Stream error:", event.message);
              break;
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error("Streaming error:", error);
        }
      } finally {
        setIsRunning(false);
        abortControllerRef.current = null;
      }
    },
    [config, queryClient, handleThreadTitleUpdate],
  );

  // Handle cancel
  const handleCancel = useCallback(async () => {
    abortControllerRef.current?.abort();
  }, []);

  // Wrapper for setMessages that accepts readonly arrays
  const handleSetMessages = useCallback(
    (newMessages: readonly ExternalMessage[]) => {
      setMessages([...newMessages]);
    },
    [],
  );

  // Build the external store adapter
  const adapter = useMemo<ExternalStoreAdapter<ExternalMessage>>(
    () => ({
      isRunning,
      messages,
      setMessages: handleSetMessages,
      convertMessage,
      onNew: handleNew,
      onCancel: handleCancel,
    }),
    [isRunning, messages, handleSetMessages, handleNew, handleCancel],
  );

  const runtime = useExternalStoreRuntime(adapter);

  // Extended API for thread management
  return useMemo(
    () => ({
      ...runtime,
      /** Load messages for a thread from the database */
      loadThread: async (threadId: string, dbMessages: ExternalMessage[]) => {
        threadIdRef.current = threadId;
        setMessages(dbMessages);
      },
      /** Start a new thread (clears messages and thread ID) */
      startNewThread: () => {
        threadIdRef.current = null;
        setMessages([]);
      },
      /** Get current thread ID */
      getCurrentThreadId: () => threadIdRef.current,
    }),
    [runtime],
  );
}

/**
 * Type for the extended runtime returned by useChatRuntime.
 */
export type ChatRuntime = ReturnType<typeof useChatRuntime>;
