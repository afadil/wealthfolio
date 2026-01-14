// DeviceSyncSection
// Main UI for device sync - shows appropriate UI based on sync state
// State Machine: FRESH → REGISTERED → READY (+ STALE, RECOVERY)
// ==================================================================

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@wealthfolio/ui/components/ui/avatar";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons, Skeleton } from "@wealthfolio/ui";
import { useDeviceSync } from "../providers/device-sync-provider";
import { useDevices, useRenameDevice, useRevokeDevice } from "../hooks";
import { E2EESetupCard } from "./e2ee-setup-card";
import { RecoveryDialog } from "./recovery-dialog";
import { PairingFlow } from "./pairing-flow";
import { SyncStates, type Device } from "../types";

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

  // Show recovery dialog when in RECOVERY state
  const isRecovery = state.syncState === SyncStates.RECOVERY;
  if (isRecovery && !showRecoveryDialog) {
    setShowRecoveryDialog(true);
  }

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
          <OrphanedKeysPrompt onReinitialize={actions.reinitializeSync} />
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
            <h3 className="text-base font-semibold">Device Sync</h3>
          </div>

          <UntrustedDevicePrompt
            onStartPairing={() => setIsPairingOpen(true)}
            trustedDeviceCount={state.trustedDevices.length}
          />
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
            <div className="bg-amber-100 dark:bg-amber-900/30 mb-3 rounded-full p-2.5 sm:mb-4 sm:p-3">
              <Icons.RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
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
            </div>
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

          {/* Content */}
          <div className="mt-4">
            {!state.device ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : !isTrusted ? (
              <UntrustedDevicePrompt onStartPairing={() => setIsPairingOpen(true)} />
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
        <div className="bg-amber-100 dark:bg-amber-900/30 mb-3 rounded-full p-2.5 sm:mb-4 sm:p-3">
          <Icons.AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
        </div>
        <p className="text-foreground text-sm font-medium">No Devices Paired</p>
        <p className="text-muted-foreground mt-1 max-w-xs text-xs">
          Sync was set up before but no devices are currently connected.
          Reinitialize to get started.
        </p>
        <Button
          className="mt-3 sm:mt-4"
          variant="outline"
          onClick={() => setShowConfirmDialog(true)}
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
}: {
  onResetSync: () => Promise<void>;
  onLinkDevice: () => void;
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

  return (
    <div>
      {/* Devices list */}
      <div className="space-y-2">
        {sortedDevices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            isLastTrustedDevice={isLastTrustedDevice && !!device.isCurrent}
            onResetSync={onResetSync}
            onPair={onLinkDevice}
          />
        ))}
      </div>

      {/* Link Device button - matches "Sync to Local" pattern */}
      <div className="mt-4">
        <Button onClick={onLinkDevice}>
          <Icons.Link className="mr-2 h-4 w-4" />
          Link Device
        </Button>
      </div>
    </div>
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
      <div className="bg-muted/30 flex items-center justify-between gap-3 rounded-lg border p-3">
        {/* Left: Device icon + info */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0 rounded-lg">
            <AvatarFallback className="rounded-lg">
              <Icon className="text-muted-foreground h-4 w-4" />
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-7 w-full max-w-[160px] text-sm"
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
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{device.displayName}</span>
                  {device.isCurrent && (
                    <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                      This device
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  {isTrusted && (
                    <span className="flex items-center gap-1">
                      <Icons.ShieldCheck className="h-3 w-3 text-green-600 dark:text-green-500" />
                      Trusted
                    </span>
                  )}
                  {!isTrusted && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                      <Icons.ShieldAlert className="h-3 w-3" />
                      Needs pairing
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Status + Actions - single row */}
        {!isRenaming && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Pair button for untrusted remote devices */}
            {!isTrusted && !device.isCurrent && (
              <Button variant="outline" size="sm" onClick={onPair}>
                Pair
              </Button>
            )}

            {/* Last seen / Online status */}
            {lastSeenText === "Online" ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Online
              </Badge>
            ) : (
              <span className="text-muted-foreground text-xs">{lastSeenText}</span>
            )}

            {/* Actions menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground h-7 w-7 shrink-0"
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
