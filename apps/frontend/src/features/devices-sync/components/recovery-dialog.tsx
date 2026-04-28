// RecoveryDialog
// Dialog shown when device sync is in RECOVERY state (device was removed)
// ======================================================================

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Icons } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { useSyncActions } from "../hooks";

interface RecoveryDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RecoveryDialog({ open, onOpenChange }: RecoveryDialogProps) {
  const { handleRecovery } = useSyncActions();

  const onRecovery = async () => {
    await handleRecovery.mutateAsync();
    onOpenChange?.(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-sm:bg-background/90 gap-8 text-center max-sm:bottom-6 max-sm:left-4 max-sm:right-4 max-sm:top-auto max-sm:w-auto max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-3xl max-sm:shadow-2xl max-sm:backdrop-blur-2xl sm:max-w-lg">
        <AlertDialogHeader className="items-center gap-4 px-8 text-center">
          <div className="border-warning/30 bg-warning/10 dark:border-warning/20 dark:bg-warning/15 flex h-14 w-14 items-center justify-center rounded-full border">
            <Icons.AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <AlertDialogTitle className="text-center text-xl">
            Set Up This Device Again
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm">
            Sync was turned off for this device. Set it up again to keep your data up to date across
            your devices.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange?.(false)}>
            Not now
          </Button>
          <AlertDialogAction onClick={onRecovery} disabled={handleRecovery.isPending}>
            {handleRecovery.isPending ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              "Set Up This Device Again"
            )}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
