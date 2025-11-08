import {
  MAX_DRAWDOWN_INFO,
  MetricDisplay,
  MONEY_WEIGHTED_RETURN_INFO,
  TIME_WEIGHTED_RETURN_INFO,
  VOLATILITY_INFO,
} from "@/components/metric-display";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PerformanceMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";
import React from "react";
import { useTranslation } from "react-i18next";

export interface PerformanceGridProps {
  performance?: PerformanceMetrics | null;
  isLoading?: boolean;
  className?: string;
}

export const PerformanceGrid: React.FC<PerformanceGridProps> = ({
  performance,
  isLoading,
  className,
}) => {
  const { t } = useTranslation("account");
  if (isLoading || !performance) {
    return (
      <div className={cn("w-full", className)}>
        <Card className="border-none p-0 shadow-none">
          <CardContent className="p-0">
            <div className="grid grid-cols-2 gap-5">
              {[...Array(4)].map((_, index) => (
                <div
                  key={index}
                  className="border-muted/30 bg-muted/30 flex min-h-24 flex-col items-center justify-center space-y-2 rounded-md border p-4 md:p-6"
                >
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Destructure performance metrics, providing default 0 for potentially missing values
  const {
    cumulativeTwr = 0,
    annualizedTwr = 0,
    cumulativeMwr = 0,
    annualizedMwr = 0,
    volatility = 0,
    maxDrawdown = 0,
  } = performance;

  return (
    <div className={cn("w-full", className)}>
      <Card className="border-none p-0 shadow-none">
        <CardContent className="p-0">
          <div className="grid grid-cols-2 gap-5">
            <MetricDisplay
              label={t("time_weighted_return")}
              value={cumulativeTwr}
              annualizedValue={annualizedTwr}
              infoText={TIME_WEIGHTED_RETURN_INFO}
              isPercentage={true}
              className="border-muted/30 bg-muted/30 rounded-md border"
            />
            <MetricDisplay
              label={t("money_weighted_return")}
              value={cumulativeMwr}
              annualizedValue={annualizedMwr}
              infoText={MONEY_WEIGHTED_RETURN_INFO}
              isPercentage={true}
              className="border-muted/30 bg-muted/30 rounded-md border"
            />
            <MetricDisplay
              label={t("volatility")}
              value={volatility}
              infoText={VOLATILITY_INFO}
              isPercentage={false}
              className="border-muted/30 bg-muted/30 rounded-md border"
            />
            <MetricDisplay
              label={t("max_drawdown")}
              value={maxDrawdown * -1}
              infoText={MAX_DRAWDOWN_INFO}
              isPercentage={true}
              className="border-muted/30 bg-muted/30 rounded-md border"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Default export for easy import
export default PerformanceGrid;
