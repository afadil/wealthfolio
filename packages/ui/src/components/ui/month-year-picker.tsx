"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr",
  "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec",
];

const FULL_MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

interface MonthYearPickerProps {
  /** Currently selected month (YYYY-MM format) */
  value?: string;
  /** Callback when month is selected */
  onChange?: (value: string) => void;
  /** Minimum selectable date (YYYY-MM format) */
  minDate?: string;
  /** Maximum selectable date (YYYY-MM format) */
  maxDate?: string;
  /** Additional class name */
  className?: string;
}

function MonthYearPicker({
  value,
  onChange,
  minDate,
  maxDate,
  className,
}: MonthYearPickerProps) {
  // Parse current value or use current date
  const [selectedYear, selectedMonth] = React.useMemo(() => {
    if (value) {
      const [year, month] = value.split("-").map(Number);
      return [year, month];
    }
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1];
  }, [value]);

  // Year being viewed (can be different from selected year)
  const [viewYear, setViewYear] = React.useState(selectedYear);

  // Update view year when selection changes
  React.useEffect(() => {
    setViewYear(selectedYear);
  }, [selectedYear]);

  // Parse min/max dates
  const [minYear, minMonth] = React.useMemo(() => {
    if (minDate) {
      const [year, month] = minDate.split("-").map(Number);
      return [year, month];
    }
    return [1970, 1];
  }, [minDate]);

  const [maxYear, maxMonth] = React.useMemo(() => {
    if (maxDate) {
      const [year, month] = maxDate.split("-").map(Number);
      return [year, month];
    }
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1];
  }, [maxDate]);

  const canGoPrevYear = viewYear > minYear;
  const canGoNextYear = viewYear < maxYear;

  const handlePrevYear = () => {
    if (canGoPrevYear) {
      setViewYear((y) => y - 1);
    }
  };

  const handleNextYear = () => {
    if (canGoNextYear) {
      setViewYear((y) => y + 1);
    }
  };

  const handleMonthClick = (monthIndex: number) => {
    const month = monthIndex + 1;
    const monthStr = String(month).padStart(2, "0");
    onChange?.(`${viewYear}-${monthStr}`);
  };

  const isMonthDisabled = (monthIndex: number) => {
    const month = monthIndex + 1;
    if (viewYear < minYear || (viewYear === minYear && month < minMonth)) {
      return true;
    }
    if (viewYear > maxYear || (viewYear === maxYear && month > maxMonth)) {
      return true;
    }
    return false;
  };

  const isMonthSelected = (monthIndex: number) => {
    const month = monthIndex + 1;
    return viewYear === selectedYear && month === selectedMonth;
  };

  return (
    <div className={cn("p-3 w-[240px]", className)} data-slot="month-year-picker">
      {/* Year navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handlePrevYear}
          disabled={!canGoPrevYear}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{viewYear}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleNextYear}
          disabled={!canGoNextYear}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-3 gap-2">
        {MONTHS.map((month, index) => {
          const disabled = isMonthDisabled(index);
          const selected = isMonthSelected(index);
          return (
            <Button
              key={month}
              variant={selected ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-8 text-xs font-normal",
                disabled && "opacity-50 cursor-not-allowed",
                selected && "bg-primary text-primary-foreground",
              )}
              onClick={() => !disabled && handleMonthClick(index)}
              disabled={disabled}
            >
              {month}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export { MonthYearPicker, MONTHS, FULL_MONTHS };
