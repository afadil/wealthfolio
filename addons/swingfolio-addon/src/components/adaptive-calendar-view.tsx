import { Button, Icons, GainAmount } from "@wealthfolio/ui";
import type { CalendarMonth, CalendarDay } from "../types";
import {
  format,
  addYears,
  subYears,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from "date-fns";
import { cn } from "../lib/utils";

function formatCompactAmount(value: number) {
  const sign = value >= 0 ? "+" : "";
  return (
    sign +
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  );
}

interface AdaptiveCalendarViewProps {
  calendar: CalendarMonth[];
  selectedPeriod: "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
  selectedYear: Date;
  onYearChange: (date: Date) => void;
  currency: string;
}

type CalendarViewType = "daily" | "yearly";

/**
 * Adaptive calendar that shows different granularity based on selected period:
 * - 1M: Daily calendar for current month
 * - 3M, 6M, YTD, 1Y, ALL: Yearly calendar for selected year
 */
export function AdaptiveCalendarView({
  calendar,
  selectedPeriod,
  selectedYear,
  onYearChange,
  currency,
}: AdaptiveCalendarViewProps) {
  // Determine view type based on selected period
  const getViewType = (): CalendarViewType => {
    switch (selectedPeriod) {
      case "1M":
        return "daily";
      default:
        return "yearly"; // 3M, 6M, YTD, 1Y, ALL all use yearly calendar
    }
  };

  const viewType = getViewType();

  // Get appropriate title based on view type (for future use)

  if (viewType === "daily") {
    return (
      <DailyCalendarView
        calendar={calendar}
        selectedYear={selectedYear}
        onYearChange={onYearChange}
        currency={currency}
      />
    );
  }

  // Default to yearly view for all other periods (3M, 6M, YTD, 1Y, ALL)
  return (
    <YearlyCalendarView
      calendar={calendar}
      selectedYear={selectedYear}
      onYearChange={onYearChange}
      currency={currency}
    />
  );
}

/**
 * Daily calendar view for 1M period
 */
function DailyCalendarView({
  calendar,
  selectedYear,
  onYearChange,
  currency,
}: Omit<AdaptiveCalendarViewProps, "selectedPeriod">) {
  const currentMonth = selectedYear.getMonth();
  const currentYear = selectedYear.getFullYear();

  // Get current month data
  const monthData = calendar.find(
    (cal) => cal.year === currentYear && cal.month === currentMonth + 1,
  );

  // Generate calendar grid including leading/trailing days from adjacent months
  const monthStart = startOfMonth(selectedYear);
  const monthEnd = endOfMonth(selectedYear);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Create a map for quick lookup of trading data
  const tradingDataMap = new Map<string, CalendarDay>();
  if (monthData) {
    monthData.days.forEach((day) => {
      tradingDataMap.set(day.date, day);
    });
  }

  const monthlyPL = monthData?.monthlyPL || 0;
  const monthlyTrades = monthData?.totalTrades || 0;

  const getDayColor = (day: CalendarDay | undefined, date: Date): string => {
    if (!day || day.tradeCount === 0) {
      return isToday(date) ? "bg-primary/10" : "bg-muted/5";
    }

    if (day.realizedPL > 0) {
      return "bg-success/20 hover:bg-success/30";
    } else {
      return "bg-destructive/20 hover:bg-destructive/30";
    }
  };

  const handlePreviousMonth = () => {
    onYearChange(subMonths(selectedYear, 1));
  };

  const handleNextMonth = () => {
    onYearChange(addMonths(selectedYear, 1));
  };

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2 sm:mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold sm:text-base">Daily Calendar</h3>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <span>{monthlyTrades} trades</span>
            <span>·</span>
            <GainAmount value={monthlyPL} currency={currency} className="text-xs" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousMonth}
            className="rounded-full"
          >
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs font-medium sm:px-3 sm:text-sm">
            {format(selectedYear, "MMM yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={handleNextMonth} className="rounded-full">
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="pt-2 sm:p-4">
        <div className="flex w-full justify-center">
          <div className="w-full max-w-2xl">
            <table className="border-border/50 w-full table-fixed border-collapse overflow-hidden rounded-lg border">
              {/* Header row */}
              <thead>
                <tr className="border-border/50 border-b">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
                    <th
                      key={day}
                      className={cn(
                        "text-muted-foreground bg-muted/20 w-[14.28%] py-2 text-center text-xs font-medium",
                        index < 6 && "border-border/50 border-r",
                      )}
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Calendar body */}
              <tbody>
                {/* Generate rows of 7 days each */}
                {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIndex) => (
                  <tr
                    key={weekIndex}
                    className={cn(
                      weekIndex < Math.ceil(calendarDays.length / 7) - 1 &&
                        "border-border/50 border-b",
                    )}
                  >
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const dayArrayIndex = weekIndex * 7 + dayIndex;
                      const date = calendarDays[dayArrayIndex];

                      if (!date) {
                        return (
                          <td
                            key={dayIndex}
                            className={cn(
                              "bg-background h-14 w-[14.28%] p-0 align-top sm:h-20",
                              dayIndex < 6 && "border-border/50 border-r",
                            )}
                          ></td>
                        );
                      }

                      const dateStr = format(date, "yyyy-MM-dd");
                      const dayData = tradingDataMap.get(dateStr);
                      const isCurrentDay = isToday(date);
                      const isCurrentMonthDay = isSameMonth(date, selectedYear);

                      return (
                        <td
                          key={dayIndex}
                          className={cn(
                            "relative h-14 w-[14.28%] p-0 align-top sm:h-20",
                            dayIndex < 6 && "border-border/50 border-r",
                          )}
                        >
                          <div
                            className={cn(
                              "absolute inset-0 flex flex-col items-center justify-start p-2 text-xs transition-all duration-200",
                              isCurrentMonthDay ? getDayColor(dayData, date) : "bg-muted/10",
                              isCurrentDay && "ring-primary/60 ring-2 ring-inset",
                              !isCurrentMonthDay && "opacity-50",
                            )}
                          >
                            {/* Day number */}
                            <div
                              className={cn(
                                "mb-1 text-xs font-medium",
                                isCurrentDay && "text-primary font-bold",
                                !isCurrentMonthDay && "text-muted-foreground/50",
                              )}
                            >
                              {format(date, "d")}
                            </div>

                            {/* Trading data - only show for current month */}
                            {isCurrentMonthDay && dayData && dayData.tradeCount > 0 ? (
                              <div className="flex flex-col items-center space-y-0.5 text-center">
                                <span
                                  className={cn(
                                    "text-[10px] font-medium leading-tight",
                                    dayData.realizedPL >= 0 ? "text-success" : "text-destructive",
                                  )}
                                >
                                  {formatCompactAmount(dayData.realizedPL)}
                                </span>
                                <div className="text-muted-foreground text-[9px] leading-tight">
                                  {dayData.tradeCount}
                                </div>
                              </div>
                            ) : isCurrentMonthDay && isCurrentDay ? (
                              <div className="text-muted-foreground/50 text-[10px]">•</div>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Yearly calendar view for longer periods
 */
function YearlyCalendarView({
  calendar,
  selectedYear,
  onYearChange,
  currency,
}: Omit<AdaptiveCalendarViewProps, "selectedPeriod">) {
  // Build 12 months for the selected year, using calendar data when available
  const year = selectedYear.getFullYear();
  const calendarMap = new Map(
    calendar.filter((cal) => cal.year === year).map((cal) => [cal.month, cal]),
  );
  const yearlyData: CalendarMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return (
      calendarMap.get(month) ?? {
        year,
        month,
        monthlyPL: 0,
        monthlyReturnPercent: 0,
        totalTrades: 0,
        days: [],
      }
    );
  });

  const yearlyPL = yearlyData.reduce((sum, month) => sum + month.monthlyPL, 0);
  const yearlyTrades = yearlyData.reduce((sum, month) => sum + month.totalTrades, 0);

  const getMonthColor = (month: CalendarMonth): string => {
    if (month.totalTrades === 0) return "bg-muted/10";

    if (month.monthlyPL > 0) {
      return "bg-success/20 hover:bg-success/30";
    } else {
      return "bg-destructive/20 hover:bg-destructive/30";
    }
  };

  const handlePreviousYear = () => {
    onYearChange(subYears(selectedYear, 1));
  };

  const handleNextYear = () => {
    onYearChange(addYears(selectedYear, 1));
  };

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2 sm:mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold sm:text-base">Yearly Calendar</h3>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <span>{yearlyTrades} trades</span>
            <span>·</span>
            <GainAmount value={yearlyPL} currency={currency} className="text-xs" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={handlePreviousYear} className="rounded-full">
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs font-medium sm:px-3 sm:text-sm">
            {format(selectedYear, "yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={handleNextYear} className="rounded-full">
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="pt-2 sm:p-4">
        <div className="flex w-full justify-center">
          <div className="w-full max-w-2xl">
            <table className="border-border/50 w-full table-fixed border-collapse overflow-hidden rounded-lg border">
              <tbody>
                {/* Generate rows of 3 months each */}
                {Array.from({ length: Math.ceil(yearlyData.length / 3) }, (_, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={cn(
                      rowIndex < Math.ceil(yearlyData.length / 3) - 1 &&
                        "border-border/50 border-b",
                    )}
                  >
                    {Array.from({ length: 3 }, (_, colIndex) => {
                      const monthIndex = rowIndex * 3 + colIndex;
                      const month = yearlyData[monthIndex];

                      if (!month) {
                        return (
                          <td
                            key={colIndex}
                            className={cn(
                              "h-24 w-[33.33%] p-0 align-top sm:h-32",
                              colIndex < 2 && "border-border/50 border-r",
                            )}
                          ></td>
                        );
                      }

                      const monthNames = [
                        "Jan",
                        "Feb",
                        "Mar",
                        "Apr",
                        "May",
                        "Jun",
                        "Jul",
                        "Aug",
                        "Sep",
                        "Oct",
                        "Nov",
                        "Dec",
                      ];
                      const isCurrentMonth =
                        new Date().getMonth() + 1 === month.month &&
                        new Date().getFullYear() === month.year;

                      return (
                        <td
                          key={colIndex}
                          className={cn(
                            "relative h-24 w-[33.33%] p-0 align-top sm:h-32",
                            colIndex < 2 && "border-border/50 border-r",
                          )}
                        >
                          <div
                            className={cn(
                              "absolute inset-0 flex cursor-pointer flex-col items-center justify-center p-4 text-xs transition-all duration-200",
                              getMonthColor(month),
                              isCurrentMonth && "ring-primary/40 ring-2 ring-inset",
                              month.totalTrades === 0 && "cursor-default",
                            )}
                          >
                            {/* Month Name */}
                            <div className="mb-2 text-center text-sm font-semibold">
                              {monthNames[month.month - 1]}
                            </div>

                            {/* P/L and Trade Count */}
                            <div className="space-y-1 text-center">
                              {month.totalTrades > 0 ? (
                                <>
                                  <GainAmount value={month.monthlyPL} currency={currency} />
                                  <div className="text-muted-foreground text-xs">
                                    {month.totalTrades} trade{month.totalTrades !== 1 ? "s" : ""}
                                  </div>
                                </>
                              ) : (
                                <div className="text-muted-foreground/60 text-xs">No trades</div>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
