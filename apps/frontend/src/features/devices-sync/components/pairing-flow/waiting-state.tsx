// WaitingState
// Shows a loading state during pairing operations
// ===============================================

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons, Skeleton } from "@wealthfolio/ui";

interface WaitingStateProps {
  title: string;
  description?: string;
  onCancel?: () => void;
  /** Show a QR code placeholder skeleton */
  showQRSkeleton?: boolean;
  /** Security code to display (for claimer to show while waiting) */
  securityCode?: string | null;
}

export function WaitingState({
  title,
  description,
  onCancel,
  showQRSkeleton,
  securityCode,
}: WaitingStateProps) {
  return (
    <div className="flex flex-col items-center px-4 py-6">
      {showQRSkeleton ? (
        <div className="mb-6 flex flex-col items-center gap-4">
          {/* QR Code skeleton */}
          <Skeleton className="h-[160px] w-[160px] rounded-xl" />
          {/* Code skeleton */}
          <Skeleton className="h-10 w-[180px] rounded-lg" />
        </div>
      ) : securityCode ? (
        <div className="mb-6 flex flex-col items-center gap-4">
          {/* Security code display - matches SASVerification format */}
          <div className="bg-muted rounded-xl px-8 py-5">
            <span className="font-mono text-4xl font-bold tracking-widest">
              {securityCode.length > 3
                ? `${securityCode.slice(0, 3)} ${securityCode.slice(3)}`
                : securityCode}
            </span>
          </div>
          {/* Spinner below code */}
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Icons.Spinner className="h-4 w-4 animate-spin" />
            <span>Waiting for confirmation...</span>
          </div>
        </div>
      ) : (
        <div className="bg-muted/50 mb-6 flex h-20 w-20 items-center justify-center rounded-full">
          <Icons.Spinner className="text-primary h-8 w-8 animate-spin" />
        </div>
      )}

      <div className="mb-6 text-center">
        <p className="text-foreground text-base font-semibold">{title}</p>
        {description ? (
          <p className="text-muted-foreground mt-2 max-w-[240px] text-sm">{description}</p>
        ) : securityCode ? (
          <p className="text-muted-foreground mt-2 max-w-[240px] text-sm">
            Confirm this code matches on your other device
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 max-w-[240px] text-sm">
            Please wait while we securely connect your device
          </p>
        )}
      </div>

      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
