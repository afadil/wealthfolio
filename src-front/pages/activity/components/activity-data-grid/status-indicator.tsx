import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@wealthfolio/ui";
import type { LocalTransaction } from "./types";
import { isPendingReview } from "./types";

interface StatusIndicatorProps {
  transaction: LocalTransaction;
}

/**
 * Shows a visual indicator for transactions that are pending review
 * (synced from broker but not yet approved by the user)
 */
export function StatusIndicator({ transaction }: StatusIndicatorProps) {
  if (!isPendingReview(transaction)) {
    return null;
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-destructive w-full cursor-help text-center">●</div>
    </div>
  );
}

interface StatusHeaderIndicatorProps {
  hasRowsToReview: boolean;
}

/**
 * Shows a visual indicator in the header when any visible rows need review
 */
export function StatusHeaderIndicator({ hasRowsToReview }: StatusHeaderIndicatorProps) {
  if (!hasRowsToReview) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="text-destructive w-full cursor-help text-center">●</div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Newly imported &</p>
          <p>Pending verification</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
