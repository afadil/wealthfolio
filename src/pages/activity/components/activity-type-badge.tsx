import { Badge } from "@/components/ui/badge";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";

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
      return "secondary";
    case ActivityType.FEE:
    case ActivityType.TAX:
      return "destructive";
    case ActivityType.SPLIT:
      return "outline";
    default:
      return "outline";
  }
}

export function ActivityTypeBadge({ type, className }: ActivityTypeBadgeProps) {
  const variant = getActivityBadgeVariant(type);

  return (
    <Badge variant={variant} className={className}>
      {ActivityTypeNames[type]}
    </Badge>
  );
}
