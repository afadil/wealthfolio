import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { startOfYear, subMonths, subWeeks, subYears } from "date-fns";
import { motion } from "motion/react";
import React, { useCallback, useState } from "react";

export type TimePeriod = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";
export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface IntervalData {
  code: TimePeriod;
  description: string;
  calculateRange: () => DateRange | undefined;
}

const intervalDescriptions: Record<TimePeriod, string> = {
  "1D": "past day",
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  "6M": "past 6 months",
  YTD: "year to date",
  "1Y": "past year",
  "5Y": "past 5 years",
  ALL: "All Time",
};

const intervals: IntervalData[] = [
  {
    code: "1W",
    description: intervalDescriptions["1W"],
    calculateRange: () => ({ from: subWeeks(new Date(), 1), to: new Date() }),
  },
  {
    code: "1M",
    description: intervalDescriptions["1M"],
    calculateRange: () => ({ from: subMonths(new Date(), 1), to: new Date() }),
  },
  {
    code: "3M",
    description: intervalDescriptions["3M"],
    calculateRange: () => ({ from: subMonths(new Date(), 3), to: new Date() }),
  },
  {
    code: "6M",
    description: intervalDescriptions["6M"],
    calculateRange: () => ({ from: subMonths(new Date(), 6), to: new Date() }),
  },
  {
    code: "YTD",
    description: intervalDescriptions.YTD,
    calculateRange: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
  {
    code: "1Y",
    description: intervalDescriptions["1Y"],
    calculateRange: () => ({ from: subYears(new Date(), 1), to: new Date() }),
  },
  {
    code: "5Y",
    description: intervalDescriptions["5Y"],
    calculateRange: () => ({ from: subYears(new Date(), 5), to: new Date() }),
  },
  {
    code: "ALL",
    description: intervalDescriptions.ALL,
    calculateRange: () => ({ from: new Date("1970-01-01"), to: new Date() }),
  },
];

const DEFAULT_INTERVAL_CODE: TimePeriod = "3M";

interface IntervalSelectorProps {
  onIntervalSelect: (code: TimePeriod, description: string, range: DateRange | undefined) => void;
  className?: string;
  isLoading?: boolean;
  initialSelection?: TimePeriod;
}

const IntervalSelector: React.FC<IntervalSelectorProps> = ({
  onIntervalSelect,
  className,
  isLoading,
  initialSelection = DEFAULT_INTERVAL_CODE,
}) => {
  const [selectedCode, setSelectedCode] = useState<TimePeriod>(initialSelection);

  const handleClick = useCallback(
    (intervalCode: TimePeriod) => {
      setSelectedCode(intervalCode);
      const selectedData = intervals.find((i) => i.code === intervalCode);

      const dataToReturn = selectedData ?? intervals.find((i) => i.code === DEFAULT_INTERVAL_CODE)!;

      onIntervalSelect(dataToReturn.code, dataToReturn.description, dataToReturn.calculateRange());
    },
    [onIntervalSelect],
  );

  const renderButton = (intervalData: IntervalData, index: number) => {
    const { code } = intervalData;
    const isSelected = selectedCode === code;
    const showSpinner = isLoading && isSelected;

    // Calculate opacity based on distance from selected button
    const selectedIndex = intervals.findIndex((interval) => interval.code === selectedCode);
    const distanceFromSelected = Math.abs(index - selectedIndex);
    const maxDistance = Math.max(selectedIndex, intervals.length - 1 - selectedIndex);
    const opacity = isSelected ? 1 : Math.max(0.25, 1 - (distanceFromSelected / Math.max(maxDistance, 1)) * 0.75);

    return (
      <motion.div
        key={code}
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: opacity,
          scale: 1,
        }}
        whileHover={
          !isSelected
            ? {
                opacity: 1,
                transition: { duration: 0.15 },
              }
            : {}
        }
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 25,
          opacity: { duration: 0.2 },
        }}
        className="shrink-0 snap-center"
      >
        <Button
          className={cn(
            "relative h-7 min-h-0 overflow-hidden rounded-full px-3 py-0 text-sm leading-none transition-all duration-200 md:px-4",
            isSelected
              ? "text-primary-foreground bg-transparent"
              : "text-muted-foreground hover:text-foreground border-0 bg-transparent shadow-none hover:bg-transparent",
          )}
          variant="ghost"
          size="sm"
          onClick={() => handleClick(code)}
          disabled={isLoading}
        >
          <div className="relative z-10">
            {showSpinner ? (
              <Icons.Spinner
                className={cn("h-3.5 w-3.5 animate-spin", isSelected ? "text-primary-foreground" : "text-current")}
              />
            ) : (
              <span className={cn("leading-none transition-colors", isSelected ? "text-primary-foreground" : "")}>
                {code}
              </span>
            )}
          </div>
          {isSelected && (
            <motion.div
              layoutId="intervalSelectorIndicator"
              className="bg-primary absolute inset-0 rounded-full"
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            />
          )}
        </Button>
      </motion.div>
    );
  };

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <div
        className={cn(
          "relative z-30 w-full overflow-x-scroll overflow-y-hidden",
          "touch-pan-x snap-x snap-mandatory overscroll-x-contain scroll-smooth",
          "px-4 md:mx-0 md:px-0",
          "[&::-webkit-scrollbar]:hidden",
          "[scrollbar-width:none]",
          "[-webkit-overflow-scrolling:touch]",
        )}
      >
        <div className="mx-auto inline-flex min-w-max flex-nowrap items-center space-x-1 whitespace-nowrap md:space-x-2">
          {intervals.map((intervalData, index) => renderButton(intervalData, index))}
        </div>
      </div>
    </div>
  );
};

export { IntervalSelector };
