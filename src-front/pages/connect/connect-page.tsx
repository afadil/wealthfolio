import { Page, PageContent, PageHeader } from "@/components/page";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect/providers/wealthfolio-connect-provider";
import {
  useAggregatedSyncStatus,
  useImportRuns,
  useBrokerAccounts,
} from "@/features/wealthfolio-connect/hooks";
import { ConnectEmptyState } from "@/features/wealthfolio-connect/components/connect-empty-state";
import { SyncSummaryCard } from "@/features/wealthfolio-connect/components/sync-summary-card";
import { BrokerAccountCard } from "@/features/wealthfolio-connect/components/broker-account-card";
import { ImportRunsList } from "@/features/wealthfolio-connect/components/import-runs-list";
import { useSyncBrokerData } from "@/features/wealthfolio-connect/hooks/use-sync-broker-data";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";

export default function ConnectPage() {
  const { isEnabled, isConnected, isInitializing, userInfo } = useWealthfolioConnect();
  const { status, lastSyncTime, issueCount, isLoading, syncStates } =
    useAggregatedSyncStatus();
  const { data: importRuns = [], isLoading: isLoadingRuns } = useImportRuns({ runType: "SYNC" });
  const { data: brokerAccounts = [], isLoading: isLoadingAccounts } = useBrokerAccounts();
  const { mutate: syncBrokerData, isPending: isSyncing } = useSyncBrokerData();

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
        <PageHeader title="Connect" />
        <PageContent>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </PageContent>
      </Page>
    );
  }

  // Show empty state if not enabled or not connected
  if (!isEnabled || !isConnected || !hasSubscription) {
    return (
      <Page>
        <PageHeader title="Connect" />
        <PageContent>
          <ConnectEmptyState />
        </PageContent>
      </Page>
    );
  }

  // Check if we have any synced data
  const hasData = brokerAccounts.length > 0 || syncStates.length > 0 || importRuns.length > 0;

  // Show empty state with sync action when no data yet
  if (!isLoading && !isLoadingRuns && !isLoadingAccounts && !hasData) {
    return (
      <Page>
        <PageHeader title="Connect" />
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

  // Show sync management UI when we have data
  return (
    <Page>
      <PageHeader title="Connect" />
      <PageContent>
        <div className="space-y-6">
          {/* Sync Summary */}
          <SyncSummaryCard
            status={status}
            lastSyncTime={lastSyncTime}
            issueCount={issueCount}
            isLoading={isLoading}
            onSyncAll={() => syncBrokerData()}
            isSyncing={isSyncing}
          />

          {/* Broker Accounts from API */}
          {brokerAccounts.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Icons.Wallet className="h-5 w-5" />
                  Accounts
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Manage accounts
                  <Icons.ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {isLoadingAccounts ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : (
                  brokerAccounts.map((account) => (
                    <BrokerAccountCard key={account.id} account={account} />
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* Import Runs History */}
          <ImportRunsList runs={importRuns} isLoading={isLoadingRuns} />
        </div>
      </PageContent>
    </Page>
  );
}
