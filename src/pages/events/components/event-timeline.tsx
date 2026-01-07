import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ViewTransactionsButton } from "@/components/view-transactions-button";
import type { EventSpendingSummary, EventType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PrivacyAmount, ScrollArea } from "@wealthfolio/ui";
import {
  differenceInMonths,
  endOfMonth,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ChevronDown, Filter } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

interface PeriodDateRange {
  startDate?: string;
  endDate?: string;
}

interface EventTimelineProps {
  events: EventSpendingSummary[];
  eventTypes: EventType[];
  selectedEventTypes: Set<string>;
  onToggleEventType: (eventTypeId: string) => void;
  periodDateRange?: PeriodDateRange;
}

interface TimelineEvent extends EventSpendingSummary {
  lane: number;
}

interface MonthMarker {
  date: Date;
  label: string;
  yearLabel?: string;
  index: number;
}

const DEFAULT_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

// Calculate which swim lane an event should be in to avoid overlaps
function assignSwimLanes(events: EventSpendingSummary[]): TimelineEvent[] {
  const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const laneEndDates: string[] = [];

  return sorted.map((event) => {
    let lane = 0;
    for (let i = 0; i < laneEndDates.length; i++) {
      if (event.startDate > laneEndDates[i]) {
        lane = i;
        break;
      }
      lane = i + 1;
    }
    laneEndDates[lane] = event.endDate;
    return { ...event, lane };
  });
}

// Get the range of years that have events
function getEventYearRange(events: EventSpendingSummary[]): { minYear: number; maxYear: number } {
  const currentYear = new Date().getFullYear();

  if (events.length === 0) {
    return { minYear: currentYear, maxYear: currentYear };
  }

  let minYear = currentYear;
  let maxYear = currentYear;

  for (const event of events) {
    const startYear = parseISO(event.startDate).getFullYear();
    const endYear = parseISO(event.endDate).getFullYear();
    if (startYear < minYear) minYear = startYear;
    if (endYear > maxYear) maxYear = endYear;
  }

  return { minYear, maxYear };
}

export function EventTimeline({
  events,
  eventTypes,
  selectedEventTypes,
  onToggleEventType,
  periodDateRange,
}: EventTimelineProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Container width tracking for responsive timeline
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  // Filter events by event type only - period filtering is done by backend
  const filteredEvents = useMemo(() => {
    if (selectedEventTypes.size === 0) return events;
    return events.filter((e) => selectedEventTypes.has(e.eventTypeId));
  }, [events, selectedEventTypes]);

  // Calculate year range - constrained by period date range when specified
  const { minYear, maxYear } = useMemo(() => {
    // If we have a specific period date range, use that to constrain the timeline
    if (periodDateRange?.startDate && periodDateRange?.endDate) {
      const periodStartYear = parseISO(periodDateRange.startDate).getFullYear();
      const periodEndYear = parseISO(periodDateRange.endDate).getFullYear();
      return { minYear: periodStartYear, maxYear: periodEndYear };
    }
    // For "All Time" (no date range), derive from events
    return getEventYearRange(filteredEvents);
  }, [filteredEvents, periodDateRange]);

  // Display mode: year-blocks if events span multiple years, month otherwise
  type TimelineDisplayMode = "month" | "year-blocks";
  const displayMode = useMemo<TimelineDisplayMode>(() => {
    return maxYear - minYear >= 1 ? "year-blocks" : "month";
  }, [minYear, maxYear]);

  // Year columns for year-blocks mode
  interface YearColumn {
    year: number;
    label: string;
    index: number;
  }

  // Calculate the timeline date range and columns based on display mode
  const { rangeStart, rangeEnd, months, yearColumns, totalColumns } = useMemo(() => {
    if (displayMode === "year-blocks") {
      // Year-blocks mode: show all years from minYear to maxYear
      const yearCols: YearColumn[] = [];
      for (let year = minYear; year <= maxYear; year++) {
        yearCols.push({
          year,
          label: String(year),
          index: year - minYear,
        });
      }
      return {
        rangeStart: new Date(minYear, 0, 1),
        rangeEnd: new Date(maxYear, 11, 31),
        months: [] as MonthMarker[],
        yearColumns: yearCols,
        totalColumns: yearCols.length,
      };
    }

    // Month mode: show 12 months for the year of events (minYear = maxYear in this mode)
    const displayYear = minYear;
    const rangeStartDate = new Date(displayYear, 0, 1);
    const rangeEndDate = new Date(displayYear, 11, 31);

    const monthMarkers: MonthMarker[] = [];
    for (let month = 0; month < 12; month++) {
      const date = new Date(displayYear, month, 1);
      monthMarkers.push({
        date,
        label: format(date, "MMM"),
        yearLabel: month === 0 ? String(displayYear) : undefined,
        index: month,
      });
    }

    return {
      rangeStart: startOfMonth(rangeStartDate),
      rangeEnd: endOfMonth(rangeEndDate),
      months: monthMarkers,
      yearColumns: [] as YearColumn[],
      totalColumns: 12,
    };
  }, [displayMode, minYear, maxYear]);

  // Calculate column width based on container and mode
  const columnWidth = useMemo(() => {
    if (containerWidth === 0 || totalColumns === 0) return 80;
    const calculatedWidth = containerWidth / totalColumns;
    // Minimum width depends on mode: 60px for months, 80px for years
    const minWidth = displayMode === "year-blocks" ? 80 : 60;
    return Math.max(calculatedWidth, minWidth);
  }, [containerWidth, totalColumns, displayMode]);

  // Assign swim lanes to events
  const timedEvents = useMemo(() => assignSwimLanes(filteredEvents), [filteredEvents]);

  // Calculate max lanes for height
  const maxLane = useMemo(() => {
    return timedEvents.reduce((max, e) => Math.max(max, e.lane), 0);
  }, [timedEvents]);

  // Calculate event positions using pixels, aligned with columns (months or years)
  const positionedEvents = useMemo(() => {
    return timedEvents.map((event) => {
      const eventStart = parseISO(event.startDate);
      const eventEnd = parseISO(event.endDate);

      // Clamp event dates to timeline range
      const clampedStart = isBefore(eventStart, rangeStart) ? rangeStart : eventStart;
      const clampedEnd = isAfter(eventEnd, rangeEnd) ? rangeEnd : eventEnd;

      let leftPx: number;
      let rightPx: number;

      if (displayMode === "year-blocks") {
        // Year-blocks mode: position based on year
        const startYear = clampedStart.getFullYear();
        const endYear = clampedEnd.getFullYear();

        // Calculate fraction within the year (0-1)
        const startDayOfYear = Math.floor(
          (clampedStart.getTime() - new Date(startYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24),
        );
        const daysInStartYear = startYear % 4 === 0 ? 366 : 365;
        const startFraction = startDayOfYear / daysInStartYear;

        const endDayOfYear = Math.floor(
          (clampedEnd.getTime() - new Date(endYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24),
        );
        const daysInEndYear = endYear % 4 === 0 ? 366 : 365;
        const endFraction = (endDayOfYear + 1) / daysInEndYear;

        leftPx = (startYear - minYear + startFraction) * columnWidth;
        rightPx = (endYear - minYear + endFraction) * columnWidth;
      } else {
        // Month mode: position based on month
        const startMonthOffset = differenceInMonths(startOfMonth(clampedStart), rangeStart);
        const daysInStartMonth = getDaysInMonth(clampedStart);
        const startDayFraction = (clampedStart.getDate() - 1) / daysInStartMonth;

        const endMonthOffset = differenceInMonths(startOfMonth(clampedEnd), rangeStart);
        const daysInEndMonth = getDaysInMonth(clampedEnd);
        const endDayFraction = clampedEnd.getDate() / daysInEndMonth;

        leftPx = (startMonthOffset + startDayFraction) * columnWidth;
        rightPx = (endMonthOffset + endDayFraction) * columnWidth;
      }

      const widthPx = Math.max(rightPx - leftPx, 20); // Minimum 20px width

      // Determine if bar is too narrow to show text
      const isNarrow = widthPx < 100;

      return {
        ...event,
        leftPx,
        widthPx,
        isNarrow,
      };
    });
  }, [timedEvents, rangeStart, rangeEnd, columnWidth, displayMode, minYear]);

  // Get selected event details
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return filteredEvents.find((e) => e.eventId === selectedEventId) || null;
  }, [selectedEventId, filteredEvents]);

  // Prepare chart data for selected event
  // For pie chart, we show absolute spending values (withdrawals add, deposits shown separately or as reduction)
  const categoryChartData = useMemo(() => {
    if (!selectedEvent) return [];
    return Object.values(selectedEvent.byCategory)
      .filter((cat) => cat.amount > 0) // Only show categories with net positive spending
      .sort((a, b) => b.amount - a.amount)
      .map((cat, index) => ({
        name: cat.categoryName,
        value: cat.amount,
        fill: cat.color || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
      }));
  }, [selectedEvent]);

  // Convert daily spending to cumulative for the line chart
  const spendingTimelineData = useMemo(() => {
    if (!selectedEvent || !selectedEvent.dailySpending) return [];
    const sortedEntries = Object.entries(selectedEvent.dailySpending).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    let cumulative = 0;
    return sortedEntries.map(([date, amount]) => {
      cumulative += amount;
      return {
        date,
        dateLabel: format(parseISO(date), "MMM d"),
        amount: cumulative,
      };
    });
  }, [selectedEvent]);

  const handleEventClick = (eventId: string) => {
    const newSelection = selectedEventId === eventId ? null : eventId;
    setSelectedEventId(newSelection);
    // On mobile, open the bottom sheet when selecting an event
    if (isMobile && newSelection) {
      setIsMobileDetailsOpen(true);
    }
  };

  const laneHeight = 44;
  const headerHeight = 48;
  const timelineHeight = Math.max((maxLane + 1) * laneHeight + 16, 100);
  const totalWidth = totalColumns * columnWidth;

  if (filteredEvents.length === 0) {
    return (
      <div className="text-muted-foreground flex h-24 items-center justify-center text-sm">
        No events to display for this period
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                {selectedEventTypes.size === 0
                  ? "All Types"
                  : `${selectedEventTypes.size} Selected`}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {eventTypes.map((type) => (
                <DropdownMenuCheckboxItem
                  key={type.id}
                  checked={selectedEventTypes.has(type.id)}
                  onCheckedChange={() => onToggleEventType(type.id)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: type.color || "var(--chart-1)" }}
                    />
                    {type.name}
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="block space-y-3 md:hidden">
          {filteredEvents
            .slice()
            .sort((a, b) => b.startDate.localeCompare(a.startDate))
            .map((event) => {
              const isSelected = selectedEventId === event.eventId;
              return (
                <div
                  key={event.eventId}
                  onClick={() => handleEventClick(event.eventId)}
                  className={cn(
                    "cursor-pointer rounded-lg border p-3 transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: event.eventTypeColor || "var(--chart-1)" }}
                      />
                      <span className="truncate text-sm font-medium">{event.eventName}</span>
                    </div>
                    <span className="text-foreground ml-2 shrink-0 text-sm font-semibold">
                      <PrivacyAmount value={event.totalSpending} currency={event.currency} />
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {event.eventTypeName} · {format(parseISO(event.startDate), "MMM d")} -{" "}
                    {format(parseISO(event.endDate), "MMM d, yyyy")}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {event.transactionCount} transactions
                  </div>
                </div>
              );
            })}
        </div>

        <div
          ref={containerRef}
          className="relative hidden overflow-hidden rounded-lg border md:block"
        >
          <div>
            <div
              className="relative"
              style={{
                width: `${Math.max(totalWidth, 100)}px`,
                minWidth: "100%",
                height: `${headerHeight + timelineHeight}px`,
              }}
            >
              <div
                className="bg-muted/50 sticky top-0 z-20 flex border-b backdrop-blur-sm"
                style={{ height: `${headerHeight}px` }}
              >
                {displayMode === "year-blocks"
                  ? yearColumns.map((year) => (
                      <div
                        key={year.index}
                        className="flex flex-col items-center justify-center border-r text-xs"
                        style={{ width: `${columnWidth}px`, flexShrink: 0 }}
                      >
                        <span className="text-foreground text-sm font-semibold">{year.label}</span>
                      </div>
                    ))
                  : months.map((month) => (
                      <div
                        key={month.index}
                        className="flex flex-col items-center justify-center border-r text-xs"
                        style={{ width: `${columnWidth}px`, flexShrink: 0 }}
                      >
                        {month.yearLabel && (
                          <span className="text-foreground text-[10px] font-semibold">
                            {month.yearLabel}
                          </span>
                        )}
                        <span className="text-muted-foreground">{month.label}</span>
                      </div>
                    ))}
              </div>

              <div
                className="pointer-events-none absolute inset-0 flex"
                style={{ top: `${headerHeight}px` }}
              >
                {displayMode === "year-blocks"
                  ? yearColumns.map((year) => (
                      <div
                        key={`grid-${year.index}`}
                        className="border-muted/50 h-full border-r border-dashed"
                        style={{ width: `${columnWidth}px`, flexShrink: 0 }}
                      />
                    ))
                  : months.map((month) => (
                      <div
                        key={`grid-${month.index}`}
                        className="border-muted/50 h-full border-r border-dashed"
                        style={{ width: `${columnWidth}px`, flexShrink: 0 }}
                      />
                    ))}
              </div>

              <div
                className="absolute inset-x-0"
                style={{
                  top: `${headerHeight + 8}px`,
                  height: `${timelineHeight - 16}px`,
                }}
              >
                {positionedEvents.map((event) => {
                  const color = event.eventTypeColor || "hsl(var(--chart-1))";
                  const isSelected = selectedEventId === event.eventId;

                  const barContent = (
                    <button
                      key={event.eventId}
                      onClick={() => handleEventClick(event.eventId)}
                      className={cn(
                        "absolute flex cursor-pointer items-center gap-1 rounded-md border transition-all",
                        "hover:z-30 hover:shadow-lg",
                        isSelected ? "ring-primary z-30 shadow-lg ring-2" : "z-10",
                      )}
                      style={{
                        left: `${event.leftPx}px`,
                        width: `${event.widthPx}px`,
                        top: `${event.lane * laneHeight}px`,
                        height: `${laneHeight - 8}px`,
                        backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
                        borderColor: color,
                      }}
                    >
                      <div
                        className="absolute top-0 bottom-0 left-0 w-1 rounded-l-md"
                        style={{ backgroundColor: color }}
                      />

                      {!event.isNarrow && (
                        <div className="flex min-w-0 flex-1 items-center justify-between overflow-hidden pr-1 pl-2">
                          <div className="flex min-w-0 flex-col items-start overflow-hidden">
                            <span className="max-w-full truncate text-xs font-medium">
                              {event.eventName}
                            </span>
                            <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                              {format(parseISO(event.startDate), "MMM d, yyyy")} -{" "}
                              {format(parseISO(event.endDate), "MMM d, yyyy")}
                            </span>
                          </div>
                          <span className="text-foreground ml-1 text-xs font-medium whitespace-nowrap">
                            <PrivacyAmount value={event.totalSpending} currency={event.currency} />
                          </span>
                        </div>
                      )}
                    </button>
                  );

                  // Wrap narrow bars in tooltip
                  if (event.isNarrow) {
                    return (
                      <Tooltip key={event.eventId}>
                        <TooltipTrigger asChild>{barContent}</TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <div className="font-medium">{event.eventName}</div>
                            <div className="text-muted-foreground text-xs">
                              {format(parseISO(event.startDate), "MMM d, yyyy")} -{" "}
                              {format(parseISO(event.endDate), "MMM d, yyyy")}
                            </div>
                            <div className="text-foreground text-xs">
                              <PrivacyAmount
                                value={event.totalSpending}
                                currency={event.currency}
                              />
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return barContent;
                })}
              </div>
            </div>
          </div>
        </div>

        {selectedEvent && !isMobile && (
          <div className="bg-muted/30 hidden space-y-6 rounded-lg border p-4 md:block">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{
                      backgroundColor: selectedEvent.eventTypeColor || "var(--chart-1)",
                    }}
                  />
                  <h3 className="text-lg font-semibold">{selectedEvent.eventName}</h3>
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">
                    {selectedEvent.eventTypeName}
                  </span>
                  <span>&middot;</span>
                  <span>
                    {format(parseISO(selectedEvent.startDate), "MMM d, yyyy")} -{" "}
                    {format(parseISO(selectedEvent.endDate), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-foreground text-2xl font-bold ${selectedEvent?.totalSpending < 0 ? "text-green-600" : "text-red-600"}`}
                >
                  <PrivacyAmount
                    value={selectedEvent.totalSpending}
                    currency={selectedEvent.currency}
                  />
                </div>
                <p className="text-muted-foreground text-sm">
                  {selectedEvent.transactionCount} transactions
                </p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {categoryChartData.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-muted-foreground text-sm font-medium">
                    Spending by Category
                  </h4>
                  <div className="flex items-center gap-4">
                    <ChartContainer config={{}} className="h-[160px] w-[160px]">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie
                          data={categoryChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="max-h-[160px] flex-1 space-y-1 overflow-y-auto">
                      {categoryChartData.slice(0, 6).map((cat, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: cat.fill }}
                            />
                            <span className="text-muted-foreground truncate">{cat.name}</span>
                          </div>
                          <span className="text-foreground ml-2 shrink-0 font-medium">
                            <PrivacyAmount value={cat.value} currency={selectedEvent.currency} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {spendingTimelineData.length > 1 && (
                <div className="space-y-2">
                  <h4 className="text-muted-foreground text-sm font-medium">Spending Over Time</h4>
                  <ChartContainer
                    config={{
                      amount: {
                        label: "Spending",
                        color: selectedEvent.eventTypeColor || "var(--chart-1)",
                      },
                    }}
                    className="h-[160px] w-full"
                  >
                    <AreaChart data={spendingTimelineData}>
                      <defs>
                        <linearGradient
                          id={`gradient-${selectedEvent.eventId}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={selectedEvent.eventTypeColor || "var(--chart-1)"}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={selectedEvent.eventTypeColor || "var(--chart-1)"}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="dateLabel"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${value}`}
                        width={50}
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background rounded-lg border p-2 shadow-sm">
                                <div className="text-muted-foreground text-xs">
                                  {payload[0].payload.dateLabel}
                                </div>
                                <div
                                  className="text-sm font-medium"
                                  style={{
                                    color: selectedEvent.eventTypeColor || "var(--chart-1)",
                                  }}
                                >
                                  <PrivacyAmount
                                    value={payload[0].value as number}
                                    currency={selectedEvent.currency}
                                  />
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke={selectedEvent.eventTypeColor || "var(--chart-1)"}
                        strokeWidth={2}
                        fill={`url(#gradient-${selectedEvent.eventId})`}
                      />
                    </AreaChart>
                  </ChartContainer>
                </div>
              )}
            </div>

            {categoryChartData.length === 0 && Object.keys(selectedEvent.byCategory).length > 0 && (
              <div>
                <h4 className="text-muted-foreground mb-2 text-sm font-medium">
                  Spending by Category
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.values(selectedEvent.byCategory)
                    .sort((a, b) => b.amount - a.amount)
                    .map((cat) => (
                      <div
                        key={cat.categoryId || "uncategorized"}
                        className="bg-background flex items-center justify-between rounded px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: cat.color || "var(--chart-1)" }}
                          />
                          <span className="text-muted-foreground">{cat.categoryName}</span>
                        </div>
                        <span className="text-foreground font-medium">
                          <PrivacyAmount value={cat.amount} currency={selectedEvent.currency} />
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <ViewTransactionsButton eventId={selectedEvent.eventId} className="w-full gap-2" />
          </div>
        )}

        <Sheet open={isMobileDetailsOpen && isMobile} onOpenChange={setIsMobileDetailsOpen}>
          <SheetContent side="bottom" className="mx-1 flex h-[75vh] flex-col rounded-t-4xl">
            {selectedEvent && (
              <>
                <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: selectedEvent.eventTypeColor || "var(--chart-1)" }}
                    />
                    <span className="truncate">{selectedEvent.eventName}</span>
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="flex-1 py-4">
                  <div className="space-y-4 pr-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Total Spending</span>
                      <span className={`text-foreground text-lg font-bold ${selectedEvent?.totalSpending < 0 ? "text-green-600" : "text-red-600"}`}>
                        <PrivacyAmount
                          value={selectedEvent.totalSpending}
                          currency={selectedEvent.currency}
                        />
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Date Range</span>
                      <span className="text-sm">
                        {format(parseISO(selectedEvent.startDate), "MMM d")} -{" "}
                        {format(parseISO(selectedEvent.endDate), "MMM d, yyyy")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Type</span>
                      <span className="text-sm">{selectedEvent.eventTypeName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Transactions</span>
                      <span className="text-sm">{selectedEvent.transactionCount}</span>
                    </div>

                    {categoryChartData.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="mb-3 text-sm font-medium">Spending by Category</h4>
                        <div className="space-y-4">
                          <div className="flex justify-center">
                            <ChartContainer config={{}} className="h-[140px] w-[140px]">
                              <PieChart>
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Pie
                                  data={categoryChartData}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={35}
                                  outerRadius={60}
                                  paddingAngle={2}
                                >
                                  {categoryChartData.map((entry, index) => (
                                    <Cell key={`cell-mobile-${index}`} fill={entry.fill} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ChartContainer>
                          </div>
                          <div className="space-y-2">
                            {categoryChartData.slice(0, 5).map((cat, index) => (
                              <div key={index} className="flex items-center justify-between">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <div
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: cat.fill }}
                                  />
                                  <span className="text-muted-foreground truncate text-sm">
                                    {cat.name}
                                  </span>
                                </div>
                                <span className="text-foreground ml-4 text-sm font-medium">
                                  <PrivacyAmount
                                    value={cat.value}
                                    currency={selectedEvent.currency}
                                  />
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {spendingTimelineData.length > 1 && (
                      <div className="border-t pt-4">
                        <h4 className="mb-3 text-sm font-medium">Spending Over Time</h4>
                        <ChartContainer
                          config={{
                            amount: {
                              label: "Spending",
                              color: selectedEvent.eventTypeColor || "var(--chart-1)",
                            },
                          }}
                          className="h-[140px] w-full"
                        >
                          <AreaChart
                            data={spendingTimelineData}
                            margin={{ left: 0, right: 4, top: 8, bottom: 4 }}
                          >
                            <defs>
                              <linearGradient
                                id={`gradient-mobile-${selectedEvent.eventId}`}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor={selectedEvent.eventTypeColor || "var(--chart-1)"}
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="95%"
                                  stopColor={selectedEvent.eventTypeColor || "var(--chart-1)"}
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <XAxis
                              dataKey="dateLabel"
                              tick={{ fontSize: 9 }}
                              tickLine={false}
                              axisLine={false}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tick={{ fontSize: 9 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => `$${value}`}
                              width={50}
                            />
                            <ChartTooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-background rounded-lg border p-2 shadow-sm">
                                      <div className="text-muted-foreground text-xs">
                                        {payload[0].payload.dateLabel}
                                      </div>
                                      <div
                                        className="text-sm font-medium"
                                        style={{
                                          color: selectedEvent.eventTypeColor || "var(--chart-1)",
                                        }}
                                      >
                                        <PrivacyAmount
                                          value={payload[0].value as number}
                                          currency={selectedEvent.currency}
                                        />
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="amount"
                              stroke={selectedEvent.eventTypeColor || "var(--chart-1)"}
                              strokeWidth={2}
                              fill={`url(#gradient-mobile-${selectedEvent.eventId})`}
                            />
                          </AreaChart>
                        </ChartContainer>
                      </div>
                    )}

                    <ViewTransactionsButton
                      eventId={selectedEvent.eventId}
                      className="mt-4 w-full gap-2"
                      onBeforeNavigate={() => setIsMobileDetailsOpen(false)}
                    />
                  </div>
                </ScrollArea>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
