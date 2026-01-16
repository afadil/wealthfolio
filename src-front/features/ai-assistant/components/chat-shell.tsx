import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthfolio/ui/components/ui/sheet";
import { ThreadSidebar } from "./thread-sidebar";
import { MessagePanel } from "./message-panel";
import {
  useThreads,
  useRenameThread,
  useDeleteThread,
  useToggleThreadPin,
  useAddThreadTag,
  useRemoveThreadTag,
} from "../hooks/use-threads";
import type { ChatMessage, ChatError } from "../types";
import { parseErrorCode } from "../types";

interface ChatShellProps {
  className?: string;
}

/**
 * Main chat shell component with thread sidebar and message panel.
 * Uses hooks for thread management and supports responsive layout with
 * a mobile drawer for the sidebar.
 */
export function ChatShell({ className }: ChatShellProps) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);

  // AbortController for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Thread management hooks
  const { data: threads = [], isLoading: isLoadingThreads } = useThreads();
  const renameThread = useRenameThread();
  const deleteThread = useDeleteThread();
  const togglePin = useToggleThreadPin();
  const addTag = useAddThreadTag();
  const removeTag = useRemoveThreadTag();

  // Auto-select first thread if none selected and threads exist
  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThreadId(threads[0].id);
    }
  }, [activeThreadId, threads]);

  // If active thread is deleted, select another
  useEffect(() => {
    if (activeThreadId && threads.length > 0) {
      const threadExists = threads.some((t) => t.id === activeThreadId);
      if (!threadExists) {
        setActiveThreadId(threads[0]?.id ?? null);
        setMessages([]);
      }
    }
  }, [activeThreadId, threads]);

  const handleNewThread = useCallback(() => {
    // For now, just clear the active thread to start a new conversation
    // In the future, this will create a thread via backend when first message is sent
    setActiveThreadId(null);
    setMessages([]);
    setMobileSheetOpen(false);
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    // TODO: Load messages for selected thread from backend
    setMessages([]);
    setMobileSheetOpen(false);
  }, []);

  const handleRenameThread = useCallback(
    (threadId: string, newTitle: string) => {
      renameThread.mutate({ id: threadId, title: newTitle });
    },
    [renameThread],
  );

  const handleDeleteThread = useCallback(
    (threadId: string) => {
      deleteThread.mutate(threadId);
    },
    [deleteThread],
  );

  const handleTogglePin = useCallback(
    (threadId: string, isPinned: boolean) => {
      togglePin.mutate({ id: threadId, isPinned });
    },
    [togglePin],
  );

  const handleAddTag = useCallback(
    (threadId: string, tag: string) => {
      addTag.mutate({ threadId, tag });
    },
    [addTag],
  );

  const handleRemoveTag = useCallback(
    (threadId: string, tag: string) => {
      removeTag.mutate({ threadId, tag });
    },
    [removeTag],
  );

  const handleSendMessage = useCallback(
    (content: string) => {
      // Clear any previous error
      setError(null);
      // Store for retry
      setLastUserMessage(content);

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();

      // Add user message (placeholder - will be persisted in future)
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        threadId: activeThreadId ?? "",
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Simulate assistant response (placeholder)
      // In real implementation, this would use the abortControllerRef.current.signal
      setIsStreaming(true);

      const timeoutId = setTimeout(() => {
        // Check if cancelled
        if (abortControllerRef.current?.signal.aborted) {
          setIsStreaming(false);
          setError(parseErrorCode("cancelled"));
          return;
        }

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          threadId: activeThreadId ?? "",
          role: "assistant",
          content:
            "This is a placeholder response. The AI chat functionality will be implemented in a future iteration.",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }, 1000);

      // Store timeout for cleanup on abort
      abortControllerRef.current.signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        setIsStreaming(false);
      });
    },
    [activeThreadId],
  );

  // Cancel the current streaming response
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setError(parseErrorCode("cancelled"));
    }
  }, []);

  // Retry the last message
  const handleRetry = useCallback(() => {
    if (lastUserMessage) {
      // Remove the last user message from the list (it will be re-added)
      setMessages((prev) => {
        // Find and remove the last user message
        const lastUserIdx = [...prev].reverse().findIndex((m) => m.role === "user");
        if (lastUserIdx >= 0) {
          const idx = prev.length - 1 - lastUserIdx;
          return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        }
        return prev;
      });
      setError(null);
      handleSendMessage(lastUserMessage);
    }
  }, [lastUserMessage, handleSendMessage]);

  // Dismiss the error
  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  // Sidebar content - shared between desktop and mobile
  const sidebarContent = (
    <ThreadSidebar
      threads={threads}
      activeThreadId={activeThreadId}
      isLoading={isLoadingThreads}
      onSelectThread={handleSelectThread}
      onNewThread={handleNewThread}
      onRenameThread={handleRenameThread}
      onDeleteThread={handleDeleteThread}
      onTogglePin={handleTogglePin}
      onAddTag={handleAddTag}
      onRemoveTag={handleRemoveTag}
      className="h-full w-full border-r-0 lg:border-r"
    />
  );

  return (
    <div className={cn("flex h-full", className)}>
      {/* Mobile Sidebar Toggle */}
      <div className="absolute left-3 top-3 z-10 lg:hidden">
        <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Icons.PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle conversations</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Conversations</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden w-64 lg:flex">{sidebarContent}</div>

      {/* Message Panel */}
      <MessagePanel
        messages={messages}
        isStreaming={isStreaming}
        error={error}
        onSendMessage={handleSendMessage}
        onCancel={handleCancel}
        onRetry={handleRetry}
        onDismissError={handleDismissError}
        className="flex-1"
      />
    </div>
  );
}
