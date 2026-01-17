import { ThreadListItemPrimitive, ThreadListPrimitive, useAssistantState } from "@assistant-ui/react";
import { ArchiveIcon, PlusIcon, SearchIcon, XIcon, LoaderIcon, PinIcon } from "lucide-react";
import { type FC, useState, useEffect, useRef, useCallback, useMemo } from "react";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { TooltipIconButton } from "./tooltip-icon-button";
import { useThreads, flattenThreadPages } from "../hooks/use-threads";

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
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS);

  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col items-stretch gap-1.5">
      <ThreadListNew />
      <ThreadSearchInput value={searchValue} onChange={setSearchValue} />
      <ThreadListItems search={debouncedSearch} />
    </ThreadListPrimitive.Root>
  );
};

const ThreadListNew: FC = () => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button
        className="aui-thread-list-new hover:bg-muted data-active:bg-muted flex items-center justify-start gap-1 rounded-lg px-2.5 py-2 text-start"
        variant="ghost"
      >
        <PlusIcon />
        New Thread
      </Button>
    </ThreadListPrimitive.New>
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
}

const ThreadListItems: FC<ThreadListItemsProps> = ({ search }) => {
  // Use assistant-ui loading state for initial load indicator
  const isAssistantLoading = useAssistantState(({ threads }) => threads.isLoading);

  // Fetch threads with infinite pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
  } = useThreads(search);

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

  // Show skeleton on initial load
  if (isLoading || isAssistantLoading) {
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
            <ThreadListItem key={thread.id} />
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
          <ThreadListPrimitive.Items components={{ ThreadListItem }} />
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

const ThreadListItem: FC = () => {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring data-active:bg-muted flex items-center gap-2 rounded-lg transition-all focus-visible:ring-2 focus-visible:outline-none">
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger grow px-3 py-2 text-start">
        <ThreadListItemTitle />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemArchive />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemTitle: FC = () => {
  return (
    <span className="aui-thread-list-item-title text-sm">
      <ThreadListItemPrimitive.Title fallback="New Chat" />
    </span>
  );
};

const ThreadListItemArchive: FC = () => {
  return (
    <ThreadListItemPrimitive.Archive asChild>
      <TooltipIconButton
        className="aui-thread-list-item-archive text-foreground hover:text-primary mr-3 ml-auto size-4 p-0"
        variant="ghost"
        tooltip="Archive thread"
      >
        <ArchiveIcon />
      </TooltipIconButton>
    </ThreadListItemPrimitive.Archive>
  );
};
