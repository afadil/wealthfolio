import { ThreadListPrimitive } from "@assistant-ui/react";
import { PlusIcon, SearchIcon, XIcon, LoaderIcon, PinIcon, Trash2Icon } from "lucide-react";
import { type FC, useState, useEffect, useRef, useCallback, useMemo } from "react";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { ActionConfirm } from "@wealthfolio/ui/components/common";
import { useThreads, useDeleteThread, flattenThreadPages } from "../hooks/use-threads";
import { useRuntimeContext } from "../hooks/use-runtime-context";
import { getAiThreadMessages } from "@/commands/ai-chat";
import type { ChatThread, ChatMessage, ToolCall, ToolResult } from "../types";
import type { ExternalMessage } from "../hooks/use-chat-runtime";

/** Debounce delay for search input (ms) */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Convert a ChatMessage from the database to ExternalMessage format for the runtime.
 * Extracts text, reasoning, tool calls, and tool results from the structured content.
 */
function convertToExternalMessage(msg: ChatMessage): ExternalMessage {
  let textContent = "";
  let reasoning: string | undefined;
  const toolCalls: ToolCall[] = [];
  const toolResults: ToolResult[] = [];

  // Extract parts from structured content
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

/**
 * Custom hook for debounced value.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Custom hook for intersection observer (infinite scroll trigger).
 */
function useIntersectionObserver(
  callback: () => void,
  options?: {
    enabled?: boolean;
    rootMargin?: string;
  },
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { enabled = true, rootMargin = "100px" } = options ?? {};

  useEffect(() => {
    if (!enabled) return;

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callback();
        }
      },
      { rootMargin },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [callback, enabled, rootMargin]);

  return ref;
}

export const ThreadList: FC = () => {
  const runtime = useRuntimeContext();
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS);

  // Lift active thread state to share between New button and list items
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    runtime.getCurrentThreadId(),
  );

  // Handle new thread creation - clears selection
  const handleNewThread = useCallback(() => {
    setActiveThreadId(null);
    runtime.startNewThread();
  }, [runtime]);

  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col items-stretch gap-1.5">
      <ThreadListNew onNewThread={handleNewThread} />
      <ThreadSearchInput value={searchValue} onChange={setSearchValue} />
      <ThreadListItems
        search={debouncedSearch}
        activeThreadId={activeThreadId}
        onActiveThreadChange={setActiveThreadId}
      />
    </ThreadListPrimitive.Root>
  );
};

interface ThreadListNewProps {
  onNewThread: () => void;
}

const ThreadListNew: FC<ThreadListNewProps> = ({ onNewThread }) => {
  return (
    <Button
      className="aui-thread-list-new hover:bg-muted data-active:bg-muted flex items-center justify-start gap-1 rounded-lg px-2.5 py-2 text-start"
      variant="ghost"
      onClick={onNewThread}
    >
      <PlusIcon />
      New Thread
    </Button>
  );
};

interface ThreadSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

const ThreadSearchInput: FC<ThreadSearchInputProps> = ({ value, onChange }) => {
  return (
    <div className="relative px-1">
      <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
      <Input
        type="text"
        placeholder="Search threads..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-8 pr-8 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
          aria-label="Clear search"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
};

interface ThreadListItemsProps {
  search?: string;
  activeThreadId: string | null;
  onActiveThreadChange: (threadId: string | null) => void;
}

const ThreadListItems: FC<ThreadListItemsProps> = ({
  search,
  activeThreadId,
  onActiveThreadChange,
}) => {
  // Get the runtime for thread switching
  const runtime = useRuntimeContext();

  // Track loading state for thread switching
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  // Fetch threads with infinite pagination from database
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
  } = useThreads(search);

  // Delete thread mutation
  const deleteThread = useDeleteThread();

  // Flatten pages into a single array
  const threads = useMemo(
    () => flattenThreadPages(data?.pages),
    [data?.pages],
  );

  // Separate pinned and unpinned threads
  const { pinnedThreads, unpinnedThreads } = useMemo(() => {
    const pinned = threads.filter((t) => t.isPinned);
    const unpinned = threads.filter((t) => !t.isPinned);
    return { pinnedThreads: pinned, unpinnedThreads: unpinned };
  }, [threads]);

  // Infinite scroll trigger
  const loadMoreCallback = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const loadMoreRef = useIntersectionObserver(loadMoreCallback, {
    enabled: hasNextPage && !isFetchingNextPage,
  });

  // Handle thread selection - load messages from DB into runtime
  const handleSelectThread = useCallback(async (threadId: string) => {
    if (threadId === activeThreadId || isLoadingThread) return;

    setIsLoadingThread(true);
    onActiveThreadChange(threadId);

    try {
      // Fetch messages from database
      const dbMessages = await getAiThreadMessages(threadId);
      // Convert to external message format
      const externalMessages = dbMessages.map(convertToExternalMessage);
      // Load into runtime
      await runtime.loadThread(threadId, externalMessages);
    } catch (error) {
      console.error("Failed to load thread:", error);
      // Reset active thread on error
      onActiveThreadChange(runtime.getCurrentThreadId());
    } finally {
      setIsLoadingThread(false);
    }
  }, [activeThreadId, isLoadingThread, runtime, onActiveThreadChange]);

  // Handle delete confirmation
  const handleDeleteThread = useCallback((threadId: string) => {
    deleteThread.mutate(threadId);
    // If deleting the active thread, clear selection
    if (threadId === activeThreadId) {
      onActiveThreadChange(null);
      runtime.startNewThread();
    }
  }, [deleteThread, activeThreadId, onActiveThreadChange, runtime]);

  // Show skeleton on initial load
  if (isLoading) {
    return <ThreadListSkeleton />;
  }

  // Show empty state if no threads found
  if (threads.length === 0) {
    return (
      <div className="text-muted-foreground px-3 py-4 text-center text-sm">
        {search ? "No threads match your search." : "No conversations yet."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Pinned threads section */}
      {pinnedThreads.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <div className="text-muted-foreground flex items-center gap-1.5 px-3 py-1 text-xs font-medium">
            <PinIcon className="size-3" />
            Pinned
          </div>
          {pinnedThreads.map((thread) => (
            <ThreadListItemCustom
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              isLoading={isLoadingThread && activeThreadId === thread.id}
              isDeleting={deleteThread.isPending && deleteThread.variables === thread.id}
              onSelect={handleSelectThread}
              onDelete={handleDeleteThread}
            />
          ))}
        </div>
      )}

      {/* Unpinned threads section */}
      {unpinnedThreads.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {pinnedThreads.length > 0 && (
            <div className="text-muted-foreground px-3 py-1 text-xs font-medium">
              Recent
            </div>
          )}
          {unpinnedThreads.map((thread) => (
            <ThreadListItemCustom
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              isLoading={isLoadingThread && activeThreadId === thread.id}
              isDeleting={deleteThread.isPending && deleteThread.variables === thread.id}
              onSelect={handleSelectThread}
              onDelete={handleDeleteThread}
            />
          ))}
        </div>
      )}

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="h-1" />

      {/* Loading indicator for next page */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-2">
          <LoaderIcon className="text-muted-foreground size-4 animate-spin" />
        </div>
      )}

      {/* Show subtle loading indicator while refetching */}
      {isFetching && !isFetchingNextPage && !isLoading && (
        <div className="flex items-center justify-center py-1">
          <LoaderIcon className="text-muted-foreground size-3 animate-spin" />
        </div>
      )}
    </div>
  );
};

const ThreadListSkeleton: FC = () => {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          aria-live="polite"
          className="aui-thread-list-skeleton-wrapper flex items-center gap-2 rounded-md px-3 py-2"
        >
          <Skeleton className="aui-thread-list-skeleton h-[22px] grow" />
        </div>
      ))}
    </>
  );
};

/**
 * Custom thread list item that renders from database thread data.
 * Uses inline ActionConfirm for delete confirmation.
 */
interface ThreadListItemCustomProps {
  thread: ChatThread;
  isActive?: boolean;
  isLoading?: boolean;
  isDeleting?: boolean;
  onSelect: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}

const ThreadListItemCustom: FC<ThreadListItemCustomProps> = ({
  thread,
  isActive,
  isLoading,
  isDeleting,
  onSelect,
  onDelete,
}) => {
  return (
    <div
      className={`aui-thread-list-item hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring group flex items-center gap-2 rounded-lg transition-all focus-visible:ring-2 focus-visible:outline-none ${
        isActive ? "bg-muted" : ""
      }`}
      data-active={isActive || undefined}
    >
      <button
        type="button"
        className="aui-thread-list-item-trigger min-w-0 grow px-3 py-2 text-start"
        onClick={() => onSelect(thread.id)}
        disabled={isLoading || isDeleting}
      >
        <span className="aui-thread-list-item-title block truncate text-sm">
          {thread.title || "New Chat"}
        </span>
      </button>
      {isLoading ? (
        <LoaderIcon className="text-muted-foreground mr-2 size-4 shrink-0 animate-spin" />
      ) : (
        <ActionConfirm
          confirmTitle="Delete conversation?"
          confirmMessage={`This will permanently delete "${thread.title || "this conversation"}" and all its messages.`}
          confirmButtonText="Delete"
          confirmButtonVariant="destructive"
          isPending={isDeleting ?? false}
          pendingText="Deleting..."
          handleConfirm={() => onDelete(thread.id)}
          button={
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive mr-1 size-6 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
      )}
    </div>
  );
};
