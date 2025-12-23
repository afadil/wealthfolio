// ResetSyncDialog
// Confirmation dialog for resetting sync (owner only)
// ===================================================

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { Icons } from "@wealthfolio/ui";
import { useSync } from "../providers/sync-provider";

interface ResetSyncDialogProps {
  trigger?: React.ReactNode;
}

export function ResetSyncDialog({ trigger }: ResetSyncDialogProps) {
  const { actions } = useSync();
  const [isResetting, setIsResetting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await actions.resetSync();
      setOpen(false);
    } catch {
      // Error handled in provider
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              {trigger || (
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8">
                  <Icons.RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Icons.AlertTriangle className="text-destructive h-5 w-5" />
                  Reset Device Sync?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>This will:</p>
                  <ul className="list-inside list-disc space-y-1 pl-2">
                    <li>Revoke access from all other devices</li>
                    <li>Generate a new encryption key</li>
                    <li>Require all devices to pair again</li>
                  </ul>
                  <p className="font-medium">This action cannot be undone.</p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleReset}
                  disabled={isResetting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isResetting ? (
                    <>
                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset Sync"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>Reset sync</p>
      </TooltipContent>
    </Tooltip>
  );
}
