// WaitingState
// Shows a loading state during pairing operations
// ===============================================

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui";

interface WaitingStateProps {
  title: string;
  description: string;
  onCancel?: () => void;
}

export function WaitingState({ title, description, onCancel }: WaitingStateProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      <div className="flex items-center justify-center py-8">
        <Icons.Spinner className="text-primary h-12 w-12 animate-spin" />
      </div>

      {onCancel && (
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
