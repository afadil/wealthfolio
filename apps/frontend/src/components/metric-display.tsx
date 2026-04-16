import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GainPercent } from "@wealthfolio/ui";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

// Info text keys for metric popovers
export const TIME_WEIGHTED_RETURN_INFO_KEY = "performance.metric.twr_info";
export const MONEY_WEIGHTED_RETURN_INFO_KEY = "performance.metric.mwr_info";
export const VOLATILITY_INFO_KEY = "performance.metric.volatility_info";
export const MAX_DRAWDOWN_INFO_KEY = "performance.metric.max_drawdown_info";
export const ANNUALIZED_RETURN_INFO_KEY = "performance.metric.annualized_return_info";
// Holdings mode specific info keys (value-based, not cash-flow adjusted)
export const HOLDINGS_MODE_VOLATILITY_INFO_KEY = "performance.metric.holdings_mode_volatility_info";
export const HOLDINGS_MODE_MAX_DRAWDOWN_INFO_KEY = "performance.metric.holdings_mode_max_drawdown_info";

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
  const { t } = useTranslation("common");
  const [mobilePopoverOpen, setMobilePopoverOpen] = useState(false);

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
    <div className="text-muted-foreground flex w-full items-center justify-center text-xs">
      <span className="text-center">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 hidden h-4 w-4 rounded-full p-0 md:inline-flex"
          >
            <Icons.Info className="h-3 w-3" />
            <span className="sr-only">{t("metric_display.more_info_about", { label })}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 text-xs" side="top" align="center">
          {infoText}
        </PopoverContent>
      </Popover>
    </div>
  );

  const content = (
    <>
      {labelContent}

      {displayValue && annualizedValue !== undefined && annualizedValue !== null ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">{displayValue}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {t("metric_display.annualized_prefix")}{" "}
                <GainPercent value={annualizedValue} animated={false} />
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        displayValue && <div>{displayValue}</div>
      )}
    </>
  );

  return (
    <Popover open={mobilePopoverOpen} onOpenChange={setMobilePopoverOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "flex min-h-16 flex-col items-center justify-center space-y-1 p-4 md:cursor-default md:p-4",
            "cursor-pointer md:cursor-auto",
            className,
          )}
        >
          {content}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-60 text-xs md:hidden" side="top" align="center">
        {infoText}
      </PopoverContent>
    </Popover>
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
  const { t } = useTranslation("common");
  return (
    <div className={cn("text-muted-foreground flex items-center text-xs font-light", className)}>
      <span>{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 rounded-full p-0">
            <Icons.Info className="h-3 w-3" />
            <span className="sr-only">{t("metric_display.more_info_about", { label })}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 text-xs" side="top" align="center">
          {infoText}
        </PopoverContent>
      </Popover>
    </div>
  );
};
