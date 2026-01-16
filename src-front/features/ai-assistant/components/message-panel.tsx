import { useRef, useEffect, useState } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatError } from "../types";

interface MessagePanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: ChatError | null;
  onSendMessage: (content: string) => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismissError?: () => void;
  className?: string;
}

export function MessagePanel({
  messages,
  isStreaming,
  error,
  onSendMessage,
  onCancel,
  onRetry,
  onDismissError,
  className,
}: MessagePanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Icons.Sparkles className="text-muted-foreground mb-4 h-12 w-12" />
            <h3 className="text-lg font-semibold">How can I help you today?</h3>
            <p className="text-muted-foreground mt-2 max-w-md text-sm">
              Ask me anything about your portfolio, holdings, performance, or financial insights.
            </p>
            <div className="mt-6 grid gap-2 text-sm">
              <SuggestionChip>What are my top performing holdings?</SuggestionChip>
              <SuggestionChip>Show me my portfolio allocation</SuggestionChip>
              <SuggestionChip>How has my portfolio performed this year?</SuggestionChip>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {/* Error display with retry action */}
            {error && (
              <ErrorMessage
                error={error}
                onRetry={onRetry}
                onDismiss={onDismissError}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your portfolio..."
            className="min-h-[44px] max-h-32 resize-none"
            disabled={isStreaming}
            rows={1}
          />
          {isStreaming && onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="shrink-0"
            >
              <Icons.X className="h-4 w-4" />
              <span className="sr-only">Cancel</span>
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim() || isStreaming} className="shrink-0">
              {isStreaming ? (
                <Icons.Spinner className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.ArrowUp className="h-4 w-4" />
              )}
              <span className="sr-only">Send message</span>
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        {/* TODO: Render tool calls/results when implemented */}
      </div>
    </div>
  );
}

function SuggestionChip({ children }: { children: string }) {
  return (
    <button className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-full border px-4 py-2 text-sm transition-colors">
      {children}
    </button>
  );
}

interface ErrorMessageProps {
  error: ChatError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function ErrorMessage({ error, onRetry, onDismiss }: ErrorMessageProps) {
  return (
    <Alert variant="destructive" className="max-w-[80%]">
      <Icons.AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{error.message}</span>
        <div className="flex items-center gap-2 shrink-0">
          {error.retryable && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-7 px-2"
            >
              <Icons.Refresh className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="h-7 w-7 p-0"
            >
              <Icons.X className="h-3 w-3" />
              <span className="sr-only">Dismiss</span>
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
