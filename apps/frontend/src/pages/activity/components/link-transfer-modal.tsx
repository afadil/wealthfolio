import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Button, formatAmount, Icons } from "@wealthfolio/ui";
import { ActivityType } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface LinkTransferModalProps {
  isOpen: boolean;
  isLinking: boolean;
  activityIn?: ActivityDetails;
  activityOut?: ActivityDetails;
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

function ActivityRow({ activity, label }: { activity: ActivityDetails; label: string }) {
  const date = formatDateTime(activity.date).date;
  const value = activity.amount ?? activity.unitPrice;
  return (
    <div className="bg-muted/30 flex flex-col gap-1 rounded-md border px-3 py-2 text-sm">
      <div className="text-muted-foreground flex items-center justify-between text-xs uppercase">
        <span>{label}</span>
        <span>
          {activity.activityType === ActivityType.TRANSFER_IN ? "Transfer In" : "Transfer Out"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-medium">{activity.accountName}</span>
        <span>{date}</span>
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>{activity.assetSymbol || "Cash"}</span>
        <span>
          {value != null ? formatAmount(Number(value), activity.currency) : activity.currency}
        </span>
      </div>
    </div>
  );
}

export function LinkTransferModal({
  isOpen,
  isLinking,
  activityIn,
  activityOut,
  warnings,
  onConfirm,
  onCancel,
}: LinkTransferModalProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Link as internal transfer</AlertDialogTitle>
          <AlertDialogDescription>
            These two activities will be paired and treated as a single internal transfer between
            your accounts.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {activityIn && activityOut ? (
          <div className="flex flex-col gap-2">
            <ActivityRow activity={activityOut} label="Source" />
            <div className="flex justify-center">
              <Icons.ArrowDown className="text-muted-foreground h-4 w-4" />
            </div>
            <ActivityRow activity={activityIn} label="Destination" />
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="border-warning/40 bg-warning/10 text-warning-foreground flex gap-2 rounded-md border px-3 py-2 text-xs">
            <Icons.AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <ul className="space-y-0.5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLinking}>Cancel</AlertDialogCancel>
          <Button onClick={onConfirm} disabled={isLinking}>
            {isLinking ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Link className="mr-2 h-4 w-4" />
            )}
            <span>Link transfers</span>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
