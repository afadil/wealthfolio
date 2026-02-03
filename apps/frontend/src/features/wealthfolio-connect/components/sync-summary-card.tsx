import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { formatDistanceToNow } from "date-fns";
import type { AggregatedSyncStatus } from "../types";

interface SyncSummaryCardProps {
  status: AggregatedSyncStatus;
  lastSyncTime: string | null;
  issueCount: number;
  isLoading: boolean;
  onSyncAll: () => void;
  isSyncing: boolean;
}

const statusConfig: Record<
  AggregatedSyncStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  not_connected: { label: "Not Connected", variant: "secondary" },
  idle: { label: "Up to Date", variant: "default" },
  running: { label: "Syncing...", variant: "outline" },
  needs_review: { label: "Needs Review", variant: "destructive" },
  failed: { label: "Failed", variant: "destructive" },
};

export function SyncSummaryCard({
  status,
  lastSyncTime,
  issueCount,
  onSyncAll,
  isSyncing,
}: SyncSummaryCardProps) {
  const config = statusConfig[status];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Sync Status</CardTitle>
        <Badge variant={config.variant}>{config.label}</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">
              {lastSyncTime
                ? `Last synced ${formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true })}`
                : "Never synced"}
            </p>
            {issueCount > 0 && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                {issueCount} {issueCount === 1 ? "account" : "accounts"} need attention
              </p>
            )}
          </div>
          <Button onClick={onSyncAll} disabled={isSyncing || status === "running"} size="sm">
            {isSyncing || status === "running" ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Icons.RefreshCw className="mr-2 h-4 w-4" />
                Sync All
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
