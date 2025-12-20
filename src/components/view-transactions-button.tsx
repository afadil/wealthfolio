import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ViewTransactionsButtonProps {
  /** Navigate to activities filtered by date range */
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  /** Navigate to activities filtered by event ID */
  eventId?: string;
  /** Custom class name */
  className?: string;
  /** Callback before navigation (e.g., to close a modal) */
  onBeforeNavigate?: () => void;
}

export function ViewTransactionsButton({
  dateRange,
  eventId,
  className,
  onBeforeNavigate,
}: ViewTransactionsButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    onBeforeNavigate?.();

    if (eventId) {
      navigate(`/activity?tab=cash&event=${eventId}`);
    } else if (dateRange) {
      navigate(
        `/activity?tab=cash&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
      );
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={className ?? "w-full gap-2"}
      onClick={handleClick}
    >
      <ExternalLink className="h-4 w-4" />
      View All Transactions
    </Button>
  );
}
