import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@wealthfolio/ui";

export interface ToolErrorProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ToolError({
  title = "Error",
  message,
  onRetry,
}: ToolErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-6 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <div className="flex flex-col gap-1">
        <p className="font-medium text-destructive">{title}</p>
        <p className="text-sm text-destructive/80">{message}</p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
