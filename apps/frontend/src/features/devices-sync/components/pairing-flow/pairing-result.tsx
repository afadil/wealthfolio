// PairingResult
// Shows success or error state after pairing
// ==========================================

import { useEffect, useRef } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui";

interface PairingResultProps {
  success: boolean;
  error?: string | null;
  onRetry?: () => void;
  onDone?: () => void;
}

function formatError(error: string | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  const e = error.toLowerCase();

  if (e.includes("invalid") && e.includes("code")) return "Invalid code. Check and try again.";
  if (e.includes("expired")) return "Session expired. Please start again.";
  if (e.includes("cancel")) return "Pairing was canceled.";
  if (e.includes("network") || e.includes("fetch")) return "Network error. Check your connection.";
  if (e.includes("timeout")) return "Connection timed out.";
  if (e.includes("not found")) return "Session not found or expired.";
  if (e.includes("decrypt") || e.includes("authentication")) return "Security verification failed.";

  return error.length > 100 ? error.slice(0, 97) + "..." : error;
}

export function PairingResult({ success, error, onRetry, onDone }: PairingResultProps) {
  const hasCalledDone = useRef(false);

  // Auto-close on success - call immediately
  useEffect(() => {
    if (success && onDone && !hasCalledDone.current) {
      hasCalledDone.current = true;
      // Small delay just to flash success state
      const timer = setTimeout(onDone, 800);
      return () => clearTimeout(timer);
    }
  }, [success, onDone]);

  if (success) {
    return (
      <div className="flex flex-col items-center px-4 py-6">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Icons.CheckCircle className="h-10 w-10 text-green-600 dark:text-green-500" />
        </div>
        <div className="mb-6 text-center">
          <p className="text-foreground text-lg font-semibold">You&apos;re all set!</p>
          <p className="text-muted-foreground mt-2 text-sm">Device connected successfully</p>
        </div>
        <Button className="w-full max-w-[200px]" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <Icons.XCircle className="h-10 w-10 text-red-600 dark:text-red-500" />
      </div>
      <div className="mb-6 text-center">
        <p className="text-foreground text-base font-semibold">Connection failed</p>
        <p className="text-muted-foreground mt-2 max-w-[240px] text-sm">{formatError(error)}</p>
      </div>
      <div className="flex gap-3">
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Try Again
          </Button>
        )}
        <Button variant={onRetry ? "ghost" : "default"} onClick={onDone}>
          {onRetry ? "Cancel" : "Close"}
        </Button>
      </div>
    </div>
  );
}
