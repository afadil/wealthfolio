import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MonthYearPicker } from "@wealthfolio/ui";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { format, parse, subMonths, addMonths } from "date-fns";
import { useMemo, useState } from "react";

interface MonthSwitcherProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  availableMonths: string[];
}

export function MonthSwitcher({
  selectedMonth,
  onMonthChange,
  availableMonths,
}: MonthSwitcherProps) {
  const [open, setOpen] = useState(false);

  const selectedDate = useMemo(() => {
    return parse(selectedMonth, "yyyy-MM", new Date());
  }, [selectedMonth]);

  const displayLabel = useMemo(() => {
    return format(selectedDate, "MMMM yyyy");
  }, [selectedDate]);

  const canGoNext = useMemo(() => {
    const nextMonth = format(addMonths(selectedDate, 1), "yyyy-MM");
    const currentMonth = format(new Date(), "yyyy-MM");
    return nextMonth <= currentMonth;
  }, [selectedDate]);

  const canGoPrev = useMemo(() => {
    if (availableMonths.length === 0) return false;
    const prevMonth = format(subMonths(selectedDate, 1), "yyyy-MM");
    return availableMonths.includes(prevMonth);
  }, [selectedDate, availableMonths]);

  // Calculate min/max dates from available months
  const { minDate, maxDate } = useMemo(() => {
    if (availableMonths.length === 0) {
      return { minDate: undefined, maxDate: format(new Date(), "yyyy-MM") };
    }
    // availableMonths are sorted descending
    const max = availableMonths[0];
    const min = availableMonths[availableMonths.length - 1];
    return { minDate: min, maxDate: max };
  }, [availableMonths]);

  const handlePrev = () => {
    const prevMonth = format(subMonths(selectedDate, 1), "yyyy-MM");
    onMonthChange(prevMonth);
  };

  const handleNext = () => {
    const nextMonth = format(addMonths(selectedDate, 1), "yyyy-MM");
    onMonthChange(nextMonth);
  };

  const handleMonthSelect = (month: string) => {
    onMonthChange(month);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={handlePrev}
        disabled={!canGoPrev}
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[160px] h-8 justify-between">
            <span>{displayLabel}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <MonthYearPicker
            value={selectedMonth}
            onChange={handleMonthSelect}
            minDate={minDate}
            maxDate={maxDate}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        onClick={handleNext}
        disabled={!canGoNext}
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Get the default month for reports - the latest completed month
 * If we're in the middle of a month, show the previous month
 * If available months exist and current month isn't complete, use the most recent available
 */
export function getDefaultReportMonth(availableMonths: string[]): string {
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const lastMonth = format(subMonths(now, 1), "yyyy-MM");

  // If we have available months, prefer the latest completed one
  if (availableMonths.length > 0) {
    // Available months are sorted descending, so first is most recent
    const mostRecent = availableMonths[0];
    // If most recent is current month, try to use previous month if available
    if (mostRecent === currentMonth && availableMonths.length > 1) {
      return availableMonths[1];
    }
    return mostRecent;
  }

  // Fallback to last month
  return lastMonth;
}
