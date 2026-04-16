import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
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
  { variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  not_connected: { variant: "secondary" },
  idle: { variant: "default" },
  running: { variant: "outline" },
  needs_review: { variant: "destructive" },
  failed: { variant: "destructive" },
};

export function SyncSummaryCard({
  status,
  lastSyncTime,
  issueCount,
  onSyncAll,
  isSyncing,
}: SyncSummaryCardProps) {
  const { t } = useTranslation("common");
  const config = statusConfig[status];
  const statusLabel =
    status === "not_connected"
      ? t("connect.sync.status.not_connected")
      : status === "idle"
        ? t("connect.page.device_sync_uptodate")
        : status === "running"
          ? t("connect.page.syncing")
          : status === "needs_review"
            ? t("connect.import_runs.status.NEEDS_REVIEW")
            : t("connect.import_runs.status.FAILED");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{t("connect.sync.status_title")}</CardTitle>
        <Badge variant={config.variant}>{statusLabel}</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">
              {lastSyncTime
                ? t("connect.sync.last_synced", {
                    when: formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true }),
                  })
                : t("connect.sync.never_synced")}
            </p>
            {issueCount > 0 && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                {t("connect.sync.accounts_need_attention", { count: issueCount })}
              </p>
            )}
          </div>
          <Button onClick={onSyncAll} disabled={isSyncing || status === "running"} size="sm">
            {isSyncing || status === "running" ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                {t("connect.page.syncing")}
              </>
            ) : (
              <>
                <Icons.RefreshCw className="mr-2 h-4 w-4" />
                {t("connect.sync.sync_all")}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
