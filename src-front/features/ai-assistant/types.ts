// AI Assistant Feature Types

import type { MergedProvider } from "@/lib/types";

// Re-export API types for convenience
export type {
  MergedProvider,
  MergedModel,
  AiProvidersResponse,
  ModelCapabilities,
  ModelCapabilityOverrides,
  ModelCapabilityOverrideUpdate,
  FetchedModel,
  ListModelsResponse,
} from "@/lib/types";

// ============================================================================
// Chat Thread Types
// ============================================================================

/**
 * Per-thread agent configuration snapshot.
 * Captures the model, prompt template, and tool allowlist at thread creation.
 * This enables deterministic replay and debugging of conversations.
 */
export interface AiThreadConfig {
  /** Schema version for backward compatibility */
  schemaVersion: number;
  /** Provider ID (e.g., "openai", "anthropic") */
  providerId: string;
  /** Model ID (e.g., "gpt-4o", "claude-3-sonnet") */
  modelId: string;
  /** Prompt template ID */
  promptTemplateId: string;
  /** Prompt template version */
  promptVersion: string;
  /** Locale for formatting and language */
  locale?: string;
  /** Detail level for responses */
  detailLevel?: string;
  /** Allowlist of tool names that can be used in this thread */
  toolsAllowlist?: string[];
}

export interface ChatThread {
  id: string;
  title: string;
  /** Whether this thread is pinned to the top of the list */
  isPinned: boolean;
  /** Tags for organizing and filtering threads */
  tags: string[];
  /** Per-thread agent configuration snapshot */
  config?: AiThreadConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Reasoning/thinking content from the model (optional) */
  reasoning?: string;
  // Tool calls/results stored inline
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  data: unknown;
  meta?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// AI Chat API Types (for adapter layer)
// ============================================================================

/**
 * Model configuration for AI chat requests.
 */
export interface AiChatModelConfig {
  /** Provider ID (e.g., "openai", "anthropic"). */
  provider?: string;
  /** Model ID (e.g., "gpt-4o", "claude-3-sonnet"). */
  model?: string;
}

/**
 * Request payload for sending an AI chat message.
 */
export interface AiSendMessageRequest {
  /** Thread ID (creates new thread if not provided). */
  threadId?: string;
  /** The message content. */
  content: string;
  /** Model configuration (provider and model selection). */
  config?: AiChatModelConfig;
  /** Override provider ID (uses default if not specified). @deprecated Use config.provider */
  providerId?: string;
  /** Override model ID (uses provider default if not specified). @deprecated Use config.model */
  modelId?: string;
  /** Tool allowlist for this request (uses all if not specified). */
  allowedTools?: string[];
}

/**
 * AI thread structure from the backend API.
 */
export interface AiThread {
  id: string;
  title: string;
  isPinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Paginated response for AI threads.
 */
export interface ThreadPage {
  threads: AiThread[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Request parameters for listing AI threads.
 */
export interface ListThreadsRequest {
  cursor?: string;
  limit?: number;
  search?: string;
}

// ============================================================================
// Stream Event Types (from backend)
// ============================================================================

/**
 * Base fields present in all stream events for correlation.
 */
interface AiStreamEventBase {
  /** Thread ID for this conversation */
  threadId: string;
  /** Run ID for this streaming session (uuid7) */
  runId: string;
}

/**
 * System event - sent first in the stream with metadata.
 */
interface SystemEvent extends AiStreamEventBase {
  type: "system";
  /** The message ID being generated */
  messageId: string;
}

/**
 * Text delta event - partial text content.
 */
interface TextDeltaEvent extends AiStreamEventBase {
  type: "textDelta";
  /** The message ID this delta belongs to */
  messageId: string;
  /** The text content delta */
  delta: string;
}

/**
 * Reasoning delta event - partial reasoning/thinking content (optional).
 */
interface ReasoningDeltaEvent extends AiStreamEventBase {
  type: "reasoningDelta";
  /** The message ID this delta belongs to */
  messageId: string;
  /** The reasoning content delta */
  delta: string;
}

/**
 * Tool call event - model wants to call a tool.
 */
interface ToolCallEvent extends AiStreamEventBase {
  type: "toolCall";
  /** The message ID this tool call belongs to */
  messageId: string;
  /** The tool call details (structured JSON) */
  toolCall: ToolCall;
}

/**
 * Tool result event - tool execution completed.
 */
interface ToolResultEvent extends AiStreamEventBase {
  type: "toolResult";
  /** The message ID this result belongs to */
  messageId: string;
  /** The tool result (structured JSON) */
  result: ToolResult;
}

/**
 * Error event - something went wrong.
 */
interface ErrorEvent extends AiStreamEventBase {
  type: "error";
  /** The message ID (if available) */
  messageId?: string;
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Done event - stream completed (terminal).
 */
interface DoneEvent extends AiStreamEventBase {
  type: "done";
  /** The message ID of the completed message */
  messageId: string;
  /** The final complete message */
  message: ChatMessage;
  /** Usage statistics (if available) */
  usage?: UsageStats;
}

/**
 * Thread title updated event - emitted when the thread title is generated/updated.
 */
interface ThreadTitleUpdatedEvent extends AiStreamEventBase {
  type: "threadTitleUpdated";
  /** The new thread title */
  title: string;
}

/**
 * Token usage statistics.
 */
export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Union type for all stream events.
 * All events include threadId, runId for correlation across reconnects.
 */
export type AiStreamEvent =
  | SystemEvent
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | ErrorEvent
  | DoneEvent
  | ThreadTitleUpdatedEvent;

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Error information for display in the UI.
 * Contains both a user-friendly message and error code for programmatic handling.
 */
export interface ChatError {
  /** Error code for programmatic handling (e.g., "missingApiKey", "providerError") */
  code: string;
  /** User-friendly error message */
  message: string;
  /** Whether the error is retryable */
  retryable: boolean;
}

/**
 * Maps error codes to user-friendly messages and retry eligibility.
 * Error codes come from the backend AiAssistantError enum.
 */
export const ERROR_CODE_MAP: Record<string, { message: string; retryable: boolean }> = {
  providerNotConfigured: {
    message: "AI provider is not configured. Please set up a provider in Settings.",
    retryable: false,
  },
  missingApiKey: {
    message: "API key is missing. Please add your API key in Settings.",
    retryable: false,
  },
  modelNotFound: {
    message: "The selected model is not available. Please choose a different model.",
    retryable: false,
  },
  toolNotFound: {
    message: "A required tool is not available. Please try again.",
    retryable: true,
  },
  toolNotAllowed: {
    message: "A tool is not allowed for this conversation. Please try again.",
    retryable: true,
  },
  toolExecutionError: {
    message: "A tool failed to execute. Please try again.",
    retryable: true,
  },
  providerError: {
    message: "The AI provider returned an error. Please try again.",
    retryable: true,
  },
  threadNotFound: {
    message: "Conversation not found. Please start a new conversation.",
    retryable: false,
  },
  invalidInput: {
    message: "Invalid input. Please check your message and try again.",
    retryable: false,
  },
  internal: {
    message: "An unexpected error occurred. Please try again.",
    retryable: true,
  },
  cancelled: {
    message: "Response was cancelled.",
    retryable: true,
  },
  network: {
    message: "Network error. Please check your connection and try again.",
    retryable: true,
  },
};

/**
 * Parse an error code and return a ChatError with user-friendly message.
 */
export function parseErrorCode(code: string, rawMessage?: string): ChatError {
  const mapped = ERROR_CODE_MAP[code];
  if (mapped) {
    return { code, message: mapped.message, retryable: mapped.retryable };
  }
  // Fallback for unknown error codes
  return {
    code,
    message: rawMessage ?? "An unexpected error occurred. Please try again.",
    retryable: true,
  };
}

export interface ChatState {
  threads: ChatThread[];
  activeThreadId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  error: ChatError | null;
}

export interface ProviderSettingsState {
  providers: MergedProvider[];
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Type Aliases (for backward compatibility with adapter layer)
// ============================================================================

/** @alias ToolCall - for adapter layer compatibility */
export type AiToolCall = ToolCall;

/** @alias ToolResult - for adapter layer compatibility */
export type AiToolResult = ToolResult;

/** @alias ChatMessage - for adapter layer compatibility */
export type AiChatMessage = ChatMessage;

/** @alias UsageStats - for adapter layer compatibility */
export type AiUsageStats = UsageStats;
