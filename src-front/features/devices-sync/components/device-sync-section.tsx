// DeviceSyncSection
// Simplified device sync UI - shows current device only
// =====================================================

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons, Skeleton } from "@wealthfolio/ui";
import { useDeviceSync } from "../providers/device-sync-provider";
import { useCurrentDevice, useDevices, useRenameDevice, useRevokeDevice } from "../hooks";
import { E2EESetupCard } from "./e2ee-setup-card";
import { PairingFlow } from "./pairing-flow";
import type { Device } from "../types";

const PORTAL_DEVICES_URL = "https://connect.wealthfolio.app/settings/devices";

const platformIcons: Record<string, typeof Icons.Monitor> = {
  macos: Icons.Monitor,
  windows: Icons.Monitor,
  linux: Icons.Monitor,
  ios: Icons.Smartphone,
  android: Icons.Smartphone,
  server: Icons.Cloud,
};

export function DeviceSyncSection() {
  const { state, actions } = useDeviceSync();
  const queryClient = useQueryClient();
  const [isPairingOpen, setIsPairingOpen] = useState(false);

  const handlePairingComplete = useCallback(() => {
    setIsPairingOpen(false);
    queryClient.invalidateQueries({ queryKey: ["sync", "device", "current"] });
  }, [queryClient]);

  const handlePairingCancel = useCallback(() => {
    setIsPairingOpen(false);
  }, []);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sync", "device", "current"] });
  }, [queryClient]);

  // Loading state
  if (state.isLoading) {
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

  // Error during initialization
  if (state.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Device Sync</CardTitle>
          <CardDescription>Failed to initialize device sync.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icons.AlertCircle className="text-destructive mb-3 h-10 w-10 opacity-70" />
            <p className="text-destructive text-sm font-medium">
              Initialization Failed
            </p>
            <p className="text-muted-foreground mt-1 max-w-sm text-xs">
              {state.error.message}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not initialized or E2EE not enabled - show setup card
  if (!state.isInitialized || !state.keysInitialized) {
    return <E2EESetupCard />;
  }

  const isTrusted = state.device?.trustState === "trusted";
  const dialogTitle = isTrusted ? "Add New Device" : "Connect This Device";
  const dialogDescription = isTrusted
    ? "Use this code on the device you want to connect"
    : "Get the code from your other device";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">This Device</CardTitle>
          <div className="flex items-center gap-1">
            {/* Refresh */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                  onClick={handleRefresh}
                >
                  <Icons.RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh</p>
              </TooltipContent>
            </Tooltip>

            {/* Add device - only for trusted */}
            {isTrusted && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground h-8 w-8"
                    onClick={() => setIsPairingOpen(true)}
                  >
                    <Icons.Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add new device</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <CardDescription>
          Your data is end-to-end encrypted.{" "}
          <a
            href={PORTAL_DEVICES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Manage all devices
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {!state.device ? (
          <Skeleton className="h-20 w-full" />
        ) : !isTrusted ? (
          <UntrustedDevicePrompt onStartPairing={() => setIsPairingOpen(true)} />
        ) : (
          <CurrentDeviceCard onResetSync={actions.resetSync} />
        )}
      </CardContent>

      {/* Pairing Dialog */}
      <Dialog open={isPairingOpen} onOpenChange={setIsPairingOpen}>
        <DialogContent
          className="max-w-[calc(100vw-2rem)] sm:max-w-sm"
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <PairingFlow
            onComplete={handlePairingComplete}
            onCancel={handlePairingCancel}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Prompt for untrusted device
function UntrustedDevicePrompt({ onStartPairing }: { onStartPairing: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="bg-muted/50 mb-4 rounded-full p-3">
        <Icons.ShieldAlert className="h-6 w-6 opacity-60" />
      </div>
      <p className="text-foreground text-sm font-medium">This device needs pairing</p>
      <p className="text-muted-foreground mt-1 max-w-xs text-xs">
        Enter the pairing code from a trusted device to sync your data.
      </p>
      <Button className="mt-4" size="sm" onClick={onStartPairing}>
        <Icons.Link className="mr-2 h-4 w-4" />
        Start Pairing
      </Button>
    </div>
  );
}

// Current device card with actions
function CurrentDeviceCard({
  onResetSync,
}: {
  onResetSync: () => Promise<void>;
}) {
  const { data: device, isLoading, error, isRefetching } = useCurrentDevice();
  const { data: allDevices } = useDevices("my");
  const renameDevice = useRenameDevice();
  const revokeDevice = useRevokeDevice();
  const { actions } = useDeviceSync();

  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [showUnpairAlert, setShowUnpairAlert] = useState(false);
  const [isUnpairing, setIsUnpairing] = useState(false);

  // Check if this is the only trusted device
  const trustedDevices = allDevices?.filter((d: Device) => d.trustState === "trusted") ?? [];
  const isLastTrustedDevice = trustedDevices.length <= 1;

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }

  if (error || !device) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border p-6 text-center">
        <Icons.AlertCircle className="text-destructive mb-2 h-8 w-8 opacity-70" />
        <p className="text-sm font-medium">Failed to load device info</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {error instanceof Error ? error.message : "Please try refreshing"}
        </p>
      </div>
    );
  }

  const Icon = platformIcons[device.platform] || Icons.Monitor;

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
        // For last trusted device, call resetSync instead of revoke
        await onResetSync();
      } else {
        // Normal unpair flow
        await revokeDevice.mutateAsync(device.id);
        await actions.clearSyncData();
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
      <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
        {/* Device icon + info */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            {isRefetching ? (
              <Icons.Spinner className="text-muted-foreground h-5 w-5 animate-spin" />
            ) : (
              <Icon className="text-muted-foreground h-5 w-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 w-full max-w-[180px]"
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
                  className="h-8 w-8 shrink-0"
                  onClick={handleRename}
                  disabled={renameDevice.isPending}
                >
                  {renameDevice.isPending ? (
                    <Icons.Spinner className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icons.Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={handleCancelRename}
                >
                  <Icons.Close className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{device.displayName}</span>
                </div>
                <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                  <Icons.ShieldCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
                  <span>Synced and trusted</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions menu */}
        {!isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-8 w-8 shrink-0"
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
                Unpair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Unpair confirmation - different copy for last device vs other devices */}
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
            <Button
              variant="destructive"
              onClick={handleUnpair}
              disabled={isUnpairing}
            >
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
