// AI Thread Management Commands
import type {
  ListThreadsRequest,
  ThreadPage,
  ChatMessage,
  ChatThread,
} from "@/features/ai-assistant/types";
import type { UpdateThreadRequest, UpdateToolResultRequest } from "../types";

import { invoke } from "./platform";

/**
 * List AI chat threads with cursor-based pagination and optional search.
 *
 * @param req - Request parameters (cursor, limit, search)
 * @returns Paginated thread page
 */
export async function listAiThreads(req?: ListThreadsRequest): Promise<ThreadPage> {
  return invoke<ThreadPage>("list_ai_threads", {
    cursor: req?.cursor,
    limit: req?.limit ?? 20,
    search: req?.search,
  });
}

/**
 * Get a single chat thread by ID.
 */
export const getAiThread = async (threadId: string): Promise<ChatThread | null> => {
  return invoke<ChatThread | null>("get_ai_thread", { threadId });
};

/**
 * Get all messages for a chat thread.
 */
export const getAiThreadMessages = async (threadId: string): Promise<ChatMessage[]> => {
  return invoke<ChatMessage[]>("get_ai_thread_messages", { threadId });
};

/**
 * Update a chat thread's title and/or pinned status.
 */
export const updateAiThread = async (request: UpdateThreadRequest): Promise<ChatThread> => {
  return invoke<ChatThread>("update_ai_thread", { request });
};

/**
 * Delete a chat thread and all its messages.
 */
export const deleteAiThread = async (threadId: string): Promise<void> => {
  return invoke<void>("delete_ai_thread", { threadId });
};

/**
 * Add a tag to a thread.
 */
export const addAiThreadTag = async (threadId: string, tag: string): Promise<void> => {
  return invoke<void>("add_ai_thread_tag", { threadId, tag });
};

/**
 * Remove a tag from a thread.
 */
export const removeAiThreadTag = async (threadId: string, tag: string): Promise<void> => {
  return invoke<void>("remove_ai_thread_tag", { threadId, tag });
};

/**
 * Get all tags for a thread.
 */
export const getAiThreadTags = async (threadId: string): Promise<string[]> => {
  return invoke<string[]>("get_ai_thread_tags", { threadId });
};

/**
 * Update a tool result in the database.
 * Used to persist state like submission status after user actions.
 */
export const updateToolResult = async (request: UpdateToolResultRequest): Promise<void> => {
  return invoke<void>("update_tool_result", { request });
};
