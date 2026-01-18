import { invoke, logger, listAiThreads as adapterListAiThreads } from "@/adapters";
import type { ChatMessage, ChatThread, ListThreadsRequest, ThreadPage } from "@/features/ai-assistant/types";

// Re-export types for convenience
export type { ListThreadsRequest, ThreadPage };

/**
 * Request for updating thread title or pinned status.
 */
export interface UpdateThreadRequest {
  id: string;
  title?: string;
  isPinned?: boolean;
}

/**
 * List chat threads with cursor-based pagination and optional search.
 * Threads are sorted by pinned status (pinned first), then by updated_at.
 *
 * @param req - Request parameters (cursor, limit, search)
 * @returns Paginated thread page with threads, nextCursor, and hasMore
 */
export const listAiThreads = async (req?: ListThreadsRequest): Promise<ThreadPage> => {
  try {
    return await adapterListAiThreads(req);
  } catch (error) {
    logger.error("Error listing AI threads.");
    throw error;
  }
};

/**
 * Get a single chat thread by ID.
 */
export const getAiThread = async (threadId: string): Promise<ChatThread | null> => {
  try {
    return await invoke("get_ai_thread", { threadId });
  } catch (error) {
    logger.error("Error getting AI thread.");
    throw error;
  }
};

/**
 * Get all messages for a chat thread.
 */
export const getAiThreadMessages = async (threadId: string): Promise<ChatMessage[]> => {
  try {
    return await invoke("get_ai_thread_messages", { threadId });
  } catch (error) {
    logger.error("Error getting AI thread messages.");
    throw error;
  }
};

/**
 * Update a chat thread's title and/or pinned status.
 */
export const updateAiThread = async (request: UpdateThreadRequest): Promise<ChatThread> => {
  try {
    return await invoke("update_ai_thread", { request });
  } catch (error) {
    logger.error("Error updating AI thread.");
    throw error;
  }
};

/**
 * Delete a chat thread and all its messages.
 */
export const deleteAiThread = async (threadId: string): Promise<void> => {
  try {
    await invoke("delete_ai_thread", { threadId });
  } catch (error) {
    logger.error("Error deleting AI thread.");
    throw error;
  }
};

// ============================================================================
// Tag Management Commands
// ============================================================================

/**
 * Add a tag to a thread.
 */
export const addAiThreadTag = async (threadId: string, tag: string): Promise<void> => {
  try {
    await invoke("add_ai_thread_tag", { threadId, tag });
  } catch (error) {
    logger.error("Error adding tag to AI thread.");
    throw error;
  }
};

/**
 * Remove a tag from a thread.
 */
export const removeAiThreadTag = async (threadId: string, tag: string): Promise<void> => {
  try {
    await invoke("remove_ai_thread_tag", { threadId, tag });
  } catch (error) {
    logger.error("Error removing tag from AI thread.");
    throw error;
  }
};

/**
 * Get all tags for a thread.
 */
export const getAiThreadTags = async (threadId: string): Promise<string[]> => {
  try {
    return await invoke("get_ai_thread_tags", { threadId });
  } catch (error) {
    logger.error("Error getting AI thread tags.");
    throw error;
  }
};

// ============================================================================
// Tool Result Management Commands
// ============================================================================

/**
 * Request to update a tool result with additional data.
 */
export interface UpdateToolResultRequest {
  threadId: string;
  toolCallId: string;
  resultPatch: Record<string, unknown>;
}

/**
 * Update a tool result in the database.
 * Used to persist state like submission status after user actions.
 */
export const updateToolResult = async (request: UpdateToolResultRequest): Promise<void> => {
  try {
    await invoke("update_tool_result", { request });
  } catch (error) {
    logger.error("Error updating tool result.");
    throw error;
  }
};
