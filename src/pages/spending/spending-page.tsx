import { getSpendingSummary } from "@/commands/portfolio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { QueryKeys } from "@/lib/query-keys";
import { buildCashflowUrl, periodToDateRange, type SpendingPeriod } from "@/lib/navigation/cashflow-navigation";
import type { SpendingSummary, SubcategorySpending } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AmountDisplay,
  AnimatedToggleGroup,
  GainPercent,
  Page,
  PageContent,
  PageHeader,
  PrivacyAmount,
} from "@wealthfolio/ui";
import React, { useState, useCallback } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { SpendingHistoryChart } from "./spending-history-chart";

const DEFAULT_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

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

const SpendingPeriodSelector: React.FC<{
  selectedPeriod: "TOTAL" | "YTD" | "LAST_YEAR";
  onPeriodSelect: (period: "TOTAL" | "YTD" | "LAST_YEAR") => void;
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

export default function SpendingPage() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<"TOTAL" | "YTD" | "LAST_YEAR">("TOTAL");
  const { isBalanceHidden } = useBalancePrivacy();

  const handleCategoryClick = useCallback(
    (categoryId: string | null | undefined) => {
      if (!categoryId) return;
      const dateRange = periodToDateRange(selectedPeriod as SpendingPeriod);
      navigate(buildCashflowUrl({ categoryId, ...dateRange }));
    },
    [navigate, selectedPeriod]
  );

  const handleSubcategoryClick = useCallback(
    (subcategoryId: string | null | undefined) => {
      if (!subcategoryId) return;
      const dateRange = periodToDateRange(selectedPeriod as SpendingPeriod);
      navigate(buildCashflowUrl({ subcategoryId, ...dateRange }));
    },
    [navigate, selectedPeriod]
  );

  const {
    data: spendingData,
    isLoading,
    error,
  } = useQuery<SpendingSummary[], Error>({
    queryKey: [QueryKeys.SPENDING_SUMMARY],
    queryFn: getSpendingSummary,
  });

  if (isLoading) {
    return <SpendingDashboardSkeleton />;
  }

  if (error || !spendingData) {
    return <div>Failed to load spending summary: {error?.message || "Unknown error"}</div>;
  }

  const periodSummary = spendingData.find((summary) => summary.period === selectedPeriod);
  const totalSummary = spendingData.find((summary) => summary.period === "TOTAL");

  if (!periodSummary || !totalSummary) {
    return (
      <Page>
        <PageHeader
          heading="Spending"
          actions={
            <SpendingPeriodSelector
              selectedPeriod={selectedPeriod}
              onPeriodSelect={setSelectedPeriod}
            />
          }
        />
        <PageContent>
          <EmptyPlaceholder
            className="mx-auto flex max-w-[420px] items-center justify-center"
            icon={<Icons.CreditCard className="h-10 w-10" />}
            title="No spending data available"
            description="There is no spending data for the selected period. Try selecting a different time range or check back later."
          />
        </PageContent>
      </Page>
    );
  }

  const { totalSpending, currency, monthlyAverage, byCategory, bySubcategory } = periodSummary;

  const topCategories = Object.entries(byCategory)
    .filter(([, cat]) => cat.amount > 0)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 10);

  const monthlySpendingData: [string, number][] = Object.entries(periodSummary.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(selectedPeriod === "TOTAL" ? 0 : -12)
    .map(([month, spending]) => [month, Number(spending) || 0]);

  const getPreviousPeriodData = (currentMonth: string): number => {
    const [year, month] = currentMonth.split("-");
    const previousYear = parseInt(year) - 1;

    if (selectedPeriod === "YTD") {
      return totalSummary.byMonth[`${previousYear}-${month}`] || 0;
    } else if (selectedPeriod === "LAST_YEAR") {
      return (
        spendingData.find((summary) => summary.period === "TWO_YEARS_AGO")?.byMonth[
          `${previousYear}-${month}`
        ] || 0
      );
    }

    const previousYearMonth = `${previousYear}-${month}`;
    const previousSpending = totalSummary.byMonth[previousYearMonth];
    return Number(previousSpending) || 0;
  };

  const previousMonthlySpendingData: [string, number][] = monthlySpendingData.map(([month]) => [
    month,
    getPreviousPeriodData(month),
  ]);

  const previousMonthlyAverage =
    previousMonthlySpendingData.length > 0
      ? previousMonthlySpendingData.reduce((sum, [, value]) => {
          const numericValue = Number(value) || 0;
          return sum + numericValue;
        }, 0) / previousMonthlySpendingData.length
      : 0;

  const currentMonthlyAverageNumber = Number(monthlyAverage) || 0;

  const monthlyAverageChange =
    previousMonthlyAverage > 0
      ? (currentMonthlyAverageNumber - previousMonthlyAverage) / previousMonthlyAverage
      : 0;

  const categoryData = topCategories.slice(0, 6).map(([, cat]) => ({
    category: cat.categoryName,
    amount: Number(cat.amount) || 0,
    color: cat.color,
  }));

  const topSubcategories: [string, SubcategorySpending][] = Object.entries(bySubcategory || {})
    .filter(([, sub]) => sub.amount > 0)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 10);

  return (
    <Page>
      <PageHeader
        heading="Spending"
        actions={
          <SpendingPeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodSelect={setSelectedPeriod}
          />
        }
      />
      <PageContent>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-red-500/10 bg-red-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {selectedPeriod === "TOTAL"
                  ? "All Time Spending"
                  : selectedPeriod === "LAST_YEAR"
                    ? "Last Year Spending"
                    : "This Year Spending"}
              </CardTitle>
              <Icons.CreditCard className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">
                    <AmountDisplay
                      value={totalSpending}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                  <div className="justify-start text-xs">
                    {periodSummary.yoyGrowth !== null ? (
                      <div className="flex items-center text-xs">
                        <GainPercent
                          value={-periodSummary.yoyGrowth}
                          className="text-left text-xs"
                          animated={true}
                        />
                        <span className="text-muted-foreground ml-2 text-xs">
                          Year-over-year change
                        </span>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Cumulative spending since inception
                      </p>
                    )}
                  </div>
                </div>
                <div className="h-16 w-16">
                  <ChartContainer
                    config={categoryData.reduce(
                      (acc: Record<string, { label: string; color: string }>, item, index) => {
                        acc[item.category] = {
                          label: item.category,
                          color: item.color || `var(--chart-${index + 1})`,
                        };
                        return acc;
                      },
                      {},
                    )}
                    className="mx-auto aspect-square max-h-[62px]"
                  >
                    <PieChart>
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Pie data={categoryData} dataKey="amount" nameKey="category" paddingAngle={4}>
                        {categoryData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color || `var(--chart-${index + 1})`}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-500/10 bg-red-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Average</CardTitle>
              <Icons.CreditCard className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <AmountDisplay
                  value={currentMonthlyAverageNumber}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
              </div>
              <div className="flex items-center text-xs">
                <GainPercent value={-monthlyAverageChange} className="text-left text-xs" />
                <span className="text-muted-foreground ml-2 text-xs">Since last period</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-500/10 bg-red-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <Icons.Activity className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodSummary.transactionCount}</div>
              <p className="text-muted-foreground text-xs">Total expense transactions</p>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <SpendingHistoryChart
            monthlySpendingData={monthlySpendingData}
            previousMonthlySpendingData={previousMonthlySpendingData}
            selectedPeriod={selectedPeriod}
            currency={currency}
            isBalanceHidden={isBalanceHidden}
          />
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Top Spending Categories</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {topCategories.length === 0 ? (
                <EmptyPlaceholder
                  className="mx-auto flex h-[300px] max-w-[420px] items-center justify-center"
                  icon={<Icons.Tag className="h-10 w-10" />}
                  title="No categorized spending"
                  description="There are no categorized expenses for the selected period. Try selecting a different time range or categorize your transactions."
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex w-full space-x-0.5">
                    {(() => {
                      const top5Categories = topCategories.slice(0, 5);
                      const otherCategories = topCategories.slice(5);
                      const otherTotal = otherCategories.reduce(
                        (sum, [, cat]) => sum + cat.amount,
                        0,
                      );

                      const chartItems = [
                        ...top5Categories.map(([, cat]) => ({
                          id: cat.categoryId || "uncategorized",
                          name: cat.categoryName,
                          amount: cat.amount,
                          color: cat.color,
                          isOther: false,
                        })),
                        ...(otherTotal > 0
                          ? [
                              {
                                id: "other",
                                name: "Other",
                                amount: otherTotal,
                                color: undefined,
                                isOther: true,
                              },
                            ]
                          : []),
                      ];

                      return chartItems.map((item, index) => {
                        const percentage =
                          totalSpending > 0 ? (item.amount / totalSpending) * 100 : 0;

                        return (
                          <div
                            key={index}
                            className="group relative h-5 cursor-pointer rounded-lg transition-all duration-300 ease-in-out hover:brightness-110"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: item.color || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
                            }}
                          >
                            <div className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 transform group-hover:block">
                              <div className="bg-popover text-popover-foreground min-w-[180px] rounded-lg border px-3 py-2 shadow-md">
                                <div className="text-sm font-medium">{item.name}</div>
                                <div className="text-sm font-medium">
                                  <PrivacyAmount value={item.amount} currency={currency} />
                                </div>
                                <div className="text-muted-foreground text-xs">
                                  {percentage.toFixed(1)}% of total
                                </div>
                                <div className="border-t-border absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-r-transparent border-l-transparent"></div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {topCategories.map(([key, cat], index) => {
                    const percentage = totalSpending > 0 ? (cat.amount / totalSpending) * 100 : 0;

                    return (
                      <div
                        key={key}
                        className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                        onClick={() => handleCategoryClick(cat.categoryId)}
                      >
                        <div className="flex items-center">
                          <div
                            className="mr-2 h-3 w-3 rounded-full"
                            style={{
                              backgroundColor: cat.color || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
                            }}
                          />
                          <span className="text-muted-foreground text-xs">{cat.categoryName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">
                            {percentage.toFixed(1)}%
                          </span>
                          <div className="text-destructive text-sm">
                            <PrivacyAmount value={cat.amount} currency={currency} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        {topSubcategories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Top Spending Subcategories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {topSubcategories.map(([key, sub], index) => {
                  const percentage = totalSpending > 0 ? (sub.amount / totalSpending) * 100 : 0;
                  const color = sub.color || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length];

                  return (
                    <div
                      key={key}
                      className="bg-muted/30 flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                      onClick={() => handleSubcategoryClick(sub.subcategoryId)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-medium truncate">{sub.subcategoryName}</span>
                      </div>
                      <span className="text-muted-foreground text-xs truncate pl-[18px]">
                        {sub.categoryName}
                      </span>
                      <div className="mt-1 flex items-center justify-between pl-[18px]">
                        <span className="text-muted-foreground text-xs">
                          {percentage.toFixed(1)}%
                        </span>
                        <div className="text-destructive text-sm font-medium">
                          <PrivacyAmount value={sub.amount} currency={currency} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </PageContent>
    </Page>
  );
}

function SpendingDashboardSkeleton() {
  return (
    <div className="bg-background flex h-full flex-col">
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
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-[150px]" />
              <Skeleton className="h-4 w-[100px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-[200px]" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(10)].map((_, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-[80px]" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
