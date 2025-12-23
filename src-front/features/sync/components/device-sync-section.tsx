// DeviceSyncSection
// Main section component for device sync UI in settings
// =====================================================

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { Icons, Skeleton } from "@wealthfolio/ui";
import { useSync } from "../providers/sync-provider";
import { E2EESetupCard } from "./e2ee-setup-card";
import { PairingFlow } from "./pairing-flow";
import { ResetSyncDialog } from "./reset-sync-dialog";

export function DeviceSyncSection() {
  const { state } = useSync();
  const [isPairingOpen, setIsPairingOpen] = useState(false);

  // Loading state
  if (state.isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Error during initialization
  if (state.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Sync Devices</CardTitle>
          <CardDescription>
            Failed to initialize device sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icons.AlertCircle className="text-destructive mb-3 h-10 w-10 opacity-70" />
            <p className="text-destructive text-sm font-medium">Initialization Failed</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-xs">
              {state.error.message}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not initialized yet (and no error) - likely still connecting
  if (!state.isInitialized) {
    return null;
  }

  // E2EE not enabled - show setup card
  if (!state.syncStatus?.e2eeEnabled) {
    return <E2EESetupCard />;
  }

  // E2EE enabled - show device management
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Devices</CardTitle>
          <div className="flex items-center gap-1">
            {/* Pair New Device Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Dialog open={isPairingOpen} onOpenChange={setIsPairingOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8">
                        <Icons.Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Pair a New Device</DialogTitle>
                        <DialogDescription>
                          Securely transfer your encryption key to another device.
                        </DialogDescription>
                      </DialogHeader>
                      <PairingFlow
                        onComplete={() => setIsPairingOpen(false)}
                        onCancel={() => setIsPairingOpen(false)}
                      />
                    </DialogContent>
                  </Dialog>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Pair new device</p>
              </TooltipContent>
            </Tooltip>

            {/* Reset Sync (owner only) */}
            <ResetSyncDialog />
          </div>
        </div>
        <CardDescription>
          Manage your paired devices. All synced data is end-to-end encrypted.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Device needs pairing - show pairing prompt */}
        {state.trustState !== "trusted" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="bg-muted/50 mb-4 rounded-full p-3">
              <Icons.ShieldAlert className="h-6 w-6 opacity-60" />
            </div>
            <p className="text-foreground text-sm font-medium">This device needs pairing</p>
            <p className="text-muted-foreground mt-1 max-w-xs text-xs">
              Enter the pairing code from a trusted device to sync your data.
            </p>
            <Dialog open={isPairingOpen} onOpenChange={setIsPairingOpen}>
              <DialogTrigger asChild>
                <Button className="mt-4" size="sm">
                  <Icons.Link className="mr-2 h-4 w-4" />
                  Start Pairing
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Pair This Device</DialogTitle>
                  <DialogDescription>
                    Enter the pairing code from your trusted device to receive the encryption key.
                  </DialogDescription>
                </DialogHeader>
                <PairingFlow
                  onComplete={() => setIsPairingOpen(false)}
                  onCancel={() => setIsPairingOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <DeviceListInline />
        )}
      </CardContent>
    </Card>
  );
}

// Inline device list without card wrapper
function DeviceListInline() {
  const { data: devices, isLoading, error } = useDevicesQuery();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive text-sm">Failed to load devices</p>;
  }

  if (!devices?.length) {
    return <p className="text-muted-foreground py-4 text-center text-sm">No devices found</p>;
  }

  return (
    <div className="space-y-2">
      {devices.map((device) => (
        <DeviceItem key={device.id} device={device} />
      ))}
    </div>
  );
}

// Import hooks and types for inline device list
import { useDevices as useDevicesQuery, useRenameDevice, useRevokeDevice } from "../hooks";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Input } from "@wealthfolio/ui/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import type { Device } from "../types";

const platformIcons: Record<string, typeof Icons.Monitor> = {
  mac: Icons.Laptop,
  windows: Icons.Monitor,
  linux: Icons.Monitor,
  ios: Icons.Smartphone,
  android: Icons.Smartphone,
};

function DeviceItem({ device }: { device: Device }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(device.name);
  const renameDevice = useRenameDevice();
  const revokeDevice = useRevokeDevice();

  const Icon = platformIcons[device.platform] || Icons.Monitor;

  const handleRename = async () => {
    if (newName.trim() && newName !== device.name) {
      await renameDevice.mutateAsync({ deviceId: device.id, name: newName.trim() });
    }
    setIsRenaming(false);
  };

  const handleRevoke = async () => {
    if (confirm("Are you sure you want to revoke this device? It will need to pair again.")) {
      await revokeDevice.mutateAsync(device.id);
    }
  };

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
        device.isCurrent ? "bg-muted/30" : "bg-background"
      }`}
    >
      {/* Device info */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="text-muted-foreground shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-7 w-full max-w-[180px]"
                maxLength={64}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setIsRenaming(false);
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
                onClick={() => {
                  setIsRenaming(false);
                  setNewName(device.name);
                }}
              >
                <Icons.Close className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{device.name}</span>
                {device.isCurrent && (
                  <Badge variant="secondary" className="h-5 shrink-0 text-[10px]">
                    This device
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                <span className="capitalize">{device.platform}</span>
                {device.lastSeenAt && (
                  <span> · Last seen {new Date(device.lastSeenAt).toLocaleDateString()}</span>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Status and actions */}
      <div className="flex shrink-0 items-center gap-2">
        {device.trustState === "trusted" ? (
          <span className="flex h-2 w-2 rounded-full bg-green-500" />
        ) : (
          <span className="flex h-2 w-2 rounded-full bg-yellow-500" />
        )}

        {!device.isCurrent && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground h-7 w-7 shrink-0">
                <Icons.MoreVertical className="h-4 w-4" />
                <span className="sr-only">Device actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsRenaming(true)}>
                <Icons.Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleRevoke}
                className="text-destructive focus:text-destructive"
                disabled={revokeDevice.isPending}
              >
                {revokeDevice.isPending ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Trash2 className="mr-2 h-4 w-4" />
                )}
                Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
