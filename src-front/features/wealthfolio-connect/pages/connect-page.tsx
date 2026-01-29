import { Page, PageContent, PageHeader } from "@/components/page";
import { openUrlInBrowser } from "@/adapters";
import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect/providers/wealthfolio-connect-provider";
import {
  useAggregatedSyncStatus,
  useBrokerAccounts,
  useImportRunsInfinite,
} from "@/features/wealthfolio-connect/hooks";
import { ConnectEmptyState } from "@/features/wealthfolio-connect/components/connect-empty-state";
import { useSyncBrokerData } from "@/features/wealthfolio-connect/hooks/use-sync-broker-data";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Alert } from "@wealthfolio/ui/components/ui/alert";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { listBrokerConnections } from "../services/broker-service";
import type { AggregatedSyncStatus, BrokerConnection, BrokerAccount, ImportRun } from "../types";
import { Link } from "react-router-dom";
import { useAccounts } from "@/hooks/use-accounts";
import { TrackingModeBadge } from "@/components/tracking-mode-badge";
import { NewAccountsFoundModal } from "../components/new-accounts-found-modal";
import type { Account } from "@/lib/types";

// Status dot component
function StatusDot({ status }: { status: "healthy" | "warning" | "error" }) {
  const colors = {
    healthy: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-red-500",
  };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors[status]}`} />;
}

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function ConnectPage() {
  const { isEnabled, isConnected, isInitializing, userInfo } = useWealthfolioConnect();
  const { status, lastSyncTime } = useAggregatedSyncStatus();
  const { data: brokerAccounts = [], isLoading: isLoadingAccounts } = useBrokerAccounts();
  const { mutate: syncBrokerData, isPending: isSyncing } = useSyncBrokerData();
  const { data: importRunsData } = useImportRunsInfinite({ pageSize: 10 });
  const { accounts: localAccounts } = useAccounts({ filterActive: false, includeArchived: false }); // Get all accounts including inactive

  // Fetch broker connections for stats
  const { data: brokerConnections = [] } = useQuery({
    queryKey: [QueryKeys.BROKER_CONNECTIONS],
    queryFn: listBrokerConnections,
    enabled: isConnected,
    staleTime: 30000,
  });

  // State for the new accounts modal
  const [showNewAccountsModal, setShowNewAccountsModal] = useState(false);
  const [pendingNewAccounts, setPendingNewAccounts] = useState<Account[]>([]);

  // Listen for open-new-accounts-modal event (from broker sync toast action)
  // The event contains NewAccountInfo[] with localAccountId, so we need to look up the full Account objects
  useEffect(() => {
    const handler = (e: CustomEvent<{ localAccountId: string }[]>) => {
      // Look up full Account objects from localAccounts by their IDs
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

  // Check if any connected accounts need tracking mode setup
  const accountsNeedingSetup = useMemo(() => {
    return localAccounts.filter((acc) => {
      if (!acc.providerAccountId) return false; // Only connected accounts
      return acc.trackingMode === "NOT_SET";
    });
  }, [localAccounts]);

  const hasAccountsNeedingSetup = accountsNeedingSetup.length > 0;

  // Flatten import runs
  const recentActivity = useMemo(() => {
    if (!importRunsData?.pages) return [];
    return importRunsData.pages.flat().slice(0, 10);
  }, [importRunsData]);

  // Create account name lookup map from local accounts
  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    localAccounts.forEach((account) => {
      map.set(account.id, account.name);
    });
    return map;
  }, [localAccounts]);

  // Count items needing attention (needs review status OR has warnings/errors)
  const needsAttentionCount = useMemo(() => {
    return recentActivity.filter(
      (run) =>
        run.status === "NEEDS_REVIEW" ||
        (run.summary?.warnings ?? 0) > 0 ||
        (run.summary?.errors ?? 0) > 0,
    ).length;
  }, [recentActivity]);

  // Determine if user has an active subscription
  const hasSubscription = useMemo(() => {
    if (!userInfo?.team) return false;
    const subStatus = userInfo.team.subscription_status;
    return subStatus === "active" || subStatus === "trialing";
  }, [userInfo]);

  // Get status badge props
  const getStatusBadge = (currentStatus: AggregatedSyncStatus) => {
    if (currentStatus === "needs_review" || currentStatus === "failed") {
      return {
        show: true,
        label: "Attention needed",
        variant: "warning" as const,
      };
    }
    return { show: false, label: "", variant: "secondary" as const };
  };

  const statusBadge = getStatusBadge(status);

  // Get enabled accounts count
  const enabledAccountsCount = brokerAccounts.filter((a) => a.sync_enabled).length;

  // Show loading state during initialization
  if (isInitializing) {
    return (
      <Page>
        <PageHeader heading="Connect" text="Sync broker accounts into your local database" />
        <PageContent>
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Stats Card Skeleton */}
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

            {/* Brokers & Accounts Skeleton */}
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

            {/* Recent Activity Skeleton */}
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

  // Show empty state if not enabled or not connected
  if (!isEnabled || !isConnected || !hasSubscription) {
    return (
      <Page>
        <PageHeader heading="Connect" />
        <PageContent>
          <ConnectEmptyState />
        </PageContent>
      </Page>
    );
  }

  // Show sync management UI
  return (
    <Page>
      <PageHeader
        heading="Connect"
        text="Sync broker accounts into your local database"
        actions={
          <div className="flex items-center gap-3">
            {statusBadge.show && (
              <Badge variant={statusBadge.variant} className="gap-1.5">
                <Icons.AlertCircle className="h-3 w-3" />
                {statusBadge.label}
              </Badge>
            )}
            {lastSyncTime && (
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Icons.Clock className="h-3.5 w-3.5" />
                {formatDistanceToNow(new Date(lastSyncTime), { addSuffix: false })} ago
              </span>
            )}
            <Button
              onClick={() => syncBrokerData()}
              disabled={isSyncing || status === "running"}
              size="sm"
              variant="outline"
            >
              {isSyncing || status === "running" ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Icons.RefreshCw className="mr-2 h-4 w-4" />
                  Sync now
                </>
              )}
            </Button>
          </div>
        }
      />
      <PageContent>
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Warning banner for accounts needing tracking mode setup */}
          {hasAccountsNeedingSetup && (
            <Alert variant="warning" className="mb-4">
              <Icons.AlertTriangle className="h-4 w-4" />
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <p className="font-medium">Action needed: choose a tracking mode</p>
                  <p className="text-muted-foreground text-sm">
                    {accountsNeedingSetup.length} account(s) need configuration before importing
                    data.
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

          {/* Stats Cards Row */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-border grid grid-cols-3 divide-x">
                {/* Broker Connections */}
                <button
                  className="hover:bg-muted/50 flex items-center gap-4 p-5 text-left transition-colors"
                  onClick={() => openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/connections`)}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                    <Icons.Link className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex flex-1 items-baseline gap-2">
                    <span className="text-2xl font-semibold">{brokerConnections.length}</span>
                    <span className="text-muted-foreground text-sm">Broker connections</span>
                  </div>
                  <Icons.Plus className="text-muted-foreground h-4 w-4" />
                </button>

                {/* Synced Accounts */}
                <button
                  className="hover:bg-muted/50 flex items-center gap-4 p-5 text-left transition-colors"
                  onClick={() => openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/accounts`)}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10 dark:bg-green-500/20">
                    <Icons.Wallet className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold">{enabledAccountsCount}</span>
                    <span className="text-muted-foreground text-sm">Synced accounts</span>
                  </div>
                </button>

                {/* Devices */}
                <button
                  className="hover:bg-muted/50 flex items-center gap-4 p-5 text-left transition-colors"
                  onClick={() => openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/devices`)}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-500/20">
                    <Icons.Monitor className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold">1</span>
                    <span className="text-muted-foreground text-sm">Devices</span>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Two Column Layout: Brokers & Accounts */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Brokers Card */}
            <Card className="flex flex-col border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <Icons.Link className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Brokers
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                {brokerConnections.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No broker connections yet
                  </p>
                ) : (
                  <div className="divide-border divide-y">
                    {brokerConnections.map((connection) => (
                      <BrokerConnectionItem
                        key={connection.id}
                        connection={connection}
                        accountCount={
                          brokerAccounts.filter(
                            (a) => a.brokerage_authorization === connection.id && a.sync_enabled,
                          ).length
                        }
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Accounts Card */}
            <Card className="flex flex-col border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <Icons.Wallet className="h-4 w-4 text-green-600 dark:text-green-400" />
                  Accounts
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                {isLoadingAccounts ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : brokerAccounts.filter((a) => a.sync_enabled).length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No synced accounts yet
                  </p>
                ) : (
                  <div className="divide-border divide-y">
                    {brokerAccounts
                      .filter((a) => a.sync_enabled)
                      .map((account) => {
                        // Find the matching local account to get trackingMode
                        const localAccount = localAccounts.find(
                          (la) => la.providerAccountId === account.id,
                        );
                        return (
                          <AccountItem
                            key={account.id}
                            account={account}
                            localAccount={localAccount}
                          />
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Icons.History className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                Recent Sync Activity
                {needsAttentionCount > 0 && (
                  <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                    {needsAttentionCount}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {recentActivity.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No sync activity yet
                </p>
              ) : (
                <div className="divide-border -mx-3 divide-y">
                  {recentActivity.map((run) => (
                    <ActivityItem
                      key={run.id}
                      run={run}
                      accountName={accountNameMap.get(run.accountId)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>

      {/* New Accounts Found Modal */}
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

// Broker Connection Item
function BrokerConnectionItem({
  connection,
  accountCount,
}: {
  connection: BrokerConnection;
  accountCount: number;
}) {
  const name =
    connection.brokerage?.display_name ||
    connection.brokerage?.name ||
    connection.name ||
    "Unknown";
  const isDisabled = connection.disabled;
  const status = isDisabled ? "warning" : "healthy";

  return (
    <div className="hover:bg-muted/30 flex items-center gap-3 px-2 py-3 transition-colors">
      <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium">
        {connection.brokerage?.aws_s3_square_logo_url ? (
          <img
            src={connection.brokerage.aws_s3_square_logo_url}
            alt={name}
            className="h-6 w-6 rounded"
          />
        ) : (
          getInitials(name)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          <StatusDot status={status} />
        </div>
        <p className="text-muted-foreground text-xs">
          {accountCount} account{accountCount !== 1 ? "s" : ""}
        </p>
      </div>
      {isDisabled && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/connections`);
          }}
        >
          Reconnect
        </Button>
      )}
    </div>
  );
}

// Account Item
function AccountItem({
  account,
  localAccount,
}: {
  account: BrokerAccount;
  localAccount?: Account;
}) {
  const name = account.name || "Account";
  const institution = account.institution_name || "Unknown";

  // Determine status based on sync_status
  const hasRecentSync =
    account.sync_status?.transactions?.last_successful_sync ||
    account.sync_status?.holdings?.last_successful_sync;
  const status = hasRecentSync ? "healthy" : "warning";

  return (
    <div className="hover:bg-muted/30 flex items-center gap-3 px-2 py-3 transition-colors">
      <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium">
        {getInitials(institution)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          <StatusDot status={status} />
        </div>
        <p className="text-muted-foreground text-xs">{institution}</p>
      </div>
      {localAccount && (
        <TrackingModeBadge account={localAccount} syncEnabled={account.sync_enabled} />
      )}
    </div>
  );
}

// Activity Item
function ActivityItem({ run, accountName }: { run: ImportRun; accountName?: string }) {
  const timeAgo = formatDistanceToNow(new Date(run.startedAt), { addSuffix: false });
  const isNeedsReview = run.status === "NEEDS_REVIEW";
  const isFailed = run.status === "FAILED";
  const isRunning = run.status === "RUNNING";

  const summary = run.summary;
  const inserted = summary?.inserted ?? 0;
  const updated = summary?.updated ?? 0;
  const skipped = summary?.skipped ?? 0;
  const warnings = summary?.warnings ?? 0;
  const errors = summary?.errors ?? 0;
  const removed = summary?.removed ?? 0;
  const assetsCreated = summary?.assetsCreated ?? 0;

  const hasIssues = warnings > 0 || errors > 0;
  const needsAttention = isNeedsReview || hasIssues;
  const hasAnyChanges =
    inserted > 0 || updated > 0 || skipped > 0 || removed > 0 || assetsCreated > 0 || hasIssues;

  const dotStatus = needsAttention || isFailed ? "warning" : "healthy";

  return (
    <div
      className={`flex items-center gap-4 px-3 py-3 ${
        needsAttention ? "bg-yellow-500/10 dark:bg-yellow-500/5" : "hover:bg-muted/30"
      }`}
    >
      <StatusDot status={dotStatus} />
      <span className="text-muted-foreground min-w-[100px] shrink-0 text-sm whitespace-nowrap">
        {timeAgo} ago
      </span>
      {accountName && (
        <span className="min-w-[120px] shrink-0 truncate text-sm font-medium">{accountName}</span>
      )}
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {inserted > 0 && (
          <span className="font-medium text-green-600 dark:text-green-500">
            +{inserted} new {inserted === 1 ? "activity" : "activities"}
          </span>
        )}
        {updated > 0 && <span className="text-muted-foreground">{updated} updated</span>}
        {removed > 0 && <span className="text-muted-foreground">{removed} removed</span>}
        {skipped > 0 && <span className="text-muted-foreground">{skipped} skipped</span>}
        {warnings > 0 && (
          <span className="font-medium text-yellow-600 dark:text-yellow-500">
            {warnings} {warnings === 1 ? "warning" : "warnings"}
          </span>
        )}
        {errors > 0 && (
          <span className="font-medium text-red-600 dark:text-red-500">
            {errors} {errors === 1 ? "error" : "errors"}
          </span>
        )}
        {assetsCreated > 0 && (
          <span className="text-muted-foreground">
            {assetsCreated} {assetsCreated === 1 ? "asset" : "assets"} created
          </span>
        )}
        {!hasAnyChanges && !isRunning && <span className="text-muted-foreground">No changes</span>}
        {isRunning && (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Icons.Spinner className="h-3 w-3 animate-spin" />
            Syncing...
          </span>
        )}
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
