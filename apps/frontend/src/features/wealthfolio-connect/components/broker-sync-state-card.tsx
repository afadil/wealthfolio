import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { formatDistanceToNow } from "date-fns";
import type { Account, Platform } from "@/lib/types";
import type { BrokerSyncState, SyncStatus } from "../types";

interface BrokerSyncStateCardProps {
  syncState: BrokerSyncState;
  account?: Account;
  platform?: Platform;
}

const statusConfig: Record<
  SyncStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ReactNode;
  }
> = {
  IDLE: {
    label: "Up to Date",
    variant: "default",
    icon: <Icons.CheckCircle className="h-4 w-4 text-green-500" />,
  },
  RUNNING: {
    label: "Syncing",
    variant: "outline",
    icon: <Icons.Spinner className="h-4 w-4 animate-spin text-blue-500" />,
  },
  NEEDS_REVIEW: {
    label: "Needs Review",
    variant: "destructive",
    icon: <Icons.AlertTriangle className="h-4 w-4 text-yellow-500" />,
  },
  FAILED: {
    label: "Failed",
    variant: "destructive",
    icon: <Icons.AlertCircle className="h-4 w-4 text-red-500" />,
  },
};

export function BrokerSyncStateCard({ syncState, account, platform }: BrokerSyncStateCardProps) {
  const config = statusConfig[syncState.syncStatus];
  const accountName = account?.name || syncState.accountId;

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {/* Platform logo or fallback */}
          <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
            {platform?.url ? (
              <img
                src={`https://logo.clearbit.com/${new URL(platform.url).hostname}`}
                alt={platform.name || "Platform"}
                className="h-6 w-6"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <Icons.Wallet className="text-muted-foreground h-5 w-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{accountName}</p>
              {config.icon}
            </div>
            <p className="text-muted-foreground text-sm">
              {syncState.lastSuccessfulAt
                ? `Last synced ${formatDistanceToNow(new Date(syncState.lastSuccessfulAt), { addSuffix: true })}`
                : "Never synced"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
      </CardContent>

      {/* Show error message if failed */}
      {syncState.syncStatus === "FAILED" && syncState.lastError && (
        <div className="border-t px-4 py-3">
          <p className="text-sm text-red-600 dark:text-red-400">{syncState.lastError}</p>
        </div>
      )}
    </Card>
  );
}
