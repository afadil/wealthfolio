import { getEventSpendingSummaries } from "@/commands/event";
import { getEventTypes } from "@/commands/event-type";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSettingsContext } from "@/lib/settings-provider";
import { QueryKeys } from "@/lib/query-keys";
import { periodToDateRange, type SpendingPeriod } from "@/lib/navigation/cashflow-navigation";
import type { EventSpendingSummary, EventType } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import {
  AmountDisplay,
  AnimatedToggleGroup,
} from "@wealthfolio/ui";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { EventCategoryTreemap } from "./components/event-category-treemap";
import { EventTimeline } from "./components/event-timeline";
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";

const periods = [
  { value: "YTD" as const, label: "Year to Date" },
  { value: "LAST_YEAR" as const, label: "Last Year" },
  { value: "TOTAL" as const, label: "All Time" },
];

const mobilePeriods = [
  { value: "YTD" as const, label: "YTD" },
  { value: "LAST_YEAR" as const, label: "Last Yr" },
  { value: "TOTAL" as const, label: "All" },
];

const EventsPeriodSelector: React.FC<{
  selectedPeriod: SpendingPeriod;
  onPeriodSelect: (period: SpendingPeriod) => void;
}> = ({ selectedPeriod, onPeriodSelect }) => (
  <>
    <div className="hidden sm:block">
      <AnimatedToggleGroup
        variant="secondary"
        size="sm"
        items={periods}
        value={selectedPeriod}
        onValueChange={onPeriodSelect}
      />
    </div>
    <div className="block sm:hidden">
      <AnimatedToggleGroup
        variant="secondary"
        size="xs"
        items={mobilePeriods}
        value={selectedPeriod}
        onValueChange={onPeriodSelect}
      />
    </div>
  </>
);

interface EventsPageProps {
  renderActions?: (actions: React.ReactNode) => void;
}

export default function EventsPage({ renderActions }: EventsPageProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<SpendingPeriod>("TOTAL");
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set());
  const { isBalanceHidden } = useBalancePrivacy();
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const dateRange = useMemo(() => periodToDateRange(selectedPeriod), [selectedPeriod]);

  const { data: eventTypes = [] } = useQuery<EventType[]>({
    queryKey: [QueryKeys.EVENT_TYPES],
    queryFn: getEventTypes,
  });

  const {
    data: eventSummaries,
    isLoading,
    error,
  } = useQuery<EventSpendingSummary[]>({
    queryKey: [QueryKeys.EVENT_SPENDING_SUMMARIES, selectedPeriod, baseCurrency],
    queryFn: () => getEventSpendingSummaries(
      dateRange.startDate ?? null,
      dateRange.endDate ?? null,
      baseCurrency
    ),
  });

  const toggleEventType = useCallback((eventTypeId: string) => {
    setSelectedEventTypes((prev) => {
      const next = new Set(prev);
      if (next.has(eventTypeId)) {
        next.delete(eventTypeId);
      } else {
        next.add(eventTypeId);
      }
      return next;
    });
  }, []);

  const filteredSummaries = useMemo(() => {
    if (!eventSummaries) return [];
    if (selectedEventTypes.size === 0) return eventSummaries;
    return eventSummaries.filter((s) => selectedEventTypes.has(s.eventTypeId));
  }, [eventSummaries, selectedEventTypes]);

  const totalSpending = useMemo(() => {
    return filteredSummaries.reduce((sum, s) => sum + s.totalSpending, 0);
  }, [filteredSummaries]);

  const totalTransactions = useMemo(() => {
    return filteredSummaries.reduce((sum, s) => sum + s.transactionCount, 0);
  }, [filteredSummaries]);

  const eventTypeChartData = useMemo(() => {
    const typeCounts = new Map<string, { name: string; count: number; color: string | null }>();

    for (const event of filteredSummaries) {
      const existing = typeCounts.get(event.eventTypeId);
      if (existing) {
        existing.count += 1;
      } else {
        typeCounts.set(event.eventTypeId, {
          name: event.eventTypeName,
          count: 1,
          color: event.eventTypeColor,
        });
      }
    }

    return Array.from(typeCounts.values())
      .sort((a, b) => b.count - a.count);
  }, [filteredSummaries]);

  // Memoized period selector to pass to parent
  const periodActions = useMemo(
    () => (
      <EventsPeriodSelector
        selectedPeriod={selectedPeriod}
        onPeriodSelect={setSelectedPeriod}
      />
    ),
    [selectedPeriod],
  );

  // Pass actions to parent component
  useEffect(() => {
    renderActions?.(periodActions);
  }, [renderActions, periodActions]);

  if (isLoading) {
    return <EventsPageSkeleton />;
  }

  if (error) {
    return <div className="p-4">Failed to load events: {error.message}</div>;
  }

  if (!eventSummaries?.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
        <EmptyPlaceholder
          className="mx-auto flex max-w-[420px] items-center justify-center pt-12"
          icon={<Icons.Calendar className="h-10 w-10" />}
          title="No events with spending"
          description="There are no events with spending data for the selected period. Try selecting a different time range or create events and assign transactions to them."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedPeriod === "TOTAL"
                ? "All Time Event Spending"
                : selectedPeriod === "LAST_YEAR"
                  ? "Last Year Event Spending"
                  : "This Year Event Spending"}
            </CardTitle>
            <Icons.CreditCard className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <AmountDisplay
                value={totalSpending}
                currency={baseCurrency}
                isHidden={isBalanceHidden}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Number of Events</CardTitle>
            <Icons.Calendar className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredSummaries.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Number of Transactions</CardTitle>
            <Icons.Receipt className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransactions}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Events by Type</CardTitle>
            <Icons.BarChart className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {eventTypeChartData.length > 0 ? (
              <ChartContainer
                config={{
                  count: { label: "Events" },
                }}
                className="h-[200px] w-full"
              >
                <BarChart
                  data={eventTypeChartData}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 8, bottom: 20 }}
                >
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                    domain={[0, 'auto']}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data.name}</div>
                          <div className="text-muted-foreground text-sm">
                            {data.count} event{data.count !== 1 ? 's' : ''}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {eventTypeChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color || `var(--chart-${(index % 5) + 1})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
                No event type data
              </div>
            )}
          </CardContent>
        </Card>

        <EventCategoryTreemap
          events={filteredSummaries}
          currency={baseCurrency}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Event Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <EventTimeline
            events={eventSummaries}
            eventTypes={eventTypes}
            selectedEventTypes={selectedEventTypes}
            onToggleEventType={toggleEventType}
            periodDateRange={dateRange}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function EventsPageSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 space-y-6 px-4 py-6 md:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[150px]" />
                <Skeleton className="mt-2 h-4 w-[100px]" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
