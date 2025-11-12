import { ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/ui/icons";
import {
  useUpdatePortfolioMutation,
  useRecalculatePortfolioMutation,
} from "@/hooks/use-calculate-portfolio";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { useTranslation } from "react-i18next";

// Rename interface
interface PortfolioUpdateTriggerProps {
  lastCalculatedAt: string | undefined;
  children: ReactNode;
}

// Rename function
export function PortfolioUpdateTrigger({
  lastCalculatedAt,
  children,
}: PortfolioUpdateTriggerProps) {
  const { t } = useTranslation("dashboard");
  const { formatDateTimeDisplay } = useDateFormatter();
  // Instantiate the mutation hooks inside the component
  const updatePortfolioMutation = useUpdatePortfolioMutation();
  const recalculatePortfolioMutation = useRecalculatePortfolioMutation();

  // Define handlers internally
  const handleUpdate = () => {
    updatePortfolioMutation.mutate();
  };

  const handleRecalculate = () => {
    recalculatePortfolioMutation.mutate();
  };

  return (
    <HoverCard>
      <HoverCardTrigger className="flex cursor-pointer items-center">{children}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 shadow-none">
        <div className="flex flex-col space-y-4">
          <div className="space-y-2">
            <h4 className="flex text-sm font-light">
              <Icons.Calendar className="mr-2 h-4 w-4" />
              {t("portfolioUpdate.asOf")}{" "}
              <Badge className="ml-1 font-medium" variant="secondary">
                {/* Use lastCalculatedAt prop */}
                {lastCalculatedAt ? formatDateTimeDisplay(lastCalculatedAt) : "-"}
              </Badge>
            </h4>
          </div>
          <Button
            onClick={handleUpdate} // Use internal handler
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={updatePortfolioMutation.isPending} // Use internal mutation state
          >
            {updatePortfolioMutation.isPending ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Refresh className="mr-2 h-4 w-4" />
            )}
            {updatePortfolioMutation.isPending
              ? t("portfolioUpdate.updating")
              : t("portfolioUpdate.updateButton")}
          </Button>
          <Button
            onClick={handleRecalculate}
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={recalculatePortfolioMutation.isPending}
          >
            {recalculatePortfolioMutation.isPending ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Refresh className="mr-2 h-4 w-4" />
            )}
            {recalculatePortfolioMutation.isPending
              ? t("portfolioUpdate.recalculating")
              : t("portfolioUpdate.recalculateButton")}
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
