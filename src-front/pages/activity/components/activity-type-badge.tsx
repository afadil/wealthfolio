import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface ActivityTypeBadgeProps {
  type: ActivityType;
  className?: string;
}

function getActivityBadgeVariant(type: ActivityType) {
  switch (type) {
    case ActivityType.DIVIDEND:
    case ActivityType.INTEREST:
    case ActivityType.BUY:
    case ActivityType.DEPOSIT:
    case ActivityType.TRANSFER_IN:
    case ActivityType.ADD_HOLDING:
      return "success";
    case ActivityType.SELL:
    case ActivityType.WITHDRAWAL:
    case ActivityType.TRANSFER_OUT:
    case ActivityType.REMOVE_HOLDING:
    case ActivityType.FEE:
    case ActivityType.TAX:
      return "destructive";
    case ActivityType.SPLIT:
      return "secondary";
    default:
      return "default";
  }
}

export function ActivityTypeBadge({ type, className }: ActivityTypeBadgeProps) {
  const variant = getActivityBadgeVariant(type);

  return (
    <Badge variant={variant} className={cn("rounded-sm", className)}>
      {ActivityTypeNames[type]}
    </Badge>
  );
}
