import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { GainPercent } from "@wealthfolio/ui";
import { cn } from "@/lib/utils";

// Explanatory texts for info popovers
export const TIME_WEIGHTED_RETURN_INFO =
  "Time-Weighted Return (TWR) measures the compound growth rate of a portfolio, ignoring the impact of cash flows (deposits/withdrawals). It isolates the performance of the underlying investments.";
export const MONEY_WEIGHTED_RETURN_INFO =
  "Money-Weighted Return (MWR) measures the performance of a portfolio taking into account the size and timing of cash flows. It represents the internal rate of return (IRR) of the portfolio.";
export const VOLATILITY_INFO =
  "Volatility measures the dispersion of returns for a given investment. Higher volatility means the price of the investment can change dramatically over a short time period in either direction.";
export const MAX_DRAWDOWN_INFO =
  "Maximum Drawdown represents the largest percentage decline from a peak to a subsequent trough in portfolio value during the specified period. It indicates downside risk.";
export const ANNUALIZED_RETURN_INFO =
  "Annualized Return shows the geometric average amount of money earned by an investment each year over the selected period, as if the returns were compounded annually.";

export interface MetricDisplayProps {
  label: string;
  value?: number; // Made optional as performance-page might only need label and info
  infoText: string;
  annualizedValue?: number | null;
  isPercentage?: boolean;
  className?: string;
  valueClassName?: string; // Added to allow custom styling for the value itself
  labelComponent?: React.ReactNode; // Allow passing a full component for label + info
}

export const MetricDisplay: React.FC<MetricDisplayProps> = ({
  label,
  value,
  infoText,
  annualizedValue,
  isPercentage = true,
  className,
  valueClassName,
  labelComponent,
}) => {
  const displayValue =
    value !== undefined ? (
      <GainPercent
        value={value}
        animated={true}
        showSign={isPercentage}
        className={cn("text-base font-medium", !isPercentage && "text-foreground", valueClassName)}
      />
    ) : null;

  const labelContent = labelComponent ?? (
    <div className="text-muted-foreground flex items-center text-xs">
      <span>{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 rounded-full p-0">
            <Icons.Info className="h-3 w-3" />
            <span className="sr-only">More info about {label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 text-xs" side="top" align="center">
          {infoText}
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div
      className={cn(
        "flex min-h-16 flex-col items-center justify-center space-y-1 p-4 md:p-4",
        className,
      )}
    >
      {labelContent}

      {displayValue && annualizedValue !== undefined && annualizedValue !== null ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">{displayValue}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Annualized: <GainPercent value={annualizedValue} animated={false} />
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        displayValue && <div>{displayValue}</div>
      )}
    </div>
  );
};

// Simple component for displaying only the label with info popover
// This can be used by performance-page.tsx
export interface MetricLabelWithInfoProps {
  label: string;
  infoText: string;
  className?: string;
}

export const MetricLabelWithInfo: React.FC<MetricLabelWithInfoProps> = ({
  label,
  infoText,
  className,
}) => {
  return (
    <div className={cn("text-muted-foreground flex items-center text-xs font-light", className)}>
      <span>{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 rounded-full p-0">
            <Icons.Info className="h-3 w-3" />
            <span className="sr-only">More info about {label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 text-xs" side="top" align="center">
          {infoText}
        </PopoverContent>
      </Popover>
    </div>
  );
};
