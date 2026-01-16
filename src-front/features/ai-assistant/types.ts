// AI Assistant Feature Types

import type { MergedProvider } from "@/lib/types";

// Re-export API types for convenience
export type { MergedProvider, MergedModel, AiProvidersResponse } from "@/lib/types";

// ============================================================================
// Chat Thread Types
// ============================================================================

export interface ChatThread {
  id: string;
  title: string;
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
  result: unknown;
}

// ============================================================================
// Stream Event Types (from backend)
// ============================================================================

export type AiStreamEvent =
  | { type: "textDelta"; delta: string }
  | { type: "reasoningDelta"; delta: string }
  | { type: "toolCall"; toolCall: ToolCall }
  | { type: "toolResult"; toolResult: ToolResult }
  | { type: "error"; error: string }
  | { type: "done"; messageId: string };

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
