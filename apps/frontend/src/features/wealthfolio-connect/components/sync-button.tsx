import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";
import { useAggregatedSyncStatus, useSyncBrokerData } from "../hooks";
import type { AggregatedSyncStatus } from "../types";

interface SyncButtonProps {
  /** Optional class name for the button */
  className?: string;
  /** Show label text alongside icon */
  showLabel?: boolean;
  /** Button size */
  size?: "default" | "sm" | "icon";
}

const statusColors: Record<AggregatedSyncStatus, string> = {
  not_connected: "text-muted-foreground",
  idle: "text-green-500",
  running: "text-blue-500",
  needs_review: "text-yellow-500",
  failed: "text-red-500",
};

/**
 * Contextual sync button that shows sync status and triggers sync.
 * Only visible when Connect is enabled and user has an active subscription.
 */
export function SyncButton({ className, showLabel = false, size = "icon" }: SyncButtonProps) {
  const { isEnabled, isConnected, userInfo } = useWealthfolioConnect();
  const { status, lastSyncTime } = useAggregatedSyncStatus();
  const { mutate: syncBrokerData, isPending: isSyncing } = useSyncBrokerData();

  // Check if user has an active subscription
  const hasSubscription =
    userInfo?.team?.subscription_status === "active" ||
    userInfo?.team?.subscription_status === "trialing";

  // Only show when Connect is enabled and user has subscription
  if (!isEnabled || !isConnected || !hasSubscription) {
    return null;
  }

  const isRunning = status === "running" || isSyncing;
  const colorClass = statusColors[status];

  const tooltipContent = lastSyncTime
    ? `Last synced ${formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true })}`
    : "Never synced";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          onClick={() => syncBrokerData()}
          disabled={isRunning}
          className={className}
        >
          {isRunning ? (
            <Icons.Spinner className="h-4 w-4 animate-spin" />
          ) : (
            <Icons.RefreshCw className={`h-4 w-4 ${colorClass}`} />
          )}
          {showLabel && <span className="ml-2">{isRunning ? "Syncing..." : "Sync"}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isRunning ? "Syncing..." : tooltipContent}</p>
      </TooltipContent>
    </Tooltip>
  );
}
