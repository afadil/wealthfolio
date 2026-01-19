// E2EESetupCard
// Shows setup card for device sync (FRESH or REGISTERED+bootstrap state)
// One button: "Enable Device Sync" - handles enrollment + key init automatically
// ===============================================================================

import { Icons } from "@wealthfolio/ui";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { useState } from "react";
import { useDeviceSync } from "../providers/device-sync-provider";
import { SyncStates } from "../types";

export function E2EESetupCard() {
  const { state, actions } = useDeviceSync();
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnable = async () => {
    setIsEnabling(true);
    setError(null);
    try {
      // enableSync() handles everything:
      // - Enrolls device if needed
      // - Initializes E2EE keys if first device (bootstrap mode)
      // - Returns needsPairing=true if other devices exist (pair mode)
      await actions.enableSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable device sync");
    } finally {
      setIsEnabling(false);
    }
  };

  // If in READY state, don't show this card
  if (state.syncState === SyncStates.READY) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Device Sync</CardTitle>
        <CardDescription>Sync your data securely across all your devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="bg-muted/50 mb-4 rounded-full p-3">
            <Icons.CloudSync className="h-6 w-6 opacity-60" />
          </div>
          <p className="text-foreground font-medium">Keep your devices in sync</p>
          <p className="text-muted-foreground mt-1 max-w-xs text-xs">
            Your data is end-to-end encrypted. Only your devices can read it.
          </p>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleEnable}
            disabled={isEnabling || state.isLoading}
            className="mt-4"
          >
            {isEnabling || state.isLoading ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Icons.Shield className="mr-2 h-4 w-4" />
                Enable Device Sync
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
