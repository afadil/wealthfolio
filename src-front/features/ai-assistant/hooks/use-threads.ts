import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAiThreads,
  getAiThread,
  updateAiThread,
  deleteAiThread,
  addAiThreadTag,
  removeAiThreadTag,
  type UpdateThreadRequest,
  type ThreadPage,
} from "@/commands/ai-chat";
import { QueryKeys } from "@/lib/query-keys";
import type { ChatThread } from "../types";

/** Query key for AI threads list (infinite query) */
export const AI_THREADS_KEY = [QueryKeys.AI_THREADS] as const;

/** Default page size for thread pagination */
const DEFAULT_THREADS_LIMIT = 20;

/**
 * Hook to fetch chat threads with infinite pagination and optional search.
 * Threads are sorted by pinned status (pinned first), then by updated_at.
 *
 * @param search - Optional search string to filter threads by title
 */
export function useThreads(search?: string) {
  return useInfiniteQuery<ThreadPage, Error>({
    // When search is empty/undefined, use base key; otherwise include search in key
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: search ? [...AI_THREADS_KEY, "search", search] : AI_THREADS_KEY,
    queryFn: ({ pageParam }) =>
      listAiThreads({
        cursor: pageParam as string | undefined,
        limit: DEFAULT_THREADS_LIMIT,
        search: search ?? undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

/**
 * Hook to fetch a single thread by ID.
 */
export function useThread(threadId: string | null) {
  return useQuery({
    queryKey: QueryKeys.aiThread(threadId ?? ""),
    queryFn: () => getAiThread(threadId!),
    enabled: !!threadId,
  });
}

/**
 * Hook to update a thread's title.
 */
export function useRenameThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updateAiThread({ id, title }),
    onSuccess: (updatedThread) => {
      queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
      queryClient.setQueryData(QueryKeys.aiThread(updatedThread.id), updatedThread);
    },
  });
}

/**
 * Hook to toggle a thread's pinned status.
 */
export function useToggleThreadPin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      updateAiThread({ id, isPinned }),
    onSuccess: (updatedThread) => {
      queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
      queryClient.setQueryData(QueryKeys.aiThread(updatedThread.id), updatedThread);
    },
  });
}

/**
 * Hook to update a thread (generic).
 */
export function useUpdateThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateThreadRequest) => updateAiThread(request),
    onSuccess: (updatedThread) => {
      queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
      queryClient.setQueryData(QueryKeys.aiThread(updatedThread.id), updatedThread);
    },
  });
}

/**
 * Hook to delete a thread.
 */
export function useDeleteThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threadId: string) => deleteAiThread(threadId),
    onSuccess: (_, threadId) => {
      queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
      queryClient.removeQueries({ queryKey: QueryKeys.aiThread(threadId) });
    },
  });
}

// ============================================================================
// Tag Management Hooks
// ============================================================================

/**
 * Hook to add a tag to a thread.
 */
export function useAddThreadTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, tag }: { threadId: string; tag: string }) =>
      addAiThreadTag(threadId, tag),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
      queryClient.invalidateQueries({ queryKey: QueryKeys.aiThread(threadId) });
    },
  });
}

/**
 * Hook to remove a tag from a thread.
 */
export function useRemoveThreadTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, tag }: { threadId: string; tag: string }) =>
      removeAiThreadTag(threadId, tag),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: AI_THREADS_KEY });
      queryClient.invalidateQueries({ queryKey: QueryKeys.aiThread(threadId) });
    },
  });
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Flatten paginated thread data into a single array.
 * Utility for components that need a flat list of threads.
 *
 * @param pages - Array of ThreadPage objects from infinite query
 * @returns Flat array of ChatThread objects
 */
export function flattenThreadPages(
  pages: ThreadPage[] | undefined,
): ChatThread[] {
  return pages?.flatMap((page) => page.threads as unknown as ChatThread[]) ?? [];
}
