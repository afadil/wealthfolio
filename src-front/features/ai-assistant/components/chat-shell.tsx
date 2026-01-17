import { useState, useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { Thread } from "./thread";
import { ThreadList } from "./thread-list";
import { ProviderPicker } from "./provider-picker";
import { ModelPicker } from "./model-picker";
import {
  AccountsToolUI,
  ActivitiesToolUI,
  AllocationToolUI,
  DividendsToolUI,
  GoalsToolUI,
  HoldingsToolUI,
  PerformanceToolUI,
  ValuationToolUI,
} from "./tool-uis";
import { useChatModel } from "../hooks/use-chat-model";
import { useChatRuntime } from "../hooks/use-chat-runtime";
import { RuntimeProvider } from "../hooks/use-runtime-context";

interface ChatShellProps {
  className?: string;
}

/**
 * Button with tooltip helper component.
 */
function ButtonWithTooltip({
  children,
  tooltip,
  side = "bottom",
  ...props
}: React.ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props}>
          {children}
          <span className="sr-only">{tooltip}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Sidebar component for thread list.
 */
function Sidebar({ collapsed }: { collapsed?: boolean }) {
  return (
    <aside
      className={cn(
        "bg-muted/30 flex h-full flex-col border-r transition-all duration-200",
        collapsed ? "w-0 overflow-hidden opacity-0" : "w-[260px] opacity-100",
      )}
    >
      <div className="flex-1 overflow-y-auto p-3">
        <ThreadList />
      </div>
    </aside>
  );
}

/**
 * Mobile sidebar using Sheet component.
 */
function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 shrink-0 md:hidden">
          <Icons.PanelLeft className="size-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold">Conversations</span>
        </div>
        <div className="p-3">
          <ThreadList />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Header component with sidebar toggle and provider/model pickers.
 */
function Header({
  sidebarCollapsed,
  onToggleSidebar,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <MobileSidebar />
      <ButtonWithTooltip
        variant="ghost"
        size="icon"
        tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        side="bottom"
        onClick={onToggleSidebar}
        className="hidden size-9 md:flex"
      >
        <Icons.PanelLeft className="size-4" />
      </ButtonWithTooltip>
      <ProviderPicker />
      <div className="flex-1" />
    </header>
  );
}

/**
 * Main chat shell component with thread sidebar and message panel.
 * Uses @assistant-ui/react for the chat interface.
 */
export function ChatShell({ className }: ChatShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { currentProviderId, currentModelId } = useChatModel();

  // Build chat config from current selection
  const chatConfig = useMemo(() => {
    if (!currentProviderId || !currentModelId) {
      return undefined;
    }
    return { provider: currentProviderId, model: currentModelId };
  }, [currentProviderId, currentModelId]);

  // Create the chat runtime
  const runtime = useChatRuntime(chatConfig);

  return (
    <RuntimeProvider runtime={runtime}>
      <AssistantRuntimeProvider runtime={runtime}>
        {/* Tool UIs - must be children of AssistantRuntimeProvider to register */}
        <HoldingsToolUI />
        <AccountsToolUI />
        <ActivitiesToolUI />
        <GoalsToolUI />
        <ValuationToolUI />
        <DividendsToolUI />
        <AllocationToolUI />
        <PerformanceToolUI />

        <div className={cn("bg-background flex h-full w-full", className)}>
          {/* Desktop Sidebar */}
          <div className="hidden md:block">
            <Sidebar collapsed={sidebarCollapsed} />
          </div>

          {/* Main Content Area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            />

            {/* Thread (Chat Messages) */}
            <main className="flex-1 overflow-hidden">
              <Thread composerActions={<ModelPicker />} />
            </main>
          </div>
        </div>
      </AssistantRuntimeProvider>
    </RuntimeProvider>
  );
}
