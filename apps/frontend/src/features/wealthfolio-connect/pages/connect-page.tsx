import { openUrlInBrowser, syncTriggerCycle } from "@/adapters";
import { Page, PageContent, PageHeader } from "@/components/page";
import { useDeviceSync } from "@/features/devices-sync";
import { useDevices } from "@/features/devices-sync/hooks";
import { ConnectEmptyState } from "@/features/wealthfolio-connect/components/connect-empty-state";
import {
  useAggregatedSyncStatus,
  useBrokerAccounts,
  useImportRunsInfinite,
} from "@/features/wealthfolio-connect/hooks";
import { useSyncBrokerData } from "@/features/wealthfolio-connect/hooks/use-sync-broker-data";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect/providers/wealthfolio-connect-provider";
import { useAccounts } from "@/hooks/use-accounts";
import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@wealthfolio/ui/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@wealthfolio/ui/components/ui/avatar";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listBrokerConnections } from "../services/broker-service";
import type { BrokerConnection, ImportRun } from "../types";

import type { Device } from "@/features/devices-sync/types";
import type { Account } from "@/lib/types";
import { NewAccountsFoundModal } from "../components/new-accounts-found-modal";

export default function ConnectPage() {
  const { isEnabled, isConnected, isInitializing, userInfo } = useWealthfolioConnect();
  const { status, lastSyncTime, issueCount } = useAggregatedSyncStatus();
  const { data: brokerAccounts = [] } = useBrokerAccounts();
  const { mutate: syncBrokerData, isPending: isSyncing } = useSyncBrokerData();
  const { state: deviceSyncState } = useDeviceSync();
  const { data: devices } = useDevices("my");

  const handleSyncAll = useCallback(() => {
    syncBrokerData();
    syncTriggerCycle();
  }, [syncBrokerData]);
  const { data: importRunsData } = useImportRunsInfinite({ pageSize: 10 });
  const { accounts: localAccounts } = useAccounts({ filterActive: false, includeArchived: false });

  const { data: brokerConnections = [] } = useQuery({
    queryKey: [QueryKeys.BROKER_CONNECTIONS],
    queryFn: listBrokerConnections,
    enabled: isConnected,
    staleTime: 30000,
  });

  const [showNewAccountsModal, setShowNewAccountsModal] = useState(false);
  const [pendingNewAccounts, setPendingNewAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const handler = (e: CustomEvent<{ localAccountId: string }[]>) => {
      const accountIds = new Set(e.detail.map((info) => info.localAccountId));
      const matchingAccounts = localAccounts.filter((acc) => accountIds.has(acc.id));
      if (matchingAccounts.length > 0) {
        setPendingNewAccounts(matchingAccounts);
        setShowNewAccountsModal(true);
      }
    };
    window.addEventListener("open-new-accounts-modal", handler as EventListener);
    return () => window.removeEventListener("open-new-accounts-modal", handler as EventListener);
  }, [localAccounts]);

  const accountsNeedingSetup = useMemo(() => {
    return localAccounts.filter((acc) => {
      if (!acc.providerAccountId) return false;
      return acc.trackingMode === "NOT_SET";
    });
  }, [localAccounts]);

  const hasAccountsNeedingSetup = accountsNeedingSetup.length > 0;

  const recentActivity = useMemo(() => {
    if (!importRunsData?.pages) return [];
    return importRunsData.pages.flat().slice(0, 10);
  }, [importRunsData]);

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    localAccounts.forEach((account) => {
      map.set(account.id, account.name);
    });
    return map;
  }, [localAccounts]);

  const accountTrackingModeMap = useMemo(() => {
    const map = new Map<string, Account["trackingMode"]>();
    localAccounts.forEach((account) => {
      map.set(account.id, account.trackingMode);
    });
    return map;
  }, [localAccounts]);

  const hasSubscription = useMemo(() => {
    if (!userInfo?.team) return false;
    const subStatus = userInfo.team.subscription_status;
    return subStatus === "active" || subStatus === "trialing";
  }, [userInfo]);

  if (isInitializing) {
    return (
      <Page>
        <PageHeader heading="Sync & Connections" />
        <PageContent>
          <div className="mx-auto max-w-5xl space-y-6">
            <Card>
              <CardContent className="p-0">
                <div className="divide-border grid grid-cols-3 divide-x">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-5">
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[...Array(2)].map((_, i) => (
                <Card key={i} className="border">
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-24" />
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {[...Array(3)].map((_, j) => (
                      <div key={j} className="flex items-center gap-3 py-2">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="border">
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-36" />
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-3">
                    <Skeleton className="h-2 w-2 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </PageContent>
      </Page>
    );
  }

  if (!isEnabled || !isConnected || !hasSubscription) {
    return (
      <Page>
        <PageHeader heading="Sync & Connections" />
        <PageContent>
          <ConnectEmptyState />
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        heading="Sync & Connections"
        text="Your brokerages and devices, all in one place."
        actions={
          <div className="flex items-center gap-2 sm:gap-3">
            <Button onClick={handleSyncAll} disabled={isSyncing || status === "running"} size="sm">
              {isSyncing || status === "running" ? (
                <>
                  <Icons.Spinner className="h-4 w-4 animate-spin sm:mr-2" />
                  <span className="hidden sm:inline">Syncing...</span>
                </>
              ) : (
                <>
                  <Icons.RefreshCw className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Sync Now</span>
                </>
              )}
            </Button>
          </div>
        }
      />
      <PageContent>
        <div className="mx-auto max-w-5xl space-y-6 pt-12">
          {hasAccountsNeedingSetup && (
            <Alert variant="warning" className="mb-4">
              <Icons.AlertTriangle className="h-4 w-4" />
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <p className="font-medium">New accounts need setup</p>
                  <p className="text-muted-foreground text-sm">
                    {accountsNeedingSetup.length} account
                    {accountsNeedingSetup.length > 1 ? "s" : ""} need
                    {accountsNeedingSetup.length === 1 ? "s" : ""} a quick setup before we can start
                    syncing.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPendingNewAccounts(accountsNeedingSetup);
                    setShowNewAccountsModal(true);
                  }}
                >
                  Review accounts
                </Button>
              </div>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="flex flex-col border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base font-medium">
                  <div className="flex items-center gap-2">
                    <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      <Icons.Link className="text-muted-foreground h-3.5 w-3.5" />
                    </div>
                    Brokerages
                    {lastSyncTime && (
                      <span className="text-muted-foreground text-xs font-normal">
                        · {formatDistanceToNow(new Date(lastSyncTime))} ago
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground h-8 w-8 sm:hidden"
                      onClick={() =>
                        openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/connections`)
                      }
                    >
                      <Icons.ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                      onClick={() =>
                        openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/connections`)
                      }
                    >
                      Manage
                      <Icons.ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                {brokerConnections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="bg-muted/50 mb-3 rounded-full p-3">
                      <Icons.Link className="text-muted-foreground h-6 w-6" />
                    </div>
                    <p className="text-muted-foreground text-sm">No brokerages connected</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Link a brokerage to start syncing your accounts.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {brokerConnections.map((connection) => {
                      const connectionAccounts = brokerAccounts.filter(
                        (a) => a.brokerage_authorization === connection.id,
                      );
                      const syncEnabledCount = connectionAccounts.filter(
                        (a) => a.sync_enabled,
                      ).length;
                      return (
                        <ConnectionItem
                          key={connection.id}
                          connection={connection}
                          syncEnabledCount={syncEnabledCount}
                          totalAccountCount={connectionAccounts.length}
                        />
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base font-medium">
                  <div className="flex items-center gap-2">
                    <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      <Icons.Smartphone className="text-muted-foreground h-3.5 w-3.5" />
                    </div>
                    Devices
                    <DeviceSyncStatusBadge engineStatus={deviceSyncState.engineStatus} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Link to="/settings/connect">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground h-8 w-8 sm:hidden"
                      >
                        <Icons.Settings className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link to="/settings/connect">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                      >
                        Manage
                        <Icons.ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                {!devices || devices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="bg-muted/50 mb-3 rounded-full p-3">
                      <Icons.Smartphone className="text-muted-foreground h-6 w-6" />
                    </div>
                    <p className="text-muted-foreground text-sm">No devices syncing yet</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Set up device sync in settings to keep your data in sync across devices.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortDevicesByCurrent(devices).map((device) => (
                      <DeviceItem key={device.id} device={device} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                  <Icons.History className="text-muted-foreground h-3.5 w-3.5" />
                </div>
                Recent Activity
                {issueCount > 0 && (
                  <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                    {issueCount}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {recentActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="bg-muted/50 mb-3 rounded-full p-3">
                    <Icons.History className="text-muted-foreground h-6 w-6" />
                  </div>
                  <p className="text-muted-foreground text-sm">No activity yet</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Updates will appear here once your data starts syncing.
                  </p>
                </div>
              ) : (
                <div className="divide-border -mx-3 divide-y">
                  {recentActivity.map((run) => (
                    <SyncHistoryItem
                      key={run.id}
                      run={run}
                      accountName={accountNameMap.get(run.accountId)}
                      trackingMode={accountTrackingModeMap.get(run.accountId)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>

      <NewAccountsFoundModal
        open={showNewAccountsModal}
        onOpenChange={setShowNewAccountsModal}
        accounts={pendingNewAccounts}
        onComplete={() => {
          setPendingNewAccounts([]);
        }}
      />
    </Page>
  );
}

function sortDevicesByCurrent(devices: Device[]): Device[] {
  return [...devices].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    return bTime - aTime;
  });
}

function ConnectionItem({
  connection,
  syncEnabledCount,
  totalAccountCount,
}: {
  connection: BrokerConnection;
  syncEnabledCount: number;
  totalAccountCount: number;
}) {
  const name =
    connection.brokerage?.display_name ||
    connection.brokerage?.name ||
    connection.name ||
    "Unknown";
  const logoUrl =
    connection.brokerage?.aws_s3_square_logo_url ?? connection.brokerage?.aws_s3_logo_url;
  const isConnected = connection.status === "connected" && !connection.disabled;

  return (
    <div className="bg-muted/30 flex items-center gap-3 rounded-lg border p-3">
      <Avatar className="h-9 w-9 shrink-0 rounded-lg">
        <AvatarImage src={logoUrl} alt={name} className="bg-white object-contain p-1" />
        <AvatarFallback className="rounded-lg text-sm font-semibold">
          {name.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{name}</span>
        <p className="text-muted-foreground text-xs">
          {syncEnabledCount} of {totalAccountCount}{" "}
          {totalAccountCount === 1 ? "account" : "accounts"} syncing
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge
          className={`shrink-0 ${
            isConnected
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
          }`}
        >
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>
        {!isConnected && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/connections`)}
          >
            Reconnect
          </Button>
        )}
      </div>
    </div>
  );
}

function DeviceSyncStatusBadge({
  engineStatus,
}: {
  engineStatus: {
    backgroundRunning: boolean;
    lastCycleStatus: string | null;
    lastError: string | null;
    consecutiveFailures: number;
  } | null;
}) {
  if (!engineStatus) return null;

  const { backgroundRunning, lastCycleStatus, lastError, consecutiveFailures } = engineStatus;

  let color: string;
  let label: string;

  if (lastError || consecutiveFailures > 2) {
    color = "bg-red-500";
    label = "Sync error";
  } else if (!backgroundRunning) {
    color = "bg-gray-400";
    label = "Sync paused";
  } else if (lastCycleStatus === "ok") {
    color = "bg-green-500";
    label = "Up to date";
  } else {
    color = "bg-yellow-500";
    label = "Syncing";
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
            <span className="text-muted-foreground text-xs">{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-64 text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const platformIcons: Record<string, typeof Icons.Monitor> = {
  macos: Icons.Monitor,
  mac: Icons.Monitor,
  windows: Icons.Monitor,
  linux: Icons.Monitor,
  ios: Icons.Smartphone,
  android: Icons.Smartphone,
  server: Icons.Cloud,
  web: Icons.Cloud,
};

function DeviceItem({ device }: { device: Device }) {
  const platform = device.platform?.toLowerCase() || "unknown";
  const Icon = platformIcons[platform] || Icons.Monitor;
  const lastSeenText = formatDeviceLastSeen(device);
  const isOnline = lastSeenText === "Online";

  return (
    <div className="bg-muted/30 flex items-center gap-3 rounded-lg border p-3">
      <Avatar className="h-9 w-9 shrink-0 rounded-lg">
        <AvatarFallback className="rounded-lg">
          <Icon className="text-muted-foreground h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{device.displayName}</span>
          {device.isCurrent && (
            <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
              This device
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {isOnline ? "Active now" : `Last seen ${lastSeenText}`}
        </p>
      </div>
      {isOnline ? (
        <Badge className="shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Online
        </Badge>
      ) : (
        <span className="text-muted-foreground shrink-0 text-xs">{lastSeenText}</span>
      )}
    </div>
  );
}

function formatDeviceLastSeen(device: Device): string {
  if (device.isCurrent) return "Online";
  if (!device.lastSeenAt) return "Never";
  const diffMins = Math.floor((Date.now() - new Date(device.lastSeenAt).getTime()) / 60000);
  if (diffMins < 5) return "Online";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function SyncHistoryItem({
  run,
  accountName,
  trackingMode,
}: {
  run: ImportRun;
  accountName?: string;
  trackingMode?: Account["trackingMode"];
}) {
  const timeAgo = formatDistanceToNow(new Date(run.startedAt), { addSuffix: false });
  const isNeedsReview = run.status === "NEEDS_REVIEW";
  const isFailed = run.status === "FAILED";
  const isRunning = run.status === "RUNNING";
  const itemLabel = trackingMode === "HOLDINGS" ? "position" : "transaction";
  const itemLabelPlural = `${itemLabel}s`;

  const summary = run.summary;
  const inserted = summary?.inserted ?? 0;
  const updated = summary?.updated ?? 0;
  const warnings = summary?.warnings ?? 0;
  const errors = summary?.errors ?? 0;
  const removed = summary?.removed ?? 0;

  const hasIssues = warnings > 0 || errors > 0;
  const needsAttention = isNeedsReview || hasIssues;

  let description = "";
  if (isRunning) {
    description = "Syncing your data...";
  } else if (isFailed) {
    description = "Something went wrong";
  } else if (needsAttention) {
    const issueCount = warnings + errors;
    description = `${issueCount} ${issueCount === 1 ? "item needs" : "items need"} your review`;
  } else if (inserted > 0 || updated > 0 || removed > 0) {
    const parts: string[] = [];
    if (inserted > 0) {
      parts.push(`${inserted} new ${inserted === 1 ? itemLabel : itemLabelPlural}`);
    }
    if (updated > 0) {
      parts.push(`${updated} ${updated === 1 ? itemLabel : itemLabelPlural} updated`);
    }
    if (removed > 0) {
      parts.push(`${removed} ${removed === 1 ? itemLabel : itemLabelPlural} removed`);
    }
    description = parts.join(", ");
  } else {
    description = "Everything is up to date";
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 sm:flex-nowrap sm:gap-4 ${
        needsAttention ? "bg-yellow-500/10 dark:bg-yellow-500/5" : "hover:bg-muted/30"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          needsAttention || isFailed ? "bg-yellow-500" : "bg-green-500"
        }`}
      />
      <span className="text-muted-foreground shrink-0 whitespace-nowrap text-xs sm:min-w-[80px] sm:text-sm">
        {timeAgo} ago
      </span>
      {accountName && (
        <span className="hidden shrink-0 truncate text-sm font-medium sm:inline sm:min-w-[100px]">
          {accountName}
        </span>
      )}
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:w-auto sm:flex-1 sm:text-sm">
        {accountName && <span className="font-medium sm:hidden">{accountName}</span>}
        <span className={needsAttention ? "font-medium text-amber-600 dark:text-amber-400" : ""}>
          {description}
        </span>
        {isRunning && <Icons.Spinner className="h-3 w-3 animate-spin" />}
      </div>
      {needsAttention && (
        <Link
          to={`/activities?account=${run.accountId}&needsReview=true`}
          className="text-primary shrink-0 text-sm font-medium hover:underline"
        >
          Review
        </Link>
      )}
    </div>
  );
}
