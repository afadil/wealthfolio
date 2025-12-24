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
}

export function WaitingState({ title, description, onCancel, showQRSkeleton }: WaitingStateProps) {
  return (
    <div className="flex flex-col items-center gap-5 pb-2">
      {showQRSkeleton ? (
        <>
          {/* QR Code skeleton */}
          <Skeleton className="h-[160px] w-[160px] rounded-xl" />
          {/* Code skeleton */}
          <Skeleton className="h-10 w-[180px] rounded-lg" />
        </>
      ) : (
        <Icons.Spinner className="text-muted-foreground h-8 w-8 animate-spin" />
      )}
      <div className="text-center">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
      </div>
      {onCancel && (
        <Button variant="link" size="sm" className="text-muted-foreground h-auto p-0 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
