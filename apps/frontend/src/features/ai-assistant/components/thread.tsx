import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAssistantState,
} from "@assistant-ui/react";

import type { FC, ReactNode } from "react";

import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { ComposerAddAttachment, ComposerAttachments, UserMessageAttachments } from "./attachment";
import { MarkdownText } from "./markdown-text";
import { ToolFallback } from "./tool-fallback";
import { TooltipIconButton } from "./tooltip-icon-button";

import { cn } from "@/lib/utils";
import { Reasoning, ReasoningGroup } from "./reasoning";

export interface ThreadProps {
  composerActions?: ReactNode;
}

export const Thread: FC<ThreadProps> = ({ composerActions }) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
      }}
    >
      <ThreadPrimitive.Viewport
        autoScroll
        scrollToBottomOnRunStart
        scrollToBottomOnInitialize
        scrollToBottomOnThreadSwitch
        className="aui-thread-viewport relative flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
      >
        <div className="flex min-h-full flex-col">
          <ThreadPrimitive.Empty>
            <ThreadWelcome />
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              EditComposer,
              AssistantMessage,
            }}
          />
          <div className="flex-1" />
          <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer bg-background max-w-(--thread-max-width) sticky bottom-0 mx-auto mt-4 flex w-full flex-col gap-4 overflow-visible rounded-t-3xl pb-4 md:pb-6">
            <ThreadScrollToBottom />
            <Composer composerActions={composerActions} />
            <p className="text-muted-foreground/70 text-center text-xs">
              Responses may be inaccurate. Not financial advice. Consult a qualified advisor.
            </p>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom behavior="smooth" asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <Icons.ArrowDown />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root max-w-(--thread-max-width) mx-auto my-auto flex w-full grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-8">
          <div className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-2 animate-in text-2xl font-semibold duration-300 ease-out">
            Hello there!
          </div>
          <div className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-2 animate-in text-muted-foreground/65 text-2xl delay-100 duration-300 ease-out">
            How can I help you today?
          </div>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions @md:grid-cols-2 grid w-full gap-2 pb-4">
      {[
        {
          title: "How is my portfolio",
          label: "performing this year?",
          action: "How is my portfolio performing this year?",
        },
        {
          title: "What are my top",
          label: "performing holdings?",
          action: "What are my top performing holdings?",
        },
        {
          title: "Show my dividend",
          label: "income summary",
          action: "Show my dividend income summary",
        },
        {
          title: "Analyze my portfolio",
          label: "asset allocation",
          action: "Analyze my portfolio asset allocation",
        },
      ].map((suggestedAction, index) => (
        <div
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-4 animate-in fill-mode-both nth-[n+3]:hidden @md:nth-[n+3]:block duration-300 ease-out"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <ThreadPrimitive.Suggestion prompt={suggestedAction.action} send asChild>
            <Button
              variant="ghost"
              className="aui-thread-welcome-suggestion dark:hover:bg-accent/60 @md:flex-col h-auto w-full flex-1 flex-wrap items-start justify-start gap-1 rounded-3xl border px-5 py-4 text-left text-sm"
              aria-label={suggestedAction.action}
            >
              <span className="aui-thread-welcome-suggestion-text-1 font-medium">
                {suggestedAction.title}
              </span>
              <span className="aui-thread-welcome-suggestion-text-2 text-muted-foreground">
                {suggestedAction.label}
              </span>
            </Button>
          </ThreadPrimitive.Suggestion>
        </div>
      ))}
    </div>
  );
};

interface ComposerProps {
  composerActions?: ReactNode;
}

const Composer: FC<ComposerProps> = ({ composerActions }) => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone className="aui-composer-attachment-dropzone border-input bg-background has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-ring/50 data-[dragging=true]:border-ring data-[dragging=true]:bg-accent/50 dark:bg-background shadow-xs flex w-full flex-col rounded-3xl border px-1 pt-2 outline-none transition-[color,box-shadow] has-[textarea:focus-visible]:ring-[3px] data-[dragging=true]:border-dashed">
        <ComposerAttachments />
        <ComposerPrimitive.Input
          placeholder="Send a message..."
          className="aui-composer-input placeholder:text-muted-foreground mb-1 max-h-32 min-h-16 w-full resize-none bg-transparent px-3.5 pb-3 pt-1.5 text-base outline-none focus-visible:ring-0"
          rows={1}
          autoFocus
          aria-label="Message input"
        />
        <ComposerAction composerActions={composerActions} />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

interface ComposerActionProps {
  composerActions?: ReactNode;
}

const ComposerAction: FC<ComposerActionProps> = ({ composerActions }) => {
  return (
    <div className="aui-composer-action-wrapper relative mx-1 mb-2 mt-2 flex items-center justify-between">
      <div className="flex items-center gap-1">
        <ComposerAddAttachment />
        {composerActions}
      </div>

      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send message"
            side="bottom"
            type="submit"
            variant="default"
            size="icon"
            className="aui-composer-send size-[34px] rounded-full p-1"
            aria-label="Send message"
          >
            <Icons.ArrowUp className="aui-composer-send-icon size-5" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>

      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90 size-[34px] rounded-full border"
            aria-label="Stop generating"
          >
            <Icons.Square className="aui-composer-cancel-icon size-3.5 fill-white dark:fill-black" />
          </Button>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const TypingIndicator: FC = () => {
  const showIndicator = useAssistantState(({ message }) => {
    // Show indicator when message is running and has no text/tool content yet
    if (message.status?.type !== "running") return false;
    // Hide if there are any parts (text started streaming or tools are being called)
    return message.parts.length === 0;
  });

  if (!showIndicator) return null;

  return (
    <div className="bg-muted mb-2 inline-flex items-end gap-1 rounded-2xl px-3.5 pb-2.5 pt-3">
      <span className="bg-foreground/50 size-2 animate-bounce rounded-full [animation-delay:-0.3s]" />
      <span className="bg-foreground/50 size-2 animate-bounce rounded-full [animation-delay:-0.15s]" />
      <span className="bg-foreground/50 size-2 animate-bounce rounded-full" />
    </div>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message-root fade-in slide-in-from-bottom-1 animate-in max-w-(--thread-max-width) relative mx-auto w-full py-4 duration-150 ease-out"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content text-foreground wrap-break-word mx-2 text-sm leading-6">
        <TypingIndicator />
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning: Reasoning,
            ReasoningGroup: ReasoningGroup,
            ToolGroup: ({ children }) => <div className="mb-6">{children}</div>,
            tools: {
              Fallback: ToolFallback,
            },
          }}
        />
        <MessageError />
      </div>

      <div className="aui-assistant-message-footer ml-2 mt-2 flex">
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="aui-assistant-action-bar-root text-muted-foreground data-floating:bg-background data-floating:absolute data-floating:rounded-md data-floating:border data-floating:p-1 data-floating:shadow-sm col-start-3 row-start-2 -ml-1 flex gap-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <Icons.Check />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <Icons.Copy />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <Icons.RefreshCw />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-user-message-root fade-in slide-in-from-bottom-1 animate-in max-w-(--thread-max-width) mx-auto grid w-full auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-4 duration-150 ease-out [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content bg-muted text-foreground wrap-break-word rounded-3xl px-5 py-2.5 text-sm">
          <MessagePrimitive.Parts
            components={{
              Reasoning: Reasoning,
              ReasoningGroup: ReasoningGroup,
            }}
          />
        </div>
        <div className="aui-user-action-bar-wrapper absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 pr-2">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
          <Icons.Pencil />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="aui-edit-composer-wrapper max-w-(--thread-max-width) mx-auto flex w-full flex-col gap-4 px-2">
      <ComposerPrimitive.Root className="aui-edit-composer-root bg-muted max-w-7/8 ml-auto flex w-full flex-col rounded-xl">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground flex min-h-[60px] w-full resize-none bg-transparent p-4 outline-none"
          autoFocus
        />

        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center justify-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" aria-label="Cancel edit">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" aria-label="Update message">
              Update
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ml-2 mr-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <Icons.ChevronLeft />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <Icons.ChevronRight />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
