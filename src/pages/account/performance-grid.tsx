import React from 'react';
import { Card, CardContent} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { PerformanceMetrics } from '@/lib/types';
import { GainPercent } from '@/components/gain-percent';
import { cn } from '@/lib/utils';


interface MetricDisplayProps {
  label: string;
  value: number;
  infoText: string;
  annualizedValue?: number | null;
  isPercentage?: boolean;
  className?: string;
}

const MetricDisplay: React.FC<MetricDisplayProps> = ({
  label,
  value,
  infoText,
  annualizedValue,
  isPercentage = true,
  className,
}) => {
  const displayValue = isPercentage ? (
    <GainPercent value={value} animated={true} className="text-base font-medium" />
  ) : (
    <GainPercent value={value} animated={true} showSign={false} className="text-base font-medium text-foreground" />
  );

  return (
    <div
      className={cn(
        'flex min-h-[4rem] flex-col items-center justify-center space-y-1 p-4 md:p-4',
        className,
      )}
    >
      <div className="flex items-center text-xs text-muted-foreground">
        <span>{label}</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 rounded-full">
              <Info className="h-3 w-3" />
              <span className="sr-only">More info about {label}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 text-xs" side="top" align="center">
            {infoText}
          </PopoverContent>
        </Popover>
      </div>

      {annualizedValue !== undefined && annualizedValue !== null ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">{displayValue}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Annualized: <GainPercent value={annualizedValue} />
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <div>{displayValue}</div>
      )}
    </div>
  );
};

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
  if (isLoading ?? !performance) {
    return (
      <div className={cn('w-full', className)}>
        <Card className="border-none p-0">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2">
              {[...Array(4)].map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex min-h-[6rem] flex-col items-center justify-center space-y-2 p-4 md:p-6',
                    index === 0 ? 'border-b md:border-r' : '',
                    index === 1 ? 'border-b' : '',
                    index === 2 ? 'md:border-r' : '',
                  )}
                >
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-5 w-1/4" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="mt-2 flex justify-end">
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    );
  }

  // Destructure performance metrics, providing default 0 for potentially missing values
  const {
    cumulativeTwr = 0,
    annualizedTwr,
    cumulativeMwr = 0,
    annualizedMwr,
    volatility = 0,
    maxDrawdown = 0,
  } = performance;



  // Explanatory texts for info popovers
  const twrInfo =
    'Time-Weighted Return (TWR) measures the compound growth rate of a portfolio, ignoring the impact of cash flows (deposits/withdrawals). It isolates the performance of the underlying investments.';
  const mwrInfo =
    'Money-Weighted Return (MWR) measures the performance of a portfolio taking into account the size and timing of cash flows. It represents the internal rate of return (IRR) of the portfolio.';
  const volatilityInfo =
    'Volatility measures the dispersion of returns for a given investment. Higher volatility means the price of the investment can change dramatically over a short time period in either direction.';
  const maxDrawdownInfo =
    'Maximum Drawdown represents the largest percentage decline from a peak to a subsequent trough in portfolio value during the specified period. It indicates downside risk.';

  return (
    <div className={cn('w-full', className)}>
      <Card className="border-none p-0 shadow-none">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 rounded bg-muted/30 md:grid-cols-2 gap-3">
            <MetricDisplay
              label="Time Weighted Return"
              value={cumulativeTwr}
              annualizedValue={annualizedTwr}
              infoText={twrInfo}
              isPercentage={true}
              className="rounded-md border border-muted/30 bg-muted/30"
            />
            <MetricDisplay
              label="Money Weighted Return"
              value={cumulativeMwr}
              annualizedValue={annualizedMwr}
              infoText={mwrInfo}
              isPercentage={true}
              className="rounded-md border border-muted/30 bg-muted/30"
            />
            <MetricDisplay
              label="Volatility"
              value={volatility}
              infoText={volatilityInfo}
              isPercentage={false}
              className="rounded-md border border-muted/30 bg-muted/30"
            />
            <MetricDisplay
              label="Max Drawdown"
              value={maxDrawdown * -1}
              infoText={maxDrawdownInfo}
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
