import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Icons } from "@/components/ui/icons";
import { subWeeks, subMonths, subYears, startOfYear } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

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
      >
        <Button
          className={cn(
            "relative -m-1 h-7 overflow-hidden rounded-full px-4 py-0 transition-all duration-200",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground border-0 bg-transparent shadow-none hover:bg-transparent",
          )}
          variant="ghost"
          onClick={() => handleClick(code)}
          disabled={isLoading}
        >
          <div className="relative z-10">
            <AnimatePresence mode="wait">
              {showSpinner ? (
                <motion.div
                  key="spinner"
                  initial={{ opacity: 0, rotate: 0 }}
                  animate={{ opacity: 1, rotate: 360 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Icons.Spinner
                    className={cn("h-4 w-4 animate-spin", isSelected ? "text-primary-foreground" : "text-current")}
                  />
                </motion.div>
              ) : (
                <motion.span
                  key="text"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={isSelected ? "text-primary-foreground" : ""}
                >
                  {code}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {isSelected && (
            <motion.div
              className="bg-primary absolute inset-0 rounded-full"
              layoutId="selectedIndicator"
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            />
          )}
        </Button>
      </motion.div>
    );
  };

  return (
    <div className={cn("relative flex justify-center space-x-2", className)}>
      {intervals.map((intervalData, index) => renderButton(intervalData, index))}
    </div>
  );
};

export { IntervalSelector };
