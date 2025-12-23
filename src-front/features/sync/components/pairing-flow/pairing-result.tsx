// PairingResult
// Shows success or error state after pairing
// ==========================================

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui";

interface PairingResultProps {
  success: boolean;
  error?: string | null;
  onRetry?: () => void;
  onDone?: () => void;
}

export function PairingResult({ success, error, onRetry, onDone }: PairingResultProps) {
  if (success) {
    return (
      <div className="flex flex-col items-center gap-6 p-6">
        <div className="text-success">
          <Icons.CheckCircle className="h-16 w-16" />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-semibold">Pairing Complete</h2>
          <p className="text-muted-foreground mt-1">
            Your device is now paired and ready to sync securely.
          </p>
        </div>

        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-destructive">
        <Icons.XCircle className="h-16 w-16" />
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold">Pairing Failed</h2>
        <p className="text-muted-foreground mt-1">{error || "Something went wrong. Please try again."}</p>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={onRetry} className="gap-2">
          <Icons.RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
