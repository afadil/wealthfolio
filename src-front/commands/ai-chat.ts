import { invoke, logger } from "@/adapters";
import type { ChatThread } from "@/features/ai-assistant/types";

/**
 * Request for updating thread title or pinned status.
 */
export interface UpdateThreadRequest {
  id: string;
  title?: string;
  isPinned?: boolean;
}

/**
 * List all chat threads, sorted by pinned status then updated_at.
 */
export const listAiThreads = async (
  limit?: number,
  offset?: number,
): Promise<ChatThread[]> => {
  try {
    return await invoke("list_ai_threads", { limit, offset });
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
