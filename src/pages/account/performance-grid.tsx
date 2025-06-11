import React from 'react';
import { Card, CardContent} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PerformanceMetrics } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  MetricDisplay,
  TIME_WEIGHTED_RETURN_INFO,
  MONEY_WEIGHTED_RETURN_INFO,
  VOLATILITY_INFO,
  MAX_DRAWDOWN_INFO
} from '@/components/metric-display';

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

  if (isLoading || !performance) {
    return (
      <div className={cn('w-full', className)}>
        <Card className="border-none p-0 shadow-none">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[...Array(4)].map((_, index) => (
                <div
                  key={index}
                  className="rounded-md border border-muted/30 bg-muted/30 flex min-h-[6rem] flex-col items-center justify-center space-y-2 p-4 md:p-6"
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
    <div className={cn('w-full', className)}>
      <Card className="border-none p-0 shadow-none">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <MetricDisplay
              label="Time Weighted Return"
              value={cumulativeTwr}
              annualizedValue={annualizedTwr}
              infoText={TIME_WEIGHTED_RETURN_INFO}
              isPercentage={true}
              className="rounded-md border border-muted/30 bg-muted/30"
            />
            <MetricDisplay
              label="Money Weighted Return"
              value={cumulativeMwr}
              annualizedValue={annualizedMwr}
              infoText={MONEY_WEIGHTED_RETURN_INFO}
              isPercentage={true}
              className="rounded-md border border-muted/30 bg-muted/30"
            />
            <MetricDisplay
              label="Volatility"
              value={volatility}
              infoText={VOLATILITY_INFO}
              isPercentage={false}
              className="rounded-md border border-muted/30 bg-muted/30"
            />
            <MetricDisplay
              label="Max Drawdown"
              value={maxDrawdown * -1}
              infoText={MAX_DRAWDOWN_INFO}
              isPercentage={true}
              className="rounded-md border border-muted/30 bg-muted/30"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Default export for easy import
export default PerformanceGrid;
