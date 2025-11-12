import { AnimatedToggleGroup } from "@/components/ui/animated-toggle-group";
import { cn } from "@/lib/utils";
import { startOfYear, subMonths, subWeeks, subYears } from "date-fns";
import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

export type TimePeriod = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "ALL";
export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface IntervalData {
  code: TimePeriod;
  description: string;
  calculateRange: () => DateRange | undefined;
}

const getIntervalDescriptions = (t: (key: string) => string): Record<TimePeriod, string> => ({
  "1D": t("intervals.1D"),
  "1W": t("intervals.1W"),
  "1M": t("intervals.1M"),
  "3M": t("intervals.3M"),
  "6M": t("intervals.6M"),
  YTD: t("intervals.YTD"),
  "1Y": t("intervals.1Y"),
  "3Y": t("intervals.3Y"),
  "5Y": t("intervals.5Y"),
  ALL: t("intervals.ALL"),
});

const createIntervals = (t: (key: string) => string): IntervalData[] => {
  const intervalDescriptions = getIntervalDescriptions(t);

  return [
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
      code: "3Y",
      description: intervalDescriptions["3Y"],
      calculateRange: () => ({ from: subYears(new Date(), 3), to: new Date() }),
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
};

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
  initialSelection = DEFAULT_INTERVAL_CODE,
}) => {
  const { t } = useTranslation();
  const intervals = useMemo(() => createIntervals(t), [t]);

  const handleValueChange = useCallback(
    (value: TimePeriod) => {
      const selectedData = intervals.find((i) => i.code === value);
      const dataToReturn = selectedData ?? intervals.find((i) => i.code === DEFAULT_INTERVAL_CODE)!;
      onIntervalSelect(dataToReturn.code, dataToReturn.description, dataToReturn.calculateRange());
    },
    [onIntervalSelect, intervals, t],
  );

  const items = useMemo(
    () =>
      intervals.map((interval) => ({
        value: interval.code,
        label: interval.code,
        title: interval.description,
      })),
    [intervals],
  );

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <div
        className={cn(
          "relative z-30 flex w-full justify-center overflow-x-auto overflow-y-hidden",
          "touch-pan-x snap-x snap-mandatory overscroll-x-contain scroll-smooth",
          "px-2 md:px-0",
          "[&::-webkit-scrollbar]:hidden",
          "[scrollbar-width:none]",
          "[-webkit-overflow-scrolling:touch]",
        )}
      >
        <AnimatedToggleGroup
          items={items}
          defaultValue={initialSelection}
          onValueChange={handleValueChange}
          size="sm"
          variant="default"
          className="bg-transparent"
        />
      </div>
    </div>
  );
};

export { IntervalSelector };
