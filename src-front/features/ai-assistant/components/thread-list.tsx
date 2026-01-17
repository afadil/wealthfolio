import { ThreadListPrimitive } from "@assistant-ui/react";
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icons } from "@wealthfolio/ui/components/ui/icons";

import { ActionConfirm } from "@wealthfolio/ui/components/common";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useRuntimeContext } from "../hooks/use-runtime-context";
import { flattenThreadPages, useDeleteThread, useThreads, useToggleThreadPin } from "../hooks/use-threads";
import type { ChatThread } from "../types";

/** Debounce delay for search input (ms) */
const SEARCH_DEBOUNCE_MS = 300;

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

  // Handle new thread creation - clears selection
  const handleNewThread = useCallback(() => {
    runtime.threads.switchToNewThread();
  }, [runtime]);

  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col items-stretch gap-1.5">
      <ThreadListNew onNewThread={handleNewThread} />
      <ThreadSearchInput value={searchValue} onChange={setSearchValue} />
      <ThreadListItems
        search={debouncedSearch}
        activeThreadId={runtime.currentThreadId}
        switchingThreadId={runtime.switchingThreadId}
        onThreadListStateChange={runtime.setThreadListState}
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
      className="aui-thread-list-new hover:bg-muted data-active:bg-muted flex items-center justify-start gap-1 rounded-lg px-2.5 py-2 text-start text-xs"
      variant="ghost"
      onClick={onNewThread}
    >
      <Icons.Plus className="size-3.5" />
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
      <Icons.Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="text"
        placeholder="Search threads..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pr-8 pl-8 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          aria-label="Clear search"
        >
          <Icons.Close className="size-4" />
        </button>
      )}
    </div>
  );
};

interface ThreadListItemsProps {
  search?: string;
  activeThreadId: string | null;
  switchingThreadId: string | null;
  onThreadListStateChange: (threads: ChatThread[], isLoading: boolean) => void;
}

const ThreadListItems: FC<ThreadListItemsProps> = ({
  search,
  activeThreadId,
  switchingThreadId,
  onThreadListStateChange,
}) => {
  // Get the runtime for thread switching
  const runtime = useRuntimeContext();

  // Fetch threads with infinite pagination from database
  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isLoading } =
    useThreads(search);

  // Delete thread mutation
  const deleteThread = useDeleteThread();

  // Pin/unpin thread mutation
  const togglePin = useToggleThreadPin();

  // Flatten pages into a single array
  const threads = useMemo(() => flattenThreadPages(data?.pages), [data?.pages]);

  useEffect(() => {
    onThreadListStateChange(threads, isLoading);
  }, [threads, isLoading, onThreadListStateChange]);

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
  const handleSelectThread = useCallback(
    async (threadId: string) => {
      try {
        if (threadId === activeThreadId || switchingThreadId) return;
        await runtime.threads.switchToThread(threadId);
      } catch (error) {
        console.error("Failed to switch thread:", error);
      }
    },
    [activeThreadId, switchingThreadId, runtime],
  );

  // Handle delete confirmation
  const handleDeleteThread = useCallback(
    (threadId: string) => {
      deleteThread.mutate(threadId);
      // If deleting the active thread, clear selection
      if (threadId === activeThreadId) {
        runtime.threads.switchToNewThread();
      }
    },
    [deleteThread, activeThreadId, runtime],
  );

  // Handle pin/unpin toggle
  const handleTogglePin = useCallback(
    (threadId: string, currentlyPinned: boolean) => {
      togglePin.mutate({ id: threadId, isPinned: !currentlyPinned });
    },
    [togglePin],
  );

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
            <Icons.Pin className="size-3" />
            Pinned
          </div>
          {pinnedThreads.map((thread) => (
            <ThreadListItemCustom
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              isLoading={switchingThreadId === thread.id}
              isDeleting={deleteThread.isPending && deleteThread.variables === thread.id}
              onSelect={handleSelectThread}
              onDelete={handleDeleteThread}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      )}

      {/* Unpinned threads section */}
      {unpinnedThreads.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {pinnedThreads.length > 0 && (
            <div className="text-muted-foreground px-3 py-1 text-xs font-medium">Recent</div>
          )}
          {unpinnedThreads.map((thread) => (
            <ThreadListItemCustom
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              isLoading={switchingThreadId === thread.id}
              isDeleting={deleteThread.isPending && deleteThread.variables === thread.id}
              onSelect={handleSelectThread}
              onDelete={handleDeleteThread}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      )}

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="h-1" />

      {/* Loading indicator for next page */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-2">
          <Icons.Spinner className="text-muted-foreground size-4 animate-spin" />
        </div>
      )}

      {/* Show subtle loading indicator while refetching */}
      {isFetching && !isFetchingNextPage && !isLoading && (
        <div className="flex items-center justify-center py-1">
          <Icons.Spinner className="text-muted-foreground size-3 animate-spin" />
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
  onTogglePin: (threadId: string, isPinned: boolean) => void;
}

const ThreadListItemCustom: FC<ThreadListItemCustomProps> = ({
  thread,
  isActive,
  isLoading,
  isDeleting,
  onSelect,
  onDelete,
  onTogglePin,
}) => {
  return (
    <div
      className={`aui-thread-list-item hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring group relative rounded-lg transition-all focus-visible:ring-2 focus-visible:outline-none ${
        isActive ? "bg-muted" : ""
      }`}
      data-active={isActive || undefined}
    >
      <button
        type="button"
        className="aui-thread-list-item-trigger w-full px-3 py-2 text-start"
        onClick={() => onSelect(thread.id)}
        disabled={isLoading || isDeleting}
      >
        <span className="aui-thread-list-item-title line-clamp-1 text-xs tracking-tighter [word-spacing:-0.2em]">
          {thread.title || "New Chat"}
        </span>
      </button>
      {isLoading ? (
        <div className="absolute inset-y-0 right-2 flex items-center">
          <Icons.Spinner className="text-muted-foreground size-4 animate-spin" />
        </div>
      ) : (
        <div className="bg-muted/80 absolute inset-y-0 right-1 flex items-center gap-0.5 rounded-r-lg px-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-500 hover:text-blue-600 size-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(thread.id, thread.isPinned);
            }}
            title={thread.isPinned ? "Unpin" : "Pin"}
          >
            {thread.isPinned ? <Icons.PinOff className="size-3.5" /> : <Icons.Pin className="size-3.5" />}
          </Button>
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
                className="text-destructive hover:text-destructive/80 size-6 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Icons.Trash2 className="size-3.5" />
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
};
