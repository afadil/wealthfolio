import { useRef, useEffect, useState, type ReactNode } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatError, ToolCall, ToolResult, ChatMessagePart } from "../types";
import { ToolResultRenderer } from "./tool-renderers";

/**
 * Extract text content from structured message parts.
 */
function getTextContent(parts: ChatMessagePart[]): string {
  return parts
    .filter((p): p is { type: "text"; content: string } => p.type === "text")
    .map((p) => p.content)
    .join("");
}

/**
 * Extract reasoning content from structured message parts.
 */
function getReasoningContent(parts: ChatMessagePart[]): string | undefined {
  const reasoning = parts
    .filter((p): p is { type: "reasoning"; content: string } => p.type === "reasoning")
    .map((p) => p.content)
    .join("");
  return reasoning.trim() || undefined;
}

/**
 * Extract tool calls from structured message parts.
 */
function getToolCalls(parts: ChatMessagePart[]): ToolCall[] {
  return parts
    .filter((p): p is Extract<ChatMessagePart, { type: "toolCall" }> => p.type === "toolCall")
    .map((p) => ({
      id: p.toolCallId,
      name: p.name,
      arguments: p.arguments,
    }));
}

/**
 * Extract tool results from structured message parts.
 */
function getToolResults(parts: ChatMessagePart[]): ToolResult[] {
  return parts
    .filter((p): p is Extract<ChatMessagePart, { type: "toolResult" }> => p.type === "toolResult")
    .map((p) => ({
      toolCallId: p.toolCallId,
      success: p.success,
      data: p.data,
      meta: p.meta,
      error: p.error,
    }));
}

interface MessagePanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: ChatError | null;
  onSendMessage: (content: string) => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismissError?: () => void;
  /** Optional actions to render in the composer area (e.g., ModelPicker) */
  composerActions?: ReactNode;
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
  composerActions,
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your portfolio..."
              className="min-h-[44px] max-h-32 flex-1 resize-none"
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
          </div>
          {/* Composer actions (e.g., Model Picker) */}
          {composerActions && (
            <div className="flex items-center">
              {composerActions}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const isUser = message.role === "user";

  // Extract structured content from message parts
  const parts = message.content.parts;
  const textContent = getTextContent(parts);
  const reasoning = getReasoningContent(parts);
  const toolCalls = getToolCalls(parts);
  const toolResults = getToolResults(parts);

  const hasToolResults = toolResults.length > 0;
  const hasToolCalls = toolCalls.length > 0;
  const hasReasoning = !!reasoning;

  // Build a map from toolCallId to tool name for rendering
  const toolCallMap = new Map<string, ToolCall>();
  for (const tc of toolCalls) {
    toolCallMap.set(tc.id, tc);
  }

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      {/* Reasoning/thinking content (collapsible) */}
      {hasReasoning && (
        <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen} className="max-w-[85%]">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground gap-1.5 px-2 text-xs"
            >
              <Icons.Brain className="h-3 w-3" />
              <span>Thinking</span>
              <Icons.ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  reasoningOpen && "rotate-180",
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-muted/50 mt-1 rounded-lg border border-dashed px-3 py-2">
              <p className="text-muted-foreground whitespace-pre-wrap text-xs italic">
                {reasoning}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Text content */}
      {textContent && (
        <div
          className={cn(
            "max-w-[85%] rounded-lg px-4 py-2",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          <p className="whitespace-pre-wrap text-sm">{textContent}</p>
        </div>
      )}

      {/* Tool calls in progress (no results yet) */}
      {hasToolCalls && !hasToolResults && (
        <div className="flex max-w-[85%] flex-wrap gap-2">
          {toolCalls.map((tc) => (
            <ToolCallBadge key={tc.id} toolCall={tc} isPending />
          ))}
        </div>
      )}

      {/* Tool results with deterministic UI */}
      {hasToolResults && (
        <div className="flex w-full max-w-[85%] flex-col gap-2">
          {toolResults.map((result) => {
            const toolCall = toolCallMap.get(result.toolCallId);
            const toolName = toolCall?.name ?? "unknown";
            return (
              <ToolResultRenderer
                key={result.toolCallId}
                toolName={toolName}
                result={result}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Badge showing a tool call in progress.
 */
function ToolCallBadge({ toolCall, isPending }: { toolCall: ToolCall; isPending?: boolean }) {
  return (
    <div className="bg-muted flex items-center gap-1.5 rounded-md px-2 py-1">
      {isPending ? (
        <Icons.Spinner className="h-3 w-3 animate-spin" />
      ) : (
        <Icons.CheckCircle className="text-success h-3 w-3" />
      )}
      <span className="text-muted-foreground text-xs">
        {formatToolNameShort(toolCall.name)}
      </span>
    </div>
  );
}

/**
 * Format tool name for compact display.
 */
function formatToolNameShort(toolName: string): string {
  // Remove get_ prefix and format
  return toolName
    .replace(/^get_/, "")
    .replace(/_/g, " ");
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
