import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ThreadSidebar } from "./thread-sidebar";
import { MessagePanel } from "./message-panel";
import type { ChatThread, ChatMessage } from "../types";

interface ChatShellProps {
  className?: string;
}

/**
 * Main chat shell component with thread sidebar and message panel.
 * Currently uses placeholder state - will be connected to backend in future iterations.
 */
export function ChatShell({ className }: ChatShellProps) {
  // Placeholder state - will be replaced with actual data fetching
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleNewThread = useCallback(() => {
    const newThread: ChatThread = {
      id: crypto.randomUUID(),
      title: "New conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
    setMessages([]);
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    // TODO: Load messages for selected thread
    setMessages([]);
  }, []);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!activeThreadId) {
        // Create a new thread if none exists
        handleNewThread();
      }

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
    [activeThreadId, handleNewThread],
  );

  return (
    <div className={cn("flex h-full", className)}>
      {/* Thread Sidebar - hidden on mobile */}
      <ThreadSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        className="hidden w-64 lg:flex"
      />

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
