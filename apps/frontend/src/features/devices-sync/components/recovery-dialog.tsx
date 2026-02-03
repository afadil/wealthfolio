// RecoveryDialog
// Dialog shown when device sync is in RECOVERY state (device was removed)
// ======================================================================

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Icons } from "@wealthfolio/ui";
import { useState } from "react";
import { useDeviceSync } from "../providers/device-sync-provider";

interface RecoveryDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RecoveryDialog({ open, onOpenChange }: RecoveryDialogProps) {
  const { actions } = useDeviceSync();
  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecovery = async () => {
    setIsRecovering(true);
    try {
      await actions.handleRecovery();
      onOpenChange?.(false);
    } catch {
      // Error handling is done by the provider
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <Icons.AlertTriangle className="h-5 w-5 text-amber-500" />
            <AlertDialogTitle>Device Removed</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-2">
            <p>
              This device was removed from your account, either from another device or from the web
              portal.
            </p>
            <p>
              You&apos;ll need to re-enable device sync and pair with a trusted device to continue
              syncing your data.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleRecovery} disabled={isRecovering}>
            {isRecovering ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              "Understood"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
