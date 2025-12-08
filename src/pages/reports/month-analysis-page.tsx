import { getIncomeSummary, getSpendingSummary } from "@/commands/portfolio";
import { getTopSpendingTransactions } from "@/commands/activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { useSettingsContext } from "@/lib/settings-provider";
import { QueryKeys } from "@/lib/query-keys";
import type { IncomeSummary, SpendingSummary, ActivityDetails } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AmountDisplay, formatPercent } from "@wealthfolio/ui";
import React, { useState, useMemo, useEffect } from "react";
import { format, subMonths } from "date-fns";
import { MonthSwitcher, getDefaultReportMonth } from "./components/month-switcher";
import { SpendingTrendsChart } from "./components/spending-trends-chart";
import { CategoryBreakdownPanel } from "./components/category-breakdown-panel";
import { MonthMetricsPanel } from "./components/month-metrics-panel";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";

interface MonthAnalysisPageProps {
  renderActions?: (actions: React.ReactNode) => void;
}

export default function MonthAnalysisPage({ renderActions }: MonthAnalysisPageProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const { isBalanceHidden } = useBalancePrivacy();
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const { data: spendingData, isLoading: isSpendingLoading } = useQuery<SpendingSummary[]>({
    queryKey: [QueryKeys.SPENDING_SUMMARY],
    queryFn: () => getSpendingSummary(),
  });

  const { data: incomeData, isLoading: isIncomeLoading } = useQuery<IncomeSummary[]>({
    queryKey: [QueryKeys.INCOME_SUMMARY],
    queryFn: getIncomeSummary,
  });

  // Fetch top 5 spending transactions from backend
  const { data: topTransactions, isLoading: isTransactionsLoading } = useQuery<ActivityDetails[]>({
    queryKey: ["top-spending-transactions", selectedMonth],
    queryFn: () => getTopSpendingTransactions(selectedMonth!, 5),
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

    const spendingChange = prevSpending > 0 ? ((spending - prevSpending) / prevSpending) * 100 : null;
    const incomeChange = prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : null;

    const categoryBreakdown = totalSummary.byMonthByCategory?.[selectedMonth] || {};
    const categorySpending = totalSummary.byCategory || {};

    const categories = Object.entries(categoryBreakdown)
      .map(([categoryId, amount]) => {
        const categoryInfo = categorySpending[categoryId];
        return {
          categoryId,
          categoryName: categoryInfo?.categoryName || "Uncategorized",
          color: categoryInfo?.color || null,
          amount: amount as number,
        };
      })
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return {
      spending,
      income,
      netSavings,
      savingsRate,
      spendingChange,
      incomeChange,
      categories,
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
    () =>
      selectedMonth ? (
        <MonthSwitcher
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          availableMonths={availableMonths}
        />
      ) : null,
    [selectedMonth, availableMonths]
  );

  useEffect(() => {
    renderActions?.(monthActions);
  }, [renderActions, monthActions]);

  const isLoading = isSpendingLoading || isIncomeLoading || !selectedMonth;

  if (isLoading) {
    return <MonthAnalysisSkeleton />;
  }

  if (!monthData) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
        <Icons.Calendar className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No data available for the selected month</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
            <Icons.CreditCard className="h-4 w-4 text-muted-foreground" />
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
              <p className={`text-xs ${monthData.spendingChange > 0 ? "text-destructive" : "text-success"}`}>
                {monthData.spendingChange > 0 ? "+" : ""}
                {formatPercent(monthData.spendingChange / 100)} vs last month
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <Icons.Income className="h-4 w-4 text-muted-foreground" />
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
              <p className={`text-xs ${monthData.incomeChange >= 0 ? "text-success" : "text-destructive"}`}>
                {monthData.incomeChange > 0 ? "+" : ""}
                {formatPercent(monthData.incomeChange / 100)} vs last month
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Savings</CardTitle>
            <Icons.Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${monthData.netSavings >= 0 ? "text-success" : "text-destructive"}`}>
              <AmountDisplay
                value={monthData.netSavings}
                currency={baseCurrency}
                isHidden={isBalanceHidden}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Income minus spending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Savings Rate</CardTitle>
            <Icons.TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${monthData.savingsRate >= 0 ? "text-success" : "text-destructive"}`}>
              {formatPercent(monthData.savingsRate / 100)}
            </div>
            <p className="text-xs text-muted-foreground">
              Of income saved
            </p>
          </CardContent>
        </Card>
      </div>

      <SpendingTrendsChart
        selectedMonth={selectedMonth}
        currency={baseCurrency}
        isHidden={isBalanceHidden}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <CategoryBreakdownPanel
          spendingData={totalSummary}
          selectedMonth={selectedMonth}
          currency={baseCurrency}
          isHidden={isBalanceHidden}
        />

        <MonthMetricsPanel
          selectedMonth={selectedMonth}
          currency={baseCurrency}
          isHidden={isBalanceHidden}
          topTransactions={topTransactions ?? []}
          isTransactionsLoading={isTransactionsLoading}
        />
      </div>
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
              <Skeleton className="h-3 w-20 mt-2" />
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
          <div className="mt-2 flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Category Breakdown with Pie Chart */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-[180px] w-[180px] rounded-full shrink-0" />
            </div>
          </CardContent>
        </Card>
        {/* Transaction Metrics with Top Expenses */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
