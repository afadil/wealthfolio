import { openUrlInBrowser } from "@/adapters";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";
import { listBrokerConnections, syncBrokerData } from "../services/broker-service";
import type { BrokerConnection, SyncResult } from "../types";
import { DeviceSyncSection } from "@/features/devices-sync";
import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionConfirm } from "@wealthfolio/ui";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import { SubscriptionPlans } from "./subscription-plans";

// ─────────────────────────────────────────────────────────────────────────────
// Custom Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook to fetch broker connections from the backend.
 */
function useBrokerConnections(isConnected: boolean) {
  return useQuery({
    queryKey: [QueryKeys.BROKER_CONNECTIONS],
    queryFn: listBrokerConnections,
    enabled: isConnected,
    staleTime: 30000,
  });
}

/**
 * Opens the Wealthfolio Connect portal in the browser.
 */
function openConnectPortal() {
  openUrlInBrowser(WEALTHFOLIO_CONNECT_PORTAL_URL);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceUnavailableCardProps {
  onRetry: () => void;
  isRetrying: boolean;
}

function ServiceUnavailableCard({ onRetry, isRetrying }: ServiceUnavailableCardProps) {
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="py-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="bg-warning/15 mb-4 rounded-full p-4">
            <Icons.CloudOff className="text-warning h-8 w-8" />
          </div>
          <h3 className="text-foreground mb-2 text-base font-medium">
            Service Temporarily Unavailable
          </h3>
          <p className="text-muted-foreground mb-4 max-w-sm text-sm">
            We're having trouble connecting to Wealthfolio Connect. This is usually temporary and
            should resolve shortly.
          </p>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <Icons.Refresh className="mr-2 h-4 w-4" />
                Try Again
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BrokerConnectionSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <Skeleton className="h-12 w-12 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

interface ConnectionCardProps {
  connection: BrokerConnection;
  onManage: () => void;
}

function ConnectionCard({ connection, onManage }: ConnectionCardProps) {
  const logoUrl = connection.brokerage?.awsS3SquareLogoUrl ?? connection.brokerage?.awsS3LogoUrl;
  const name = connection.brokerage?.displayName ?? connection.brokerage?.name ?? "Brokerage";
  const isDisabled = connection.disabled;

  const lastSyncedText = connection.updatedAt
    ? `Last synced ${formatDistanceToNow(new Date(connection.updatedAt), { addSuffix: false })} ago`
    : "Never synced";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
        isDisabled ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"
      }`}
    >
      {/* Logo and info */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={name}
            className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1"
          />
        ) : (
          <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold">
            {name.charAt(0)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            {isDisabled && (
              <Badge variant="destructive" className="h-5 shrink-0 text-[10px]">
                Disconnected
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">{lastSyncedText}</p>
        </div>
      </div>

      {/* Status indicator or reconnect button */}
      {isDisabled ? (
        <Button variant="outline" size="sm" onClick={onManage} className="h-8 shrink-0 text-xs">
          Reconnect
        </Button>
      ) : (
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-green-500" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ConnectedView() {
  const {
    user,
    session,
    userInfo,
    signOut,
    isLoading,
    isLoadingUserInfo,
    error,
    clearError,
    refetchUserInfo,
  } = useWealthfolioConnect();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Check if user is connected (has a valid session)
  const isConnected = !!session;

  // Check if there's a service unavailable error (failed to fetch user info)
  const isServiceUnavailable = !!error && !isLoadingUserInfo && !userInfo;

  // Check if user has an active subscription (has a team with a plan)
  const hasSubscription = !!userInfo?.team?.plan;

  // Hooks - only fetch broker connections if user has a subscription
  const connectionsQuery = useBrokerConnections(hasSubscription);

  // Retry handler for service unavailable state
  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    clearError();
    try {
      await refetchUserInfo();
    } finally {
      setIsRetrying(false);
    }
  }, [clearError, refetchUserInfo]);

  // Sync accounts to local database
  const syncToLocalMutation = useMutation({
    mutationFn: syncBrokerData,
    onSuccess: (result) => {
      setSyncResult(result);
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PLATFORMS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITIES] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  // Handlers
  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    clearError();
    try {
      await signOut();
    } catch {
      // Error is handled by context
    } finally {
      setIsSigningOut(false);
    }
  }, [clearError, signOut]);

  // Derived state
  const connections = connectionsQuery.data ?? [];
  const isLoadingConnections = connectionsQuery.isLoading;
  const isSyncing = syncToLocalMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Account Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={user?.email ?? "User avatar"}
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
                <span className="text-primary text-lg font-semibold">
                  {(userInfo?.fullName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold">
                  {userInfo?.fullName ?? user?.email?.split("@")[0] ?? "User"}
                </h3>
                {hasSubscription && (
                  <Badge className="h-5 shrink-0 bg-green-100 px-2 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Active
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground truncate text-sm">{user?.email}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <ActionConfirm
                    handleConfirm={handleSignOut}
                    isPending={isSigningOut}
                    confirmTitle="Sign out of Wealthfolio Connect?"
                    confirmMessage="You'll need to sign in again to access your synced broker accounts. Your local data will not be affected."
                    confirmButtonText="Sign Out"
                    pendingText="Signing out..."
                    cancelButtonText="Cancel"
                    confirmButtonVariant="destructive"
                    button={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground h-8 w-8 shrink-0"
                        disabled={isSigningOut || isLoading}
                      >
                        {isSigningOut ? (
                          <Icons.Spinner className="h-4 w-4 animate-spin" />
                        ) : (
                          <Icons.LogOut className="h-4 w-4" />
                        )}
                      </Button>
                    }
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Sign out</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      {/* Show loading skeleton while user info is being fetched */}
      {isLoadingUserInfo && (
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-4 w-72" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show Service Unavailable card when API is down */}
      {isServiceUnavailable && (
        <ServiceUnavailableCard onRetry={handleRetry} isRetrying={isRetrying} />
      )}

      {/* Show Subscription Plans if user has no active subscription (only after userInfo is loaded) */}
      {!isLoadingUserInfo && !isServiceUnavailable && !hasSubscription && (
        <SubscriptionPlans enabled={isConnected && !hasSubscription} />
      )}

      {/* Broker Connections Card - Only show if user has an active subscription */}
      {hasSubscription && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Broker Accounts</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => connectionsQuery.refetch()}
                    disabled={connectionsQuery.isFetching}
                    className="text-muted-foreground hover:text-foreground h-8 w-8 shrink-0"
                  >
                    {connectionsQuery.isFetching ? (
                      <Icons.Spinner className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icons.Refresh className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <CardDescription>
              Manage your linked broker accounts through Wealthfolio Connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoadingConnections ? (
              <div className="space-y-3">
                <BrokerConnectionSkeleton />
                <BrokerConnectionSkeleton />
              </div>
            ) : connections.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center justify-center py-8 text-center">
                <div className="bg-muted/50 mb-4 rounded-full p-3">
                  <Icons.Link className="h-6 w-6 opacity-60" />
                </div>
                <p className="text-foreground text-sm font-medium">No broker accounts connected</p>
                <p className="mt-1 max-w-xs text-xs">
                  Connect your first broker account to start syncing your portfolio automatically.
                </p>
                <Button className="mt-4" size="sm" onClick={openConnectPortal}>
                  <Icons.Plus className="mr-2 h-4 w-4" />
                  Connect Broker
                </Button>
              </div>
            ) : (
              <div>
                {/* Connection list */}
                <div className="space-y-2">
                  {connections.map((connection) => (
                    <ConnectionCard
                      key={connection.id}
                      connection={connection}
                      onManage={openConnectPortal}
                    />
                  ))}
                </div>

                {/* Sync Result */}
                {syncResult && (
                  <div className="bg-muted/50 mt-3 rounded-lg p-3 text-sm">
                    <p className="font-medium">{syncResult.message}</p>
                    {syncResult.accountsSynced && (
                      <p className="text-muted-foreground mt-1">
                        {syncResult.accountsSynced.created} accounts created,{" "}
                        {syncResult.accountsSynced.skipped} skipped
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => syncToLocalMutation.mutate()}
                    disabled={isSyncing}
                    className="flex-1 sm:flex-none"
                  >
                    {isSyncing ? (
                      <>
                        <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <Icons.Download className="mr-2 h-4 w-4" />
                        Sync to Local
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openConnectPortal}
                    className="flex-1 sm:flex-none"
                  >
                    <Icons.ExternalLink className="mr-2 h-4 w-4" />
                    Manage Accounts
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Device Sync Section - Only show if user has an active subscription */}
      {hasSubscription && <DeviceSyncSection />}

      {/* Privacy Footnote */}
      <footer className="border-t pt-4">
        <p className="text-muted-foreground text-center text-xs leading-relaxed">
          Wealthfolio Connect doesn&apos;t store your brokerage credentials or financial data.
          Everything syncs securely via an aggregator to your local database. Device sync uses
          end-to-end encryption.{" "}
          <a
            href="https://wealthfolio.app/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Learn more
          </a>
        </p>
      </footer>
    </div>
  );
}
