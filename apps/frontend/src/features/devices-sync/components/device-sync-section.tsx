// DeviceSyncSection
// Main UI for device sync - shows appropriate UI based on sync state
// State Machine: FRESH → REGISTERED → READY (+ STALE, RECOVERY)
// ==================================================================

import { backupDatabase, openFileSaveDialog } from "@/adapters";
import { useQueryClient } from "@tanstack/react-query";
import { Icons, Skeleton } from "@wealthfolio/ui";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@wealthfolio/ui/components/ui/avatar";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Input } from "@wealthfolio/ui/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDevices, useRenameDevice, useRevokeDevice } from "../hooks";
import { useDeviceSync } from "../providers/device-sync-provider";
import { SyncStates, type Device, type SyncState } from "../types";
import { E2EESetupCard } from "./e2ee-setup-card";
import { PairingFlow } from "./pairing-flow";
import { RecoveryDialog } from "./recovery-dialog";

const PORTAL_DEVICES_URL = "https://connect.wealthfolio.app/settings/devices";

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

export function DeviceSyncSection() {
  const { state, actions } = useDeviceSync();
  const queryClient = useQueryClient();
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [showBootstrapOverwriteDialog, setShowBootstrapOverwriteDialog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTogglingEngine, setIsTogglingEngine] = useState(false);
  const [isBackingUpBeforeBootstrap, setIsBackingUpBeforeBootstrap] = useState(false);
  const [isApplyingBootstrapOverwrite, setIsApplyingBootstrapOverwrite] = useState(false);
  const [isRetryingBootstrap, setIsRetryingBootstrap] = useState(false);
  const [isUploadingSnapshot, setIsUploadingSnapshot] = useState(false);
  const isBackgroundRunning = state.engineStatus?.backgroundRunning ?? false;

  const handlePairingComplete = useCallback(() => {
    setIsPairingOpen(false);
    queryClient.invalidateQueries({ queryKey: ["sync", "device", "current"] });
    // Refresh state after pairing
    actions.refreshState();
  }, [queryClient, actions]);

  const handlePairingCancel = useCallback(() => {
    setIsPairingOpen(false);
  }, []);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sync", "device", "current"] });
    actions.refreshState();
  }, [queryClient, actions]);

  const handleRefreshDevices = useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["sync", "devices"] });
    // Brief spinner feedback; content area shows its own loading state
    setTimeout(() => setIsRefreshing(false), 600);
  }, [queryClient]);

  const handleToggleEngine = useCallback(async () => {
    setIsTogglingEngine(true);
    try {
      if (isBackgroundRunning) {
        await actions.stopBackgroundSync();
        toast.success("Background sync paused");
      } else {
        await actions.startBackgroundSync();
        toast.success("Background sync resumed");
      }
    } catch (err) {
      toast.error("Failed to update background sync", {
        description: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setIsTogglingEngine(false);
    }
  }, [actions, isBackgroundRunning]);

  const handleBackupBeforeBootstrap = useCallback(async (): Promise<boolean> => {
    setIsBackingUpBeforeBootstrap(true);
    try {
      const { filename, data } = await backupDatabase();
      const saved = await openFileSaveDialog(data, filename);
      if (!saved) {
        return false;
      }
      toast.success("Backup saved", {
        description: `A local backup was saved as ${filename}.`,
      });
      return true;
    } catch (err) {
      toast.error("Backup failed", {
        description: err instanceof Error ? err.message : "An unexpected error occurred",
      });
      return false;
    } finally {
      setIsBackingUpBeforeBootstrap(false);
    }
  }, []);

  const handleApplyBootstrapOverwrite = useCallback(async () => {
    setIsApplyingBootstrapOverwrite(true);
    try {
      await actions.continueBootstrapWithOverwrite();
      setShowBootstrapOverwriteDialog(false);
    } catch (err) {
      toast.error("Unable to continue sync", {
        description: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setIsApplyingBootstrapOverwrite(false);
    }
  }, [actions]);

  const handleBackupThenApplyOverwrite = useCallback(async () => {
    const saved = await handleBackupBeforeBootstrap();
    if (!saved) {
      return;
    }
    await handleApplyBootstrapOverwrite();
  }, [handleApplyBootstrapOverwrite, handleBackupBeforeBootstrap]);

  const handleRetryBootstrap = useCallback(async () => {
    setIsRetryingBootstrap(true);
    try {
      await actions.retryBootstrap();
      toast.success("Sync retry started", {
        description: "Checking for an updated snapshot and applying pending sync changes.",
      });
    } catch (err) {
      toast.error("Could not retry sync", {
        description: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setIsRetryingBootstrap(false);
    }
  }, [actions]);

  const handleUploadSnapshotNow = useCallback(async () => {
    setIsUploadingSnapshot(true);
    try {
      const result = await actions.generateSnapshotNow();
      if (result.status === "uploaded") {
        toast.success("Snapshot uploaded", {
          description: "Newly paired devices can now finish syncing from this snapshot.",
        });
        return;
      }
      if (result.status === "skipped") {
        toast.message("Snapshot upload skipped", {
          description: result.message,
        });
        return;
      }
      if (result.status === "cancelled") {
        toast.message("Snapshot upload cancelled", {
          description: result.message,
        });
        return;
      }
      toast.message("Snapshot upload result", {
        description: result.message,
      });
    } catch (err) {
      toast.error("Snapshot upload failed", {
        description: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setIsUploadingSnapshot(false);
    }
  }, [actions]);

  // Keep recovery dialog strictly in sync with RECOVERY state.
  useEffect(() => {
    setShowRecoveryDialog(state.syncState === SyncStates.RECOVERY);
  }, [state.syncState]);

  useEffect(() => {
    setShowBootstrapOverwriteDialog(!!state.bootstrapOverwriteRisk);
  }, [state.bootstrapOverwriteRisk]);

  // Loading state (detecting)
  if (state.isDetecting) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Error during state detection
  if (state.error && state.syncState === SyncStates.FRESH) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Device Sync</CardTitle>
          <CardDescription>Failed to initialize device sync.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icons.AlertCircle className="text-destructive mb-3 h-10 w-10 opacity-70" />
            <p className="text-destructive text-sm font-medium">Initialization Failed</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-xs">{state.error.message}</p>
            <Button variant="outline" className="mt-4" onClick={handleRefresh}>
              <Icons.RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // FRESH state - Show enable sync card
  if (state.syncState === SyncStates.FRESH) {
    return <E2EESetupCard />;
  }

  // ORPHANED state - Keys exist on server but no trusted devices to pair with
  if (state.syncState === SyncStates.ORPHANED) {
    return (
      <Card>
        <CardContent className="p-4">
          {/* Header row - matches other cards pattern */}
          <div className="flex items-center gap-2">
            <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <Icons.Smartphone className="text-muted-foreground h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold">Device Sync</h3>
          </div>
          <OrphanedKeysPrompt
            onReinitialize={async () => {
              await actions.reinitializeSync();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  // REGISTERED state - Needs pairing with existing trusted device
  if (state.syncState === SyncStates.REGISTERED) {
    return (
      <Card>
        <CardContent className="p-4">
          {/* Header row - matches other cards pattern */}
          <div className="flex items-center gap-2">
            <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <Icons.Smartphone className="text-muted-foreground h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold">Connected Devices</h3>
          </div>

          <div className="mt-4">
            <ConnectedDevicesList
              onResetSync={actions.resetSync}
              onLinkDevice={() => setIsPairingOpen(true)}
              mode="unpaired"
              trustedDeviceCount={state.trustedDevices.length}
            />
          </div>
        </CardContent>

        {/* Pairing Dialog */}
        <Dialog open={isPairingOpen} onOpenChange={setIsPairingOpen}>
          <DialogContent
            className="max-w-[calc(100vw-2rem)] sm:max-w-sm"
            mobileClassName="pb-8"
            showCloseButton={false}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader className="text-center">
              <DialogTitle>Connect This Device</DialogTitle>
              <DialogDescription>Enter the code from your trusted device</DialogDescription>
            </DialogHeader>
            <PairingFlow onComplete={handlePairingComplete} onCancel={handlePairingCancel} />
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  // STALE state - Keys are out of date, needs re-pairing
  if (state.syncState === SyncStates.STALE) {
    return (
      <Card>
        <CardContent className="p-4">
          {/* Header row - matches other cards pattern */}
          <div className="flex items-center gap-2">
            <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <Icons.Smartphone className="text-muted-foreground h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold">Device Sync</h3>
          </div>

          <div className="flex flex-col items-center justify-center py-4 text-center sm:py-6">
            <div className="mb-3 rounded-full bg-amber-100 p-2.5 sm:mb-4 sm:p-3 dark:bg-amber-900/30">
              <Icons.RefreshCw className="h-5 w-5 text-amber-600 sm:h-6 sm:w-6 dark:text-amber-400" />
            </div>
            <p className="text-foreground text-sm font-medium">Keys need updating</p>
            <p className="text-muted-foreground mt-1 max-w-xs text-xs">
              The encryption keys were rotated on another device. Pair again to get the new keys.
            </p>
            <Button className="mt-3 sm:mt-4" onClick={() => setIsPairingOpen(true)}>
              <Icons.Link className="mr-2 h-4 w-4" />
              Update Keys
            </Button>
          </div>
        </CardContent>

        {/* Pairing Dialog */}
        <Dialog open={isPairingOpen} onOpenChange={setIsPairingOpen}>
          <DialogContent
            className="max-w-[calc(100vw-2rem)] sm:max-w-sm"
            mobileClassName="pb-8"
            showCloseButton={false}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader className="text-center">
              <DialogTitle>Update Encryption Keys</DialogTitle>
              <DialogDescription>Enter the code from your trusted device</DialogDescription>
            </DialogHeader>
            <PairingFlow onComplete={handlePairingComplete} onCancel={handlePairingCancel} />
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  // READY state - Show connected devices
  const isTrusted = state.device?.trustState === "trusted";
  const isWaitingForRemoteSnapshot =
    state.bootstrapAction === "WAIT_REMOTE_SNAPSHOT" ||
    state.engineStatus?.lastCycleStatus === "wait_snapshot" ||
    state.engineStatus?.lastCycleStatus === "stale_cursor" ||
    !!state.engineStatus?.bootstrapRequired;
  const dialogTitle = isTrusted ? "Link New Device" : "Connect This Device";
  const dialogDescription = isTrusted
    ? "Scan or enter this code on your other device"
    : "Enter the code from your trusted device";

  return (
    <>
      <Card>
        <CardContent className="p-4">
          {/* Header row - matches Broker connections / Accounts pattern */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                <Icons.Smartphone className="text-muted-foreground h-4 w-4" />
              </div>
              <h3 className="text-base font-semibold">Connected Devices</h3>
              <SyncStatusDot engineStatus={state.engineStatus} />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-8 w-8 sm:hidden"
                onClick={handleToggleEngine}
                disabled={isTogglingEngine}
              >
                {isTogglingEngine ? (
                  <Icons.Loader className="h-4 w-4 animate-spin" />
                ) : isBackgroundRunning ? (
                  <Icons.PauseCircle className="h-4 w-4" />
                ) : (
                  <Icons.PlayCircle className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                onClick={handleToggleEngine}
                disabled={isTogglingEngine}
              >
                {isTogglingEngine ? (
                  <>
                    <Icons.Loader className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : isBackgroundRunning ? (
                  <>
                    <Icons.PauseCircle className="h-4 w-4" />
                    Pause Sync
                  </>
                ) : (
                  <>
                    <Icons.PlayCircle className="h-4 w-4" />
                    Resume Sync
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-8 w-8"
                onClick={handleRefreshDevices}
                disabled={isRefreshing}
              >
                <Icons.RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
              {/* Mobile: icon only */}
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground sm:hidden"
                onClick={() => window.open(PORTAL_DEVICES_URL, "_blank")}
              >
                <Icons.ExternalLink className="h-4 w-4" />
              </Button>
              {/* Desktop: full text */}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                onClick={() => window.open(PORTAL_DEVICES_URL, "_blank")}
              >
                Manage devices
                <Icons.ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="mt-4">
            {state.bootstrapStatus === "running" && (
              <div className="bg-muted/60 text-muted-foreground mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs">
                <Icons.Loader className="h-3.5 w-3.5 animate-spin" />
                Sync bootstrap in progress...
              </div>
            )}
            {state.bootstrapStatus === "error" && state.bootstrapMessage && (
              <div className="bg-destructive/10 text-destructive mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs">
                <Icons.AlertCircle className="h-3.5 w-3.5" />
                {state.bootstrapMessage}
              </div>
            )}
            {isWaitingForRemoteSnapshot && (
              <div className="bg-muted/60 text-muted-foreground mb-3 rounded-md px-3 py-3 text-xs">
                <div className="flex items-start gap-2">
                  <Icons.Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground font-medium">
                      {isTrusted
                        ? "Your other device is still finishing setup."
                        : "Your setup is almost done."}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      {isTrusted
                        ? "You can speed things up now, or wait and we’ll continue automatically in the background."
                        : "Please finish setup on your trusted device first. This page will update automatically."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRetryBootstrap}
                        disabled={isRetryingBootstrap || state.bootstrapStatus === "running"}
                      >
                        {isRetryingBootstrap ? (
                          <>
                            <Icons.Spinner className="mr-2 h-3.5 w-3.5 animate-spin" />
                            Checking...
                          </>
                        ) : (
                          <>
                            <Icons.RefreshCw className="mr-2 h-3.5 w-3.5" />
                            Check again
                          </>
                        )}
                      </Button>
                      {isTrusted && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleUploadSnapshotNow}
                          disabled={isUploadingSnapshot}
                        >
                          {isUploadingSnapshot ? (
                            <>
                              <Icons.Spinner className="mr-2 h-3.5 w-3.5 animate-spin" />
                              Preparing...
                            </>
                          ) : (
                            <>
                              <Icons.Upload className="mr-2 h-3.5 w-3.5" />
                              Speed up setup
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {state.bootstrapAction === "NO_REMOTE_PULL" && (
              <div className="bg-muted/60 text-muted-foreground mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs">
                <Icons.Info className="h-3.5 w-3.5" />
                No remote data replacement is needed. This device can keep its current data.
              </div>
            )}
            {state.bootstrapOverwriteRisk && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <Icons.AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Local data will be replaced</p>
                    <p className="mt-1 leading-relaxed">
                      To finish linking this device, we need to replace local sync data with data
                      from your paired device. This device currently has{" "}
                      <span className="font-semibold">
                        {state.bootstrapOverwriteRisk.localRows.toLocaleString()}
                      </span>{" "}
                      items.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowBootstrapOverwriteDialog(true)}
                      >
                        See details
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleBackupBeforeBootstrap}
                        disabled={isBackingUpBeforeBootstrap || isApplyingBootstrapOverwrite}
                      >
                        {isBackingUpBeforeBootstrap ? (
                          <>
                            <Icons.Spinner className="mr-2 h-3.5 w-3.5 animate-spin" />
                            Backing up...
                          </>
                        ) : (
                          <>
                            <Icons.Download className="mr-2 h-3.5 w-3.5" />
                            Back up this device
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!state.device ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : !isTrusted ? (
              <ConnectedDevicesList
                onResetSync={actions.resetSync}
                onLinkDevice={() => setIsPairingOpen(true)}
                mode="unpaired"
                trustedDeviceCount={state.trustedDevices.length}
              />
            ) : (
              <ConnectedDevicesList
                onResetSync={actions.resetSync}
                onLinkDevice={() => setIsPairingOpen(true)}
              />
            )}
          </div>
        </CardContent>

        {/* Pairing Dialog */}
        <Dialog open={isPairingOpen} onOpenChange={setIsPairingOpen}>
          <DialogContent
            className="max-w-[calc(100vw-2rem)] sm:max-w-sm"
            mobileClassName="pb-8"
            showCloseButton={false}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader className="text-center">
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>{dialogDescription}</DialogDescription>
            </DialogHeader>
            <PairingFlow onComplete={handlePairingComplete} onCancel={handlePairingCancel} />
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={showBootstrapOverwriteDialog && !!state.bootstrapOverwriteRisk}
          onOpenChange={setShowBootstrapOverwriteDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finish linking this device?</AlertDialogTitle>
              <AlertDialogDescription>
                This device currently has{" "}
                {state.bootstrapOverwriteRisk?.localRows.toLocaleString() ?? "0"} local sync items.
                Continuing will replace local sync data with snapshot data from your paired device.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {state.bootstrapOverwriteRisk &&
              state.bootstrapOverwriteRisk.nonEmptyTables.length > 0 && (
                <div className="bg-muted/60 rounded-md px-3 py-2 text-xs">
                  <p className="text-muted-foreground mb-1 font-medium">Data that may be updated</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {state.bootstrapOverwriteRisk.nonEmptyTables.map((table) => (
                      <div key={table.table} className="flex items-center justify-between gap-3">
                        <span>{formatSyncTableLabel(table.table)}</span>
                        <span className="text-muted-foreground">{table.rows.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={isBackingUpBeforeBootstrap || isApplyingBootstrapOverwrite}
              >
                Not now
              </AlertDialogCancel>
              <Button
                variant="outline"
                onClick={handleBackupThenApplyOverwrite}
                disabled={isBackingUpBeforeBootstrap || isApplyingBootstrapOverwrite}
              >
                {isBackingUpBeforeBootstrap ? (
                  <>
                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                    Backing up...
                  </>
                ) : (
                  "Back up, then replace"
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={handleApplyBootstrapOverwrite}
                disabled={isBackingUpBeforeBootstrap || isApplyingBootstrapOverwrite}
              >
                {isApplyingBootstrapOverwrite ? (
                  <>
                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                    Replacing...
                  </>
                ) : (
                  "Replace now"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      {/* Recovery Dialog */}
      <RecoveryDialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog} />
    </>
  );
}

// Prompt for untrusted device
function UntrustedDevicePrompt({
  onStartPairing,
  trustedDeviceCount,
}: {
  onStartPairing: () => void;
  trustedDeviceCount?: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-4 text-center sm:py-6">
      <div className="bg-muted/50 mb-3 rounded-full p-2.5 sm:mb-4 sm:p-3">
        <Icons.ShieldAlert className="h-5 w-5 opacity-60 sm:h-6 sm:w-6" />
      </div>
      <p className="text-foreground text-sm font-medium">This device needs pairing</p>
      <p className="text-muted-foreground mt-1 max-w-xs text-xs">
        {trustedDeviceCount !== undefined && trustedDeviceCount > 0
          ? `Enter the pairing code from one of your ${trustedDeviceCount} trusted device${trustedDeviceCount > 1 ? "s" : ""}.`
          : "Enter the pairing code from a trusted device to sync your data."}
      </p>
      <Button className="mt-3 sm:mt-4" onClick={onStartPairing}>
        <Icons.Link className="mr-2 h-4 w-4" />
        Start Pairing
      </Button>
    </div>
  );
}

// Prompt for orphaned state (keys exist but no trusted devices)
function OrphanedKeysPrompt({ onReinitialize }: { onReinitialize: () => Promise<void> }) {
  const [isReinitializing, setIsReinitializing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleReinitialize = async () => {
    setIsReinitializing(true);
    try {
      await onReinitialize();
      setShowConfirmDialog(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      toast.error("Failed to reinitialize sync", { description: message });
    } finally {
      setIsReinitializing(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center py-4 text-center sm:py-6">
        <div className="mb-3 rounded-full bg-amber-100 p-2.5 sm:mb-4 sm:p-3 dark:bg-amber-900/30">
          <Icons.AlertTriangle className="h-5 w-5 text-amber-600 sm:h-6 sm:w-6 dark:text-amber-400" />
        </div>
        <p className="text-foreground text-sm font-medium">No Devices Paired</p>
        <p className="text-muted-foreground mt-1 max-w-xs text-xs">
          Sync was set up before but no devices are currently connected. Reinitialize to get
          started.
        </p>
        <Button
          className="mt-3 sm:mt-4"
          variant="outline"
          onClick={() => setShowConfirmDialog(true)}
          disabled={isReinitializing}
        >
          <Icons.RefreshCw className="mr-2 h-4 w-4" />
          Reinitialize Sync
        </Button>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reinitialize sync?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear your previous sync setup and start fresh with this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReinitializing}>Cancel</AlertDialogCancel>
            <Button onClick={handleReinitialize} disabled={isReinitializing}>
              {isReinitializing ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Reinitializing...
                </>
              ) : (
                "Reinitialize"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function formatSyncTableName(table: string): string {
  return table
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatSyncTableLabel(table: string): string {
  const labels: Record<string, string> = {
    accounts: "Accounts",
    assets: "Investments",
    quotes: "Price history",
    goals: "Goals",
    goals_allocation: "Goal allocations",
    activities: "Transactions",
    activity_import_profiles: "Import settings",
    asset_taxonomy_assignments: "Categories",
    contribution_limits: "Contribution limits",
    platforms: "Connected services",
    holdings_snapshots: "Portfolio snapshots",
    import_runs: "Import history",
    ai_threads: "AI chats",
    ai_messages: "AI chat messages",
    ai_thread_tags: "AI chat labels",
  };

  return labels[table] ?? formatSyncTableName(table);
}

// Helper to format relative time
function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "Never";
  const now = new Date();
  const lastSeen = new Date(lastSeenAt);
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 5) return "Online";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Connected devices list component
function ConnectedDevicesList({
  onResetSync,
  onLinkDevice,
  mode = "trusted",
  trustedDeviceCount,
}: {
  onResetSync: () => Promise<void>;
  onLinkDevice: () => void;
  mode?: "trusted" | "unpaired";
  trustedDeviceCount?: number;
}) {
  const { data: devices, isLoading, error } = useDevices("my");

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !devices) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border p-6 text-center">
        <Icons.AlertCircle className="text-destructive mb-2 h-8 w-8 opacity-70" />
        <p className="text-sm font-medium">Failed to load devices</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {error instanceof Error ? error.message : "Please try refreshing"}
        </p>
      </div>
    );
  }

  if (mode === "unpaired" && devices.length === 0) {
    return (
      <UntrustedDevicePrompt
        onStartPairing={onLinkDevice}
        trustedDeviceCount={trustedDeviceCount}
      />
    );
  }

  // Sort: current device first, then by lastSeenAt (most recent first)
  const sortedDevices = [...devices].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    return bTime - aTime;
  });

  const trustedDevices = devices.filter((d: Device) => d.trustState === "trusted");
  const isLastTrustedDevice = trustedDevices.length <= 1;
  const visibleDevices =
    mode === "unpaired" ? sortedDevices.filter((device) => !device.isCurrent) : sortedDevices;

  return (
    <div>
      {/* Devices list */}
      <div className="space-y-2">
        {mode === "unpaired" && <PairThisDeviceItem onPair={onLinkDevice} />}
        {visibleDevices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            isLastTrustedDevice={isLastTrustedDevice && device.trustState === "trusted"}
            onResetSync={onResetSync}
            onPair={onLinkDevice}
          />
        ))}
      </div>

      {/* Link Device button - matches "Sync to Local" pattern */}
      {mode === "trusted" && (
        <div className="mt-4">
          <Button onClick={onLinkDevice} size="sm">
            <Icons.Link className="mr-2 h-4 w-4" />
            Link Device
          </Button>
        </div>
      )}
    </div>
  );
}

function PairThisDeviceItem({ onPair }: { onPair: () => void }) {
  return (
    <div className="bg-muted/30 flex flex-col gap-3 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="h-9 w-9 shrink-0 rounded-lg">
          <AvatarFallback className="rounded-lg">
            <Icons.Smartphone className="text-muted-foreground h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">This device</span>
            <Badge
              variant="outline"
              className="text-warning border-warning/20 bg-warning/20 h-5 shrink-0 text-[10px]"
            >
              Not paired
            </Badge>
          </div>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <Icons.ShieldAlert className="h-3 w-3 text-amber-600 dark:text-amber-500" />
            Pair this device to start syncing.
          </div>
        </div>
      </div>
      <Button size="default" className="w-full shrink-0 sm:w-auto" onClick={onPair}>
        <Icons.Link className="mr-2 h-4 w-4" />
        Pair this device
      </Button>
    </div>
  );
}

function SyncStatusDot({ engineStatus }: { engineStatus: SyncState["engineStatus"] }) {
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
    label = "Synced";
  } else {
    color = "bg-yellow-500";
    label = "Syncing";
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Individual device card
function DeviceCard({
  device,
  isLastTrustedDevice,
  onResetSync,
  onPair,
}: {
  device: Device;
  isLastTrustedDevice: boolean;
  onResetSync: () => Promise<void>;
  onPair: () => void;
}) {
  const renameDevice = useRenameDevice();
  const revokeDevice = useRevokeDevice();
  const { actions } = useDeviceSync();

  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [showUnpairAlert, setShowUnpairAlert] = useState(false);
  const [isUnpairing, setIsUnpairing] = useState(false);

  const platform = device.platform?.toLowerCase() || "unknown";
  const Icon = platformIcons[platform] || Icons.Monitor;
  const isTrusted = device.trustState === "trusted";
  const isUntrusted = device.trustState === "untrusted";
  const isRevoked = device.trustState === "revoked";
  // Current device is always "Online", others show relative time
  const lastSeenText = device.isCurrent ? "Online" : formatLastSeen(device.lastSeenAt);

  const handleStartRename = () => {
    setNewName(device.displayName);
    setIsRenaming(true);
  };

  const handleRename = async () => {
    if (newName.trim() && newName !== device.displayName) {
      await renameDevice.mutateAsync({ deviceId: device.id, name: newName.trim() });
    }
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setIsRenaming(false);
    setNewName("");
  };

  const handleUnpair = async () => {
    setIsUnpairing(true);
    try {
      if (isLastTrustedDevice) {
        await onResetSync();
      } else {
        await revokeDevice.mutateAsync(device.id);
        if (device.isCurrent) {
          await actions.clearSyncData();
        }
      }
      setShowUnpairAlert(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      toast.error("Failed to unpair device", { description: message });
    } finally {
      setIsUnpairing(false);
    }
  };

  return (
    <>
      <div className="hover:bg-muted/40 group flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors">
        {/* Device icon with online indicator */}
        <div className="relative shrink-0">
          <div className="bg-muted/60 flex h-10 w-10 items-center justify-center rounded-full">
            <Icon className="text-foreground/70 h-[18px] w-[18px]" />
          </div>
          {lastSeenText === "Online" && (
            <span className="border-background absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 bg-green-500" />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-7 w-full max-w-40 text-sm"
                maxLength={64}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") handleCancelRename();
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={handleRename}
                disabled={renameDevice.isPending}
              >
                {renameDevice.isPending ? (
                  <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icons.Check className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={handleCancelRename}
              >
                <Icons.Close className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-medium">{device.displayName}</span>
                {device.isCurrent && (
                  <span className="text-muted-foreground shrink-0 text-xs font-normal">
                    · This device
                  </span>
                )}
              </div>
              <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                {isTrusted && (
                  <>
                    <Icons.ShieldCheck className="h-3 w-3 text-green-600 dark:text-green-500" />
                    <span>Trusted</span>
                  </>
                )}
                {isUntrusted && (
                  <>
                    <Icons.ShieldAlert className="h-3 w-3 text-amber-600 dark:text-amber-500" />
                    <span className="text-amber-600 dark:text-amber-500">Needs pairing</span>
                  </>
                )}
                {isRevoked && (
                  <>
                    <Icons.XCircle className="h-3 w-3" />
                    <span>Revoked</span>
                  </>
                )}
                {lastSeenText !== "Online" && !device.isCurrent && (
                  <>
                    <span className="text-muted-foreground/30 mx-0.5">·</span>
                    <span>{lastSeenText}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right actions */}
        {!isRenaming && (
          <div className="flex shrink-0 items-center gap-2">
            {isUntrusted && !device.isCurrent && (
              <Button variant="outline" size="sm" onClick={onPair}>
                Pair
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Icons.MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Device actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleStartRename}>
                  <Icons.Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setShowUnpairAlert(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Icons.LogOut className="mr-2 h-4 w-4" />
                  {device.isCurrent ? "Unpair" : "Revoke"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Unpair confirmation */}
      <AlertDialog open={showUnpairAlert} onOpenChange={setShowUnpairAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isLastTrustedDevice ? "Unpair your last device?" : "Unpair device?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isLastTrustedDevice
                ? "This is your only paired device. You'll need to pair a device again to continue syncing your data."
                : `This will remove "${device.displayName}" from your account. The device will need to be paired again to sync data.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnpairing}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleUnpair} disabled={isUnpairing}>
              {isUnpairing ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Unpairing...
                </>
              ) : (
                "Unpair"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
