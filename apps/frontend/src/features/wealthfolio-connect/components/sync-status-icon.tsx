import { CloudWarningIcon } from "@phosphor-icons/react/dist/csr/CloudWarning";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Spinner } from "@wealthfolio/ui/components/ui/spinner";
import { cn } from "@wealthfolio/ui/lib/utils";
import type { AggregatedSyncStatus } from "../types";

interface SyncStatusIconProps {
  status: AggregatedSyncStatus;
  className?: string;
}

export function SyncStatusIcon({ status, className }: SyncStatusIconProps) {
  const iconClassName = cn("size-6", className);

  if (status === "restoring")
    return (
      <Spinner className={cn(iconClassName, "text-muted-foreground motion-reduce:animate-none")} />
    );
  if (status === "subscription_required" || status === "unavailable") {
    return <CloudWarningIcon weight="duotone" className={cn(iconClassName, "text-warning")} />;
  }

  // For not_connected, show a muted cloud icon
  if (status === "not_connected") {
    return <Icons.CloudOff className={cn(iconClassName, "text-muted-foreground")} />;
  }

  // For connected states, show CloudSync2 with appropriate indicator
  return (
    <div className="relative">
      <Icons.CloudSync2 className={iconClassName} />
      <StatusIndicator status={status} />
    </div>
  );
}

function StatusIndicator({ status }: { status: AggregatedSyncStatus }) {
  // Only show indicator for states that need attention
  if (status === "needs_review") {
    // Yellow/warning dot
    return (
      <span className="absolute -right-0.5 -top-0.5 flex h-1.5 w-1.5">
        <span className="bg-warning/80 absolute inline-flex h-full w-full rounded-full" />
      </span>
    );
  }

  if (status === "failed") {
    // Red/error dot
    return (
      <span className="absolute -right-0.5 -top-0.5 flex h-1.5 w-1.5">
        <span className="bg-destructive/80 absolute inline-flex h-full w-full rounded-full" />
      </span>
    );
  }

  // No indicator for idle, running, or not_connected
  return null;
}
