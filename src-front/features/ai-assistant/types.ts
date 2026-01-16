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
  | DoneEvent;

// ============================================================================
// UI State Types
// ============================================================================

export interface ChatState {
  threads: ChatThread[];
  activeThreadId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  error: string | null;
}

export interface ProviderSettingsState {
  providers: MergedProvider[];
  isLoading: boolean;
  error: string | null;
}
