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
  /** Navigate to activities filtered by category ID */
  categoryId?: string;
  /** Custom class name */
  className?: string;
  /** Button size */
  size?: "default" | "sm" | "lg" | "icon";
  /** Callback before navigation (e.g., to close a modal) */
  onBeforeNavigate?: () => void;
  /** Custom button text */
  children?: React.ReactNode;
}

export function ViewTransactionsButton({
  dateRange,
  eventId,
  categoryId,
  className,
  size = "sm",
  onBeforeNavigate,
  children,
}: ViewTransactionsButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    onBeforeNavigate?.();

    const params = new URLSearchParams();
    params.set("tab", "cash");

    if (eventId) {
      params.set("event", eventId);
    }
    if (categoryId) {
      params.set("category", categoryId);
    }
    if (dateRange) {
      params.set("startDate", dateRange.startDate);
      params.set("endDate", dateRange.endDate);
    }

    navigate(`/activity?${params.toString()}`);
  };

  return (
    <Button
      variant="outline"
      size={size}
      className={className ?? "w-full gap-2"}
      onClick={handleClick}
    >
      <ExternalLink className="h-4 w-4" />
      {children || "View All Transactions"}
    </Button>
  );
}
