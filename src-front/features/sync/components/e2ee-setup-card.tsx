// E2EESetupCard
// Shows setup options for device sync (owner only, first device)
// ==============================================================

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
import { useSync } from "../providers/sync-provider";

export function E2EESetupCard() {
  const { state, actions } = useSync();
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnable = async () => {
    setIsEnabling(true);
    setError(null);
    try {
      await actions.enableE2EE();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable device sync");
    } finally {
      setIsEnabling(false);
    }
  };

  // Already enabled
  if (state.syncStatus?.e2eeEnabled) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Sync Devices</CardTitle>
        <CardDescription>
          Sync your portfolio data across multiple devices with end-to-end encryption.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-muted-foreground space-y-2 text-sm">
          <p>When enabled:</p>
          <ul className="list-inside list-disc space-y-1 pl-2">
            <li>Your financial data stays on your devices, always</li>
            <li>Data is end-to-end encrypted when syncing between devices</li>
            <li>Wealthfolio servers never see your data</li>
          </ul>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleEnable} disabled={isEnabling} className="w-full">
          {isEnabling ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Enabling...
            </>
          ) : (
            <>
              <Icons.Unplug className="mr-2 h-4 w-4" />
              Enable Device Sync
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
