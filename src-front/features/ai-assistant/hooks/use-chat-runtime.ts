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
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";

import { streamChatResponse, type ChatModelConfig } from "../api";
import type { AiThread, ChatMessage, ChatThread, ThreadPage, ToolCall, ToolResult } from "../types";
import { QueryKeys } from "@/lib/query-keys";
import { AI_THREADS_KEY } from "./use-threads";
import { deleteAiThread, getAiThreadMessages, updateAiThread } from "@/adapters";

function deriveInitialThreadTitle(firstUserMessage: string): string {
  const normalized = firstUserMessage.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const maxChars = 50;
  if (normalized.length <= maxChars) return normalized;

  const truncated = normalized.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  const cut = lastSpace > maxChars / 2 ? truncated.slice(0, lastSpace) : truncated;
  return `${cut.trim()}...`;
}

/**
 * Extract error message from provider response.
 * Handles JSON error responses like:
 * - {"error":"message here"}
 * - {"error":{"message":"message here","type":"error_type"}}
 */
function extractErrorMessage(error: string): string {
  // Try to extract from "with message:" format first
  const messageMatch = error.match(/with message:\s*(.+)$/i);
  const jsonStr = messageMatch?.[1] || error;

  // Try to parse as JSON
  try {
    // Find JSON object in the string
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Handle {"error":{"message":"..."}} format
      if (parsed.error?.message) {
        return parsed.error.message;
      }
      // Handle {"error":"..."} format
      if (typeof parsed.error === "string") {
        return parsed.error;
      }
      // Handle {"message":"..."} format
      if (parsed.message) {
        return parsed.message;
      }
    }
  } catch {
    // Not valid JSON, continue with string extraction
  }

  // Fallback: try simple regex for {"error":"..."}
  const simpleMatch = error.match(/"error":\s*"([^"]+)"/);
  if (simpleMatch?.[1]) {
    return simpleMatch[1];
  }

  // Fallback: try regex for "message":"..."
  const msgMatch = error.match(/"message":\s*"([^"]+)"/);
  if (msgMatch?.[1]) {
    return msgMatch[1];
  }

  return error;
}

/**
 * Format error messages with user-friendly copy and actionable guidance.
 */
function formatErrorMessage(error: string): string {
  const settingsLink = "[AI Providers settings](/settings/ai-providers)";

  // First, extract the actual error message from nested formats
  const extractedError = extractErrorMessage(error);

  // Model doesn't support thinking (Ollama)
  if (extractedError.includes("does not support thinking")) {
    const modelMatch = extractedError.match(/"([^"]+)"/);
    const modelName = modelMatch?.[1] || "This model";
    return `**Thinking not supported**\n\n${modelName} doesn't support the thinking/reasoning feature.\n\nTry a different model that supports thinking, or check your ${settingsLink}.`;
  }

  // Model not found errors
  if (extractedError.includes("not found") && extractedError.includes("model")) {
    const modelMatch = extractedError.match(/model ['"]([^'"]+)['"]/i);
    const modelName = modelMatch?.[1] || "selected model";
    return `**Model not available**\n\nThe model "${modelName}" could not be found. This usually means:\n- The model hasn't been downloaded yet\n- The model name is incorrect\n- The AI provider service isn't running\n\nPlease check your ${settingsLink} to select a different model or verify your provider configuration.`;
  }

  // Connection refused / provider not running
  if (extractedError.includes("Connection refused") || extractedError.includes("ECONNREFUSED")) {
    return `**Cannot connect to AI provider**\n\nThe AI provider service doesn't appear to be running. Please:\n1. Start your local AI provider (e.g., Ollama)\n2. Verify the provider URL in ${settingsLink}\n3. Try again`;
  }

  // API key errors
  if (extractedError.includes("401") || extractedError.includes("unauthorized") || extractedError.includes("API key")) {
    return `**Authentication failed**\n\nYour API key appears to be invalid or missing. Please check your ${settingsLink} and ensure your API key is correctly configured.`;
  }

  // Rate limit errors
  if (extractedError.includes("429") || extractedError.includes("rate limit")) {
    return `**Rate limit exceeded**\n\nYou've made too many requests. Please wait a moment and try again.`;
  }

  // Timeout errors
  if (extractedError.includes("timeout") || extractedError.includes("ETIMEDOUT")) {
    return `**Request timed out**\n\nThe AI provider took too long to respond. This could be due to:\n- A slow network connection\n- The provider being overloaded\n- A very complex request\n\nPlease try again or select a faster model in ${settingsLink}.`;
  }

  // Generic provider error - use extracted message
  if (error.includes("Provider error") || error.includes("CompletionError") || error.includes("HttpError")) {
    return `**Provider error**\n\n${extractedError}\n\nCheck your ${settingsLink} if this persists.`;
  }

  // Fallback for unknown errors
  return `**Something went wrong**\n\n${extractedError}\n\nIf this persists, please check your ${settingsLink}.`;
}

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
 * Thread list data for assistant-ui thread list adapter.
 */
interface ThreadListItemData {
  status: "regular";
  id: string;
  remoteId?: string;
  externalId?: string;
  title?: string;
}

/**
 * Convert a ChatMessage from the database to ExternalMessage format.
 */
function convertToExternalMessage(msg: ChatMessage): ExternalMessage {
  let textContent = "";
  let reasoning: string | undefined;
  const toolCalls: ToolCall[] = [];
  const toolResults: ToolResult[] = [];

  for (const part of msg.content.parts) {
    switch (part.type) {
      case "text":
        textContent += part.content;
        break;
      case "reasoning":
        reasoning = (reasoning ?? "") + part.content;
        break;
      case "toolCall":
        toolCalls.push({
          id: part.toolCallId,
          name: part.name,
          arguments: part.arguments,
        });
        break;
      case "toolResult":
        toolResults.push({
          toolCallId: part.toolCallId,
          success: part.success,
          data: part.data,
          meta: part.meta,
          error: part.error,
        });
        break;
    }
  }

  return {
    id: msg.id,
    role: msg.role,
    content: textContent,
    createdAt: new Date(msg.createdAt),
    reasoning: reasoning?.trim() || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    toolResults: toolResults.length > 0 ? toolResults : undefined,
  };
}

function buildThreadListItems(threads: ChatThread[]): ThreadListItemData[] {
  return threads.map((thread) => ({
    status: "regular",
    id: thread.id,
    remoteId: thread.id,
    title: thread.title || undefined,
  }));
}

function areThreadListItemsEqual(
  prevItems: ThreadListItemData[],
  nextItems: ThreadListItemData[],
): boolean {
  if (prevItems.length !== nextItems.length) return false;
  for (let i = 0; i < prevItems.length; i += 1) {
    const prev = prevItems[i];
    const next = nextItems[i];
    if (!prev || !next) return false;
    if (prev.id !== next.id || prev.title !== next.title) return false;
  }
  return true;
}

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
  const [currentThreadId, setCurrentThreadIdState] = useState<string | null>(null);
  const [switchingThreadId, setSwitchingThreadId] = useState<string | null>(null);
  const [threadListItems, setThreadListItems] = useState<ThreadListItemData[]>([]);
  const [isThreadListLoading, setIsThreadListLoading] = useState(false);

  // Thread ID ref - persists across streaming calls
  const threadIdRef = useRef<string | null>(null);

  // Abort controller for cancelling streams
  const abortControllerRef = useRef<AbortController | null>(null);

  const setCurrentThreadId = useCallback((threadId: string | null) => {
    threadIdRef.current = threadId;
    setCurrentThreadIdState(threadId);
  }, []);

  const setThreadTitleInCaches = useCallback(
    (threadId: string, title: string) => {
      // Update thread detail cache, if present.
      queryClient.setQueryData<ChatThread | null>(QueryKeys.aiThread(threadId), (old) =>
        old ? { ...old, title } : old,
      );

      // Update any cached thread list pages (base + search variants).
      queryClient.setQueriesData<InfiniteData<ThreadPage>>({ queryKey: AI_THREADS_KEY }, (old) => {
        if (!old?.pages?.length) return old;

        let changed = false;
        const pages = old.pages.map((page) => {
          let pageChanged = false;
          const threads = page.threads.map((t) => {
            if (t.id !== threadId) return t;
            if (t.title === title) return t;
            pageChanged = true;
            return { ...t, title };
          });
          if (!pageChanged) return page;
          changed = true;
          return { ...page, threads };
        });

        return changed ? { ...old, pages } : old;
      });
    },
    [queryClient],
  );

  const updateThreadListState = useCallback((threads: ChatThread[], isLoading: boolean) => {
    const nextItems = buildThreadListItems(threads);
    setThreadListItems((prevItems) =>
      areThreadListItemsEqual(prevItems, nextItems) ? prevItems : nextItems,
    );
    setIsThreadListLoading((prev) => (prev === isLoading ? prev : isLoading));
  }, []);

  // Handle new user message - streams response from AI backend
  const handleNew = useCallback(
    async (message: AppendMessage) => {
      // Extract text content from the message
      const content = message.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n");

      if (!content.trim()) return;
      const initialThreadTitle = deriveInitialThreadTitle(content);

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

      // RAF-based throttling to batch rapid updates (prevents 100s of re-renders)
      let rafId: number | null = null;
      let updatePending = false;

      const flushUpdate = () => {
        rafId = null;
        updatePending = false;

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

      const updateAssistantMessage = () => {
        updatePending = true;
        if (rafId === null) {
          rafId = requestAnimationFrame(flushUpdate);
        }
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
                const newThreadId = event.threadId;
                setCurrentThreadId(newThreadId);

                // Optimistically add the new thread to the cache immediately
                // This ensures the thread appears in the sidebar right away
                queryClient.setQueryData<InfiniteData<ThreadPage>>(
                  AI_THREADS_KEY,
                  (old) => {
                    // Create placeholder thread - title will be updated when title generation completes
                    const placeholderThread: AiThread = {
                      id: newThreadId,
                      title: initialThreadTitle,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      isPinned: false,
                      tags: [],
                    };

                    if (!old?.pages?.length) {
                      // No existing data - create initial structure with the new thread
                      return {
                        pages: [
                          {
                            threads: [placeholderThread],
                            nextCursor: null,
                            hasMore: false,
                          },
                        ],
                        pageParams: [undefined],
                      };
                    }

                    // Check if thread already exists in any page
                    const threadExists = old.pages.some((page) =>
                      page.threads.some((t) => t.id === newThreadId),
                    );
                    if (threadExists) return old;

                    // Add new thread to the beginning of the first page
                    const newPages = [...old.pages];
                    if (newPages[0]) {
                      newPages[0] = {
                        ...newPages[0],
                        threads: [placeholderThread, ...newPages[0].threads],
                      };
                    }

                    return { ...old, pages: newPages };
                  },
                );
                // Don't invalidate here - it would overwrite optimistic update with stale data
                // The title will be updated when the stream completes via invalidation in "done" handler
              }
              break;

            case "threadTitleUpdated": {
              const nextTitle = event.title?.trim();
              if (event.threadId && nextTitle) {
                setThreadTitleInCaches(event.threadId, nextTitle);
              }
              break;
            }

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
              // Invalidate threads to refresh from DB (updates title if generated)
              // Use setTimeout to give DB time to commit and title generation to complete
              setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
              }, 1000);
              break;

            case "error":
              console.error("Stream error:", event.message);
              // Show formatted error to user in the assistant message
              text = formatErrorMessage(event.message);
              updateAssistantMessage();
              break;
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error("Streaming error:", error);
          // Show formatted error to user in the assistant message
          const errorMessage = error instanceof Error ? error.message : String(error);
          text = formatErrorMessage(errorMessage);
          updateAssistantMessage();
        }
      } finally {
        // Cancel pending RAF and flush any remaining updates
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (updatePending) {
          flushUpdate();
        }
        setIsRunning(false);
        abortControllerRef.current = null;
      }
    },
    [config, queryClient, setCurrentThreadId, setThreadTitleInCaches],
  );

  // Handle cancel
  const handleCancel = useCallback(async () => {
    abortControllerRef.current?.abort();
  }, []);

  const handleSwitchToNewThread = useCallback(async () => {
    await handleCancel();
    setCurrentThreadId(null);
    setMessages([]);
  }, [handleCancel, setCurrentThreadId]);

  const handleSwitchToThread = useCallback(
    async (threadId: string) => {
      if (threadId === threadIdRef.current || switchingThreadId) return;

      setSwitchingThreadId(threadId);
      await handleCancel();

      try {
        const dbMessages = await getAiThreadMessages(threadId);
        const externalMessages = dbMessages.map(convertToExternalMessage);
        setMessages(externalMessages);
        setCurrentThreadId(threadId);
      } catch (error) {
        console.error("Failed to load thread:", error);
        throw error;
      } finally {
        setSwitchingThreadId(null);
      }
    },
    [handleCancel, setCurrentThreadId, switchingThreadId],
  );

  const handleRenameThread = useCallback(
    async (threadId: string, newTitle: string) => {
      try {
        const updatedThread = await updateAiThread({ id: threadId, title: newTitle });
        queryClient.setQueryData(QueryKeys.aiThread(updatedThread.id), updatedThread);
        queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
      } catch (error) {
        console.error("Failed to rename thread:", error);
        throw error;
      }
    },
    [queryClient],
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteAiThread(threadId);
        queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
        queryClient.removeQueries({ queryKey: QueryKeys.aiThread(threadId) });

        if (threadIdRef.current === threadId) {
          await handleSwitchToNewThread();
        }
      } catch (error) {
        console.error("Failed to delete thread:", error);
        throw error;
      }
    },
    [handleSwitchToNewThread, queryClient],
  );

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
      adapters: {
        threadList: {
          threadId: currentThreadId ?? undefined,
          isLoading: isThreadListLoading,
          threads: threadListItems,
          onSwitchToThread: handleSwitchToThread,
          onSwitchToNewThread: handleSwitchToNewThread,
          onRename: handleRenameThread,
          onDelete: handleDeleteThread,
        },
      },
    }),
    [
      isRunning,
      messages,
      handleSetMessages,
      handleNew,
      handleCancel,
      currentThreadId,
      isThreadListLoading,
      threadListItems,
      handleSwitchToThread,
      handleSwitchToNewThread,
      handleRenameThread,
      handleDeleteThread,
    ],
  );

  const runtime = useExternalStoreRuntime(adapter);

  // Extended API for thread management
  return useMemo(
    () => ({
      ...runtime,
      currentThreadId,
      switchingThreadId,
      setThreadListState: updateThreadListState,
      /** Load messages for a thread from the database */
      loadThread: async (threadId: string, dbMessages: ExternalMessage[]) => {
        setCurrentThreadId(threadId);
        setMessages(dbMessages);
      },
      /** Start a new thread (clears messages and thread ID) */
      startNewThread: () => {
        handleSwitchToNewThread();
      },
      /** Get current thread ID */
      getCurrentThreadId: () => threadIdRef.current,
    }),
    [
      runtime,
      currentThreadId,
      switchingThreadId,
      updateThreadListState,
      setCurrentThreadId,
      handleSwitchToNewThread,
    ],
  );
}

/**
 * Type for the extended runtime returned by useChatRuntime.
 */
export type ChatRuntime = ReturnType<typeof useChatRuntime>;
