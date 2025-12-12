import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { useWealthfolioSync } from "@/context/wealthfolio-sync-context";
import { ActionConfirm } from "@wealthfolio/ui";
import { useState } from "react";

export function SyncConnectedView() {
  const { user, signOut, isLoading, error, clearError } = useWealthfolioSync();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    clearError();
    try {
      await signOut();
    } catch {
      // Error is handled by context
    } finally {
      setIsSigningOut(false);
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <Icons.AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
                <Icons.CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  Connected to Wealthfolio Sync
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Active
                  </Badge>
                </CardTitle>
                <CardDescription>Your account is connected and syncing.</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Email</p>
                  <p className="mt-1 text-sm font-medium">{user?.email ?? "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    Account Created
                  </p>
                  <p className="mt-1 text-sm font-medium">{formatDate(user?.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    Last Sign In
                  </p>
                  <p className="mt-1 text-sm font-medium">{formatDate(user?.last_sign_in_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">User ID</p>
                  <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
                    {user?.id ?? "N/A"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <ActionConfirm
                handleConfirm={handleSignOut}
                isPending={isSigningOut}
                confirmTitle="Sign out of Wealthfolio Sync?"
                confirmMessage="You'll need to sign in again to access your synced broker accounts. Your local data will not be affected."
                confirmButtonText="Sign Out"
                pendingText="Signing out..."
                cancelButtonText="Cancel"
                confirmButtonVariant="destructive"
                button={
                  <Button variant="outline" disabled={isSigningOut || isLoading}>
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
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base font-medium">Connected Broker Accounts</CardTitle>
          <CardDescription>
            Manage your linked broker accounts through Wealthfolio Sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex flex-col items-center justify-center py-8 text-center">
            <Icons.Link className="mb-3 h-10 w-10 opacity-50" />
            <p className="text-sm font-medium">No broker accounts connected yet</p>
            <p className="mt-1 text-xs">
              Connect your first broker account to start syncing your portfolio automatically.
            </p>
            <Button variant="outline" className="mt-4" disabled>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Connect Broker Account
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  security. You&apos;ll only need to sign in again if you change your password, sign out,
                  or uninstall the app.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
