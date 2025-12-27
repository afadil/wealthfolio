import { getIncomeSummary, getSpendingSummary } from "@/commands/portfolio";
import { getTopSpendingTransactions } from "@/commands/activity";
import { getEventsWithNames } from "@/commands/event";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { useSettingsContext } from "@/lib/settings-provider";
import { QueryKeys } from "@/lib/query-keys";
import type { IncomeSummary, SpendingSummary, ActivityDetails, EventWithTypeName } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AmountDisplay, formatPercent } from "@wealthfolio/ui";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { format, subMonths } from "date-fns";
import { Link } from "react-router-dom";
import { MonthSwitcher, getDefaultReportMonth } from "./components/month-switcher";
import { SpendingTrendsChart } from "./components/spending-trends-chart";
import { CategoryBreakdownPanel } from "./components/category-breakdown-panel";
import { MonthMetricsPanel } from "./components/month-metrics-panel";
import { NotableChangesPanel } from "./components/notable-changes-panel";
import { LargestTransactionsPanel } from "./components/largest-transactions-panel";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { DataTableFacetedFilter } from "@/pages/activity/components/activity-datagrid/data-table-faceted-filter";

const INCLUDE_ALL_EVENTS_VALUE = "__include_all_events__";

interface MonthAnalysisPageProps {
  renderActions?: (actions: React.ReactNode) => void;
}

export default function MonthAnalysisPage({ renderActions }: MonthAnalysisPageProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [selectedEventValues, setSelectedEventValues] = useState<Set<string>>(new Set());
  const { isBalanceHidden } = useBalancePrivacy();
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  // Fetch events for filter
  const { data: events = [] } = useQuery<EventWithTypeName[], Error>({
    queryKey: [QueryKeys.EVENTS_WITH_NAMES],
    queryFn: getEventsWithNames,
  });

  // Derive event filter params from selection
  const includeAllEvents = selectedEventValues.has(INCLUDE_ALL_EVENTS_VALUE);
  const includeEventIds = useMemo(() => {
    const ids: string[] = [];
    selectedEventValues.forEach((v) => {
      if (v !== INCLUDE_ALL_EVENTS_VALUE) {
        ids.push(v);
      }
    });
    return ids.length > 0 ? ids : undefined;
  }, [selectedEventValues]);

  const handleEventFilterChange = useCallback((values: Set<string>) => {
    const wasIncludeAll = selectedEventValues.has(INCLUDE_ALL_EVENTS_VALUE);
    const isIncludeAll = values.has(INCLUDE_ALL_EVENTS_VALUE);

    if (isIncludeAll && !wasIncludeAll) {
      setSelectedEventValues(new Set([INCLUDE_ALL_EVENTS_VALUE]));
    } else if (isIncludeAll && values.size > 1) {
      const newValues = new Set(values);
      newValues.delete(INCLUDE_ALL_EVENTS_VALUE);
      setSelectedEventValues(newValues);
    } else {
      setSelectedEventValues(values);
    }
  }, [selectedEventValues]);

  const eventOptions = useMemo(() => {
    const eventsAsOptions = events.map((event) => ({
      value: event.id,
      label: event.name,
    }));
    return [{ value: INCLUDE_ALL_EVENTS_VALUE, label: "Include All Events" }, ...eventsAsOptions];
  }, [events]);

  const { data: spendingData, isLoading: isSpendingLoading } = useQuery<SpendingSummary[]>({
    queryKey: [QueryKeys.SPENDING_SUMMARY, includeEventIds, includeAllEvents],
    queryFn: () => getSpendingSummary(includeEventIds, includeAllEvents),
  });

  const { data: incomeData, isLoading: isIncomeLoading } = useQuery<IncomeSummary[]>({
    queryKey: [QueryKeys.INCOME_SUMMARY, includeEventIds, includeAllEvents],
    queryFn: () => getIncomeSummary(includeEventIds, includeAllEvents),
  });

  // Fetch top 5 spending transactions from backend (with event filter)
  const { data: topTransactions, isLoading: isTransactionsLoading } = useQuery<ActivityDetails[]>({
    queryKey: ["top-spending-transactions", selectedMonth, includeEventIds, includeAllEvents],
    queryFn: () => getTopSpendingTransactions(
      selectedMonth!,
      5,
      includeAllEvents ? undefined : includeEventIds,
      includeAllEvents
    ),
    enabled: !!selectedMonth,
  });

  const totalSummary = useMemo(() => {
    return spendingData?.find((s) => s.period === "TOTAL");
  }, [spendingData]);

  const totalIncomeSummary = useMemo(() => {
    return incomeData?.find((s) => s.period === "TOTAL");
  }, [incomeData]);

  const monthData = useMemo(() => {
    if (!totalSummary || !totalIncomeSummary || !selectedMonth) return null;

    const spending = totalSummary.byMonth[selectedMonth] || 0;
    const income = totalIncomeSummary.byMonth[selectedMonth] || 0;
    const netSavings = income - spending;
    const savingsRate = income > 0 ? (netSavings / income) * 100 : 0;

    const prevMonth = format(subMonths(new Date(selectedMonth + "-01"), 1), "yyyy-MM");
    const prevSpending = totalSummary.byMonth[prevMonth] || 0;
    const prevIncome = totalIncomeSummary.byMonth[prevMonth] || 0;

    const spendingChange =
      prevSpending > 0 ? ((spending - prevSpending) / prevSpending) * 100 : null;
    const incomeChange = prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : null;

    return {
      spending,
      income,
      netSavings,
      savingsRate,
      spendingChange,
      incomeChange,
    };
  }, [totalSummary, totalIncomeSummary, selectedMonth]);

  const availableMonths = useMemo(() => {
    if (!totalSummary?.byMonth) return [];
    return Object.keys(totalSummary.byMonth).sort().reverse();
  }, [totalSummary]);

  // Initialize selected month to latest completed month once data is loaded
  useEffect(() => {
    if (!hasInitialized && availableMonths.length > 0) {
      const defaultMonth = getDefaultReportMonth(availableMonths);
      setSelectedMonth(defaultMonth);
      setHasInitialized(true);
    }
  }, [availableMonths, hasInitialized]);

  const monthActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {events.length > 0 && (
          <DataTableFacetedFilter
            title="Events"
            options={eventOptions}
            selectedValues={selectedEventValues}
            onFilterChange={handleEventFilterChange}
          />
        )}
        {selectedMonth && (
          <MonthSwitcher
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            availableMonths={availableMonths}
          />
        )}
      </div>
    ),
    [selectedMonth, availableMonths, events, eventOptions, selectedEventValues, handleEventFilterChange],
  );

  useEffect(() => {
    renderActions?.(monthActions);
  }, [renderActions, monthActions]);

  const isLoading = isSpendingLoading || isIncomeLoading;

  if (isLoading) {
    return <MonthAnalysisSkeleton />;
  }

  // Check if there are no transactions at all
  if (availableMonths.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
        <Icons.Calendar className="text-muted-foreground mb-4 h-12 w-12" />
        <h3 className="mb-2 text-lg font-semibold">No Transactions</h3>
        <p className="text-muted-foreground mb-4 text-center">
          Import your first transactions to see monthly analysis reports.
        </p>
        <Link
          to="/activities?tab=import"
          className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
        >
          Import transactions
          <Icons.ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (!selectedMonth || !monthData) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
        <Icons.Calendar className="text-muted-foreground mb-4 h-12 w-12" />
        <p className="text-muted-foreground">No data available for the selected month</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
      {/* Top Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
            <Icons.CreditCard className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <AmountDisplay
                value={monthData.spending}
                currency={baseCurrency}
                isHidden={isBalanceHidden}
              />
            </div>
            {monthData.spendingChange !== null && (
              <p
                className={`text-xs ${monthData.spendingChange > 0 ? "text-destructive" : "text-success"}`}
              >
                {monthData.spendingChange > 0 ? "+" : ""}
                {formatPercent(monthData.spendingChange / 100)} vs last month
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <Icons.Income className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <AmountDisplay
                value={monthData.income}
                currency={baseCurrency}
                isHidden={isBalanceHidden}
              />
            </div>
            {monthData.incomeChange !== null && (
              <p
                className={`text-xs ${monthData.incomeChange >= 0 ? "text-success" : "text-destructive"}`}
              >
                {monthData.incomeChange > 0 ? "+" : ""}
                {formatPercent(monthData.incomeChange / 100)} vs last month
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Savings</CardTitle>
            <Icons.Wallet className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${monthData.netSavings >= 0 ? "text-success" : "text-destructive"}`}
            >
              <AmountDisplay
                value={monthData.netSavings}
                currency={baseCurrency}
                isHidden={isBalanceHidden}
              />
            </div>
            <p className="text-muted-foreground text-xs">Income minus spending</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Savings Rate</CardTitle>
            <Icons.TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${monthData.savingsRate >= 0 ? "text-success" : "text-destructive"}`}
            >
              {formatPercent(monthData.savingsRate / 100)}
            </div>
            <p className="text-muted-foreground text-xs">Of income saved</p>
          </CardContent>
        </Card>
      </div>

      {/* Spending Trends Chart */}
      <SpendingTrendsChart
        selectedMonth={selectedMonth}
        currency={baseCurrency}
        isHidden={isBalanceHidden}
        includeEventIds={includeAllEvents ? undefined : includeEventIds}
        includeAllEvents={includeAllEvents}
      />

      {/* Row 1: Notable Changes | Transaction Metrics | Largest Transactions */}
      <div className="grid gap-4 md:grid-cols-3">
        <NotableChangesPanel
          spendingData={totalSummary}
          selectedMonth={selectedMonth}
          currency={baseCurrency}
        />

        <MonthMetricsPanel
          selectedMonth={selectedMonth}
          currency={baseCurrency}
          isHidden={isBalanceHidden}
          includeEventIds={includeAllEvents ? undefined : includeEventIds}
          includeAllEvents={includeAllEvents}
        />

        <LargestTransactionsPanel
          selectedMonth={selectedMonth}
          currency={baseCurrency}
          topTransactions={topTransactions ?? []}
          isLoading={isTransactionsLoading}
        />
      </div>

      {/* Row 2: Category Breakdown (full width) */}
      <CategoryBreakdownPanel
        spendingData={totalSummary}
        selectedMonth={selectedMonth}
        currency={baseCurrency}
        includeEventIds={includeAllEvents ? undefined : includeEventIds}
        includeAllEvents={includeAllEvents}
      />
    </div>
  );
}

function MonthAnalysisSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="mt-2 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[...Array(5)].map((_, j) => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <Skeleton className="h-[300px] w-[200px] rounded-full" />
            <Skeleton className="h-[300px] w-[200px] rounded-full" />
            <Skeleton className="h-[300px] flex-1" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
