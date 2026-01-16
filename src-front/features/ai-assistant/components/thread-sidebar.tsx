import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";
import type { ChatThread } from "../types";

interface ThreadSidebarProps {
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  className?: string;
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  className,
}: ThreadSidebarProps) {
  return (
    <div className={cn("flex h-full flex-col border-r", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="text-sm font-semibold">Conversations</h2>
        <Button variant="ghost" size="icon" onClick={onNewThread} className="h-8 w-8">
          <Icons.Plus className="h-4 w-4" />
          <span className="sr-only">New conversation</span>
        </Button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto p-2">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Icons.Sparkles className="text-muted-foreground mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">No conversations yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Start a new chat to ask questions about your portfolio
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  "hover:bg-accent w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activeThreadId === thread.id && "bg-accent",
                )}
              >
                <div className="truncate font-medium">{thread.title}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  {new Date(thread.updatedAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
