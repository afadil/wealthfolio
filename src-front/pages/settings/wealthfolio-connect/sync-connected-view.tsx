import { openUrlInBrowser } from "@/adapters";
import {
  listBrokerConnections,
  syncBrokerData,
  type BrokerConnection,
  type SyncResult,
} from "@/commands/brokers-sync";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useWealthfolioConnect } from "@/context/wealthfolio-connect-context";
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
  onSync: () => void;
  isSyncing: boolean;
}

function ConnectionCard({ connection, onManage, onSync, isSyncing }: ConnectionCardProps) {
  const logoUrl = connection.brokerage?.awsS3SquareLogoUrl ?? connection.brokerage?.awsS3LogoUrl;
  const name = connection.brokerage?.displayName ?? connection.brokerage?.name ?? "Brokerage";
  const isDisabled = connection.disabled;

  const lastSyncedText = connection.updatedAt
    ? `Synced ${formatDistanceToNow(new Date(connection.updatedAt), { addSuffix: false })} ago`
    : "Never synced";

  return (
    <div
      className={`group relative flex items-center gap-4 rounded-lg p-4 transition-all ${
        isDisabled ? "bg-destructive/5 border-destructive/20 border" : "hover:bg-muted/50 border"
      }`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="h-12 w-12 rounded-lg bg-white object-contain p-1"
        />
      ) : (
        <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-lg text-lg font-semibold">
          {name.charAt(0)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate font-semibold">{name}</h4>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>{lastSyncedText}</span>
          {!isDisabled && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
          {isDisabled && <span className="text-destructive text-xs">Disconnected</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        {isDisabled ? (
          <Button variant="secondary" size="sm" onClick={onManage}>
            Reconnect
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing}>
            {isSyncing ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Icons.Refresh className="mr-2 h-4 w-4" />
                Sync Now
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SyncConnectedView() {
  const { user, session, userInfo, signOut, isLoading, error, clearError } = useWealthfolioConnect();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Check if user is connected (has a valid session)
  const isConnected = !!session;

  // Check if user info is still being fetched (session exists but userInfo hasn't loaded yet)
  const isLoadingUserInfo = isConnected && userInfo === null;

  // Check if user has an active subscription (has a team with a plan)
  const hasSubscription = !!userInfo?.team?.plan;

  // Hooks - only fetch broker connections if user has a subscription
  const connectionsQuery = useBrokerConnections(hasSubscription);

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

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Derived state
  const connections = connectionsQuery.data ?? [];
  const isLoadingConnections = connectionsQuery.isLoading;
  const isSyncing = syncToLocalMutation.isPending;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <Icons.AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Account Status Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user?.email ?? "User avatar"}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    hasSubscription ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                  }`}
                >
                  {hasSubscription ? (
                    <Icons.CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Icons.Users className="text-muted-foreground h-5 w-5" />
                  )}
                </div>
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{userInfo?.fullName ?? user?.email ?? "N/A"}</h3>
                  {hasSubscription && (
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    >
                      Active
                    </Badge>
                  )}
                </div>
                {userInfo?.fullName && (
                  <p className="text-muted-foreground text-sm">{user?.email}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  Member since {formatDate(user?.created_at)}
                </p>
              </div>
            </div>
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
                <Button variant="outline" size="sm" disabled={isSigningOut || isLoading}>
                  {isSigningOut ? (
                    <>
                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      <Icons.LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </>
                  )}
                </Button>
              }
            />
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

      {/* Show Subscription Plans if user has no active subscription (only after userInfo is loaded) */}
      {!isLoadingUserInfo && !hasSubscription && <SubscriptionPlans enabled={isConnected && !hasSubscription} />}

      {/* Broker Connections Card - Only show if user has an active subscription */}
      {hasSubscription && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium">Connected Broker Accounts</CardTitle>
                <CardDescription>
                  Manage your linked broker accounts through Wealthfolio Connect.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => connectionsQuery.refetch()}
                  disabled={connectionsQuery.isFetching}
                  title="Refresh connections"
                >
                  {connectionsQuery.isFetching ? (
                    <Icons.Spinner className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icons.Refresh className="h-4 w-4" />
                  )}
                </Button>
                {connections.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncToLocalMutation.mutate()}
                      disabled={isSyncing}
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
                    <Button variant="outline" size="sm" onClick={openConnectPortal}>
                      <Icons.Settings className="mr-2 h-4 w-4" />
                      Manage Connections
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingConnections ? (
              <div className="space-y-2">
                <BrokerConnectionSkeleton />
                <BrokerConnectionSkeleton />
              </div>
            ) : connections.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center justify-center py-8 text-center">
                <Icons.Link className="mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm font-medium">No broker accounts connected yet</p>
                <p className="mt-1 text-xs">
                  Connect your first broker account to start syncing your portfolio automatically.
                </p>
                <Button className="mt-4" onClick={openConnectPortal}>
                  <Icons.Plus className="mr-2 h-4 w-4" />
                  Connect Broker Account
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map((connection) => (
                  <ConnectionCard
                    key={connection.id}
                    connection={connection}
                    onManage={openConnectPortal}
                    onSync={() => syncToLocalMutation.mutate()}
                    isSyncing={isSyncing}
                  />
                ))}
              </div>
            )}

            {/* Sync Result */}
            {syncResult && (
              <div className="bg-muted/50 mt-4 rounded-lg p-3 text-sm">
                <p className="font-medium">{syncResult.message}</p>
                {syncResult.accountsSynced && (
                  <p className="text-muted-foreground mt-1">
                    {syncResult.accountsSynced.created} accounts created,{" "}
                    {syncResult.accountsSynced.skipped} skipped
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Security Info Card */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Icons.Shield className="text-muted-foreground mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Secure Storage</p>
                <p className="text-muted-foreground text-sm">
                  Your authentication tokens are securely stored in your system&apos;s keychain
                  (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Icons.Refresh className="text-muted-foreground mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Automatic Refresh</p>
                <p className="text-muted-foreground text-sm">
                  Your session is automatically refreshed with token rotation enabled for enhanced
                  security. You&apos;ll only need to sign in again if you change your password, sign
                  out, or uninstall the app.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
