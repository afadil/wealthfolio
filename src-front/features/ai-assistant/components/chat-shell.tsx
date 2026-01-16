import { useState, useCallback, useEffect } from "react";
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
} from "../hooks/use-threads";
import type { ChatMessage } from "../types";

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

  // Thread management hooks
  const { data: threads = [], isLoading: isLoadingThreads } = useThreads();
  const renameThread = useRenameThread();
  const deleteThread = useDeleteThread();
  const togglePin = useToggleThreadPin();

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

  const handleSendMessage = useCallback(
    (content: string) => {
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
      setIsStreaming(true);
      setTimeout(() => {
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
      }, 1000);
    },
    [activeThreadId],
  );

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
        onSendMessage={handleSendMessage}
        className="flex-1"
      />
    </div>
  );
}
