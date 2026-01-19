import { Page, PageContent, PageHeader } from "@/components/page";
import { openUrlInBrowser } from "@/adapters";
import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect/providers/wealthfolio-connect-provider";
import {
  useAggregatedSyncStatus,
  useBrokerAccounts,
} from "@/features/wealthfolio-connect/hooks";
import { ConnectEmptyState } from "@/features/wealthfolio-connect/components/connect-empty-state";
import { BrokerAccountCard } from "@/features/wealthfolio-connect/components/broker-account-card";
import { SyncHistory } from "@/features/wealthfolio-connect/components/sync-history";
import { useSyncBrokerData } from "@/features/wealthfolio-connect/hooks/use-sync-broker-data";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { listBrokerConnections } from "../services/broker-service";
import type { AggregatedSyncStatus } from "../types";

// Status configuration for the hero banner
const statusConfig: Record<
  AggregatedSyncStatus,
  {
    label: string;
    description: string;
    icon: typeof Icons.Check;
    bgClass: string;
    iconClass: string;
  }
> = {
  not_connected: {
    label: "Not Connected",
    description: "Connect your accounts to start syncing",
    icon: Icons.CloudOff,
    bgClass: "bg-muted",
    iconClass: "text-muted-foreground",
  },
  idle: {
    label: "Sync Healthy",
    description: "All accounts are up to date",
    icon: Icons.CheckCircle,
    bgClass: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
    iconClass: "text-green-600 dark:text-green-400",
  },
  running: {
    label: "Syncing",
    description: "Updating your accounts",
    icon: Icons.Spinner,
    bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
    iconClass: "text-blue-600 dark:text-blue-400",
  },
  needs_review: {
    label: "Needs Review",
    description: "Some transactions need attention",
    icon: Icons.AlertTriangle,
    bgClass: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900",
    iconClass: "text-yellow-600 dark:text-yellow-400",
  },
  failed: {
    label: "Sync Failed",
    description: "There was an issue with your last sync",
    icon: Icons.X,
    bgClass: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",
    iconClass: "text-red-600 dark:text-red-400",
  },
};

export default function ConnectPage() {
  const { isEnabled, isConnected, isInitializing, userInfo } = useWealthfolioConnect();
  const { status, lastSyncTime, issueCount, isLoading, syncStates } =
    useAggregatedSyncStatus();
  const { data: brokerAccounts = [], isLoading: isLoadingAccounts } = useBrokerAccounts();
  const { mutate: syncBrokerData, isPending: isSyncing } = useSyncBrokerData();

  // Fetch broker connections for stats
  const { data: brokerConnections = [] } = useQuery({
    queryKey: [QueryKeys.BROKER_CONNECTIONS],
    queryFn: listBrokerConnections,
    enabled: isConnected,
    staleTime: 30000,
  });

  // Determine if user has an active subscription
  const hasSubscription = useMemo(() => {
    if (!userInfo?.team) return false;
    const subStatus = userInfo.team.subscription_status;
    return subStatus === "active" || subStatus === "trialing";
  }, [userInfo]);

  // Show loading state during initialization
  if (isInitializing) {
    return (
      <Page>
        <PageHeader heading="Wealthfolio Connect" />
        <PageContent>
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        </PageContent>
      </Page>
    );
  }

  // Show empty state if not enabled or not connected
  if (!isEnabled || !isConnected || !hasSubscription) {
    return (
      <Page>
        <PageHeader heading="Wealthfolio Connect" />
        <PageContent>
          <ConnectEmptyState />
        </PageContent>
      </Page>
    );
  }

  // Check if we have any synced data
  const hasData = brokerAccounts.length > 0 || syncStates.length > 0;

  // Show empty state with sync action when no data yet
  if (!isLoading && !isLoadingAccounts && !hasData) {
    return (
      <Page>
        <PageHeader heading="Wealthfolio Connect" />
        <PageContent>
          <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center">
            <div className="text-center">
              <Icons.CloudSync2 className="text-muted-foreground mx-auto h-16 w-16" />
              <h2 className="mt-6 text-xl font-semibold">Ready to Sync</h2>
              <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                Fetch your latest account data and transactions from your connected brokerages.
              </p>
              <Button
                onClick={() => syncBrokerData()}
                disabled={isSyncing}
                className="mt-6"
                size="lg"
              >
                {isSyncing ? (
                  <>
                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Icons.RefreshCw className="mr-2 h-4 w-4" />
                    Sync Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  const statusInfo = statusConfig[status];
  const StatusIcon = statusInfo.icon;

  // Show sync management UI when we have data
  return (
    <Page>
      <PageHeader
        heading="Wealthfolio Connect"
        text="Sync broker accounts into your local Wealthfolio database."
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => openUrlInBrowser("https://wealthfolio.app/connect/")}
          >
            Learn more
            <Icons.ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        }
      />
      <PageContent>
        <div className="space-y-6">
          {/* Hero Status Banner */}
          <div className={`rounded-xl border p-4 ${statusInfo.bgClass}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${
                    status === "idle"
                      ? "bg-green-100 dark:bg-green-900/50"
                      : status === "running"
                        ? "bg-blue-100 dark:bg-blue-900/50"
                        : status === "needs_review"
                          ? "bg-yellow-100 dark:bg-yellow-900/50"
                          : status === "failed"
                            ? "bg-red-100 dark:bg-red-900/50"
                            : "bg-muted"
                  }`}
                >
                  <StatusIcon
                    className={`h-6 w-6 ${statusInfo.iconClass} ${status === "running" ? "animate-spin" : ""}`}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{statusInfo.label}</h2>
                    {issueCount > 0 && (
                      <span className="text-muted-foreground text-sm">
                        &middot; {issueCount} issue{issueCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {lastSyncTime
                      ? `Last synced ${formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true })}`
                      : statusInfo.description}
                  </p>
                </div>
              </div>

              <Button
                onClick={() => syncBrokerData()}
                disabled={isSyncing || status === "running"}
                size="sm"
              >
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
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Broker Connections */}
            <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/connections`)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                      <Icons.Link className="text-muted-foreground h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-muted-foreground text-sm font-medium">Broker connections</p>
                      <p className="text-2xl font-bold">{brokerConnections.length}</p>
                    </div>
                  </div>
                  <Icons.ChevronRight className="text-muted-foreground h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            {/* Accounts */}
            <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/accounts`)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                      <Icons.Wallet className="text-muted-foreground h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-muted-foreground text-sm font-medium">Accounts</p>
                      <p className="text-2xl font-bold">
                        {brokerAccounts.filter((a) => a.sync_enabled).length}
                      </p>
                    </div>
                  </div>
                  <Icons.ChevronRight className="text-muted-foreground h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            {/* Devices */}
            <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/devices`)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                      <Icons.Smartphone className="text-muted-foreground h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-muted-foreground text-sm font-medium">Devices</p>
                      <p className="text-2xl font-bold">1</p>
                    </div>
                  </div>
                  <Icons.ChevronRight className="text-muted-foreground h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Broker Accounts */}
          {brokerAccounts.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Icons.Wallet className="h-5 w-5" />
                  Synced Accounts
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => openUrlInBrowser(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/accounts`)}
                >
                  Manage
                  <Icons.ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {isLoadingAccounts ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : (
                  brokerAccounts
                    .filter((account) => account.sync_enabled)
                    .map((account) => <BrokerAccountCard key={account.id} account={account} />)
                )}
              </CardContent>
            </Card>
          )}

          {/* Sync History */}
          <SyncHistory pageSize={10} />
        </div>
      </PageContent>
    </Page>
  );
}
