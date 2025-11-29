import { getIncomeSummary } from "@/commands/portfolio";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { QueryKeys } from "@/lib/query-keys";
import type { IncomeSummary } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AmountDisplay, AnimatedToggleGroup, GainPercent, PrivacyAmount } from "@wealthfolio/ui";
import React, { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { IncomeHistoryChart } from "./income-history-chart";

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

const IncomePeriodSelector: React.FC<{
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

export default function IncomePage() {
  const [selectedPeriod, setSelectedPeriod] = useState<"TOTAL" | "YTD" | "LAST_YEAR">("TOTAL");
  const { isBalanceHidden } = useBalancePrivacy();

  const {
    data: incomeData,
    isLoading,
    error,
  } = useQuery<IncomeSummary[], Error>({
    queryKey: [QueryKeys.INCOME_SUMMARY],
    queryFn: getIncomeSummary,
  });

  if (isLoading) {
    return <IncomeDashboardSkeleton />;
  }

  if (error || !incomeData) {
    return <div>Failed to load income summary: {error?.message || "Unknown error"}</div>;
  }

  const periodSummary = incomeData.find((summary) => summary.period === selectedPeriod);
  const totalSummary = incomeData.find((summary) => summary.period === "TOTAL");

  if (!periodSummary || !totalSummary) {
    return (
      <>
        <div className="pointer-events-auto fixed top-4 right-2 z-20 lg:right-4">
          <IncomePeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodSelect={setSelectedPeriod}
          />
        </div>
        <EmptyPlaceholder
          className="mx-auto flex max-w-[420px] items-center justify-center pt-12"
          icon={<Icons.DollarSign className="h-10 w-10" />}
          title="No income data available"
          description="There is no income data for the selected period. Try selecting a different time range or check back later."
        />
      </>
    );
  }

  const { totalIncome, currency, monthlyAverage, byCurrency, bySourceType } = periodSummary;

  // Top income sources - includes both investment and cash income
  const topIncomeSources = Object.entries(periodSummary.bySymbol)
    .filter(([, income]) => income > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const monthlyIncomeData: [string, number][] = Object.entries(periodSummary.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(selectedPeriod === "TOTAL" ? 0 : -12)
    .map(([month, income]) => [month, Number(income) || 0]);

  const getPreviousPeriodData = (currentMonth: string): number => {
    const [year, month] = currentMonth.split("-");
    const previousYear = parseInt(year) - 1;
    const previousMonth = month;

    if (selectedPeriod === "YTD") {
      return totalSummary.byMonth[`${previousYear}-${month}`] || 0;
    } else if (selectedPeriod === "LAST_YEAR") {
      return (
        incomeData.find((summary) => summary.period === "TWO_YEARS_AGO")?.byMonth[
          `${previousYear}-${month}`
        ] || 0
      );
    }

    const previousYearMonth = `${previousYear}-${previousMonth}`;
    const previousIncome = totalSummary.byMonth[previousYearMonth];
    return Number(previousIncome) || 0;
  };

  const previousMonthlyIncomeData: [string, number][] = monthlyIncomeData.map(([month]) => [
    month,
    getPreviousPeriodData(month),
  ]);

  const previousMonthlyAverage =
    previousMonthlyIncomeData.length > 0
      ? previousMonthlyIncomeData.reduce((sum, [, value]) => {
          const numericValue = Number(value) || 0;
          return sum + numericValue;
        }, 0) / previousMonthlyIncomeData.length
      : 0;

  const currentMonthlyAverageNumber = Number(monthlyAverage) || 0;

  const monthlyAverageChange =
    previousMonthlyAverage > 0
      ? (currentMonthlyAverageNumber - previousMonthlyAverage) / previousMonthlyAverage
      : 0;

  const currencyData = Object.entries(byCurrency).map(([currency, amount]) => ({
    currency,
    amount: Number(amount) || 0,
  }));

  return (
    <>
      {/* Period selector - fixed position in header area */}
      <div className="pointer-events-auto fixed top-4 right-2 z-20 hidden md:block lg:right-4">
        <IncomePeriodSelector selectedPeriod={selectedPeriod} onPeriodSelect={setSelectedPeriod} />
      </div>

      <div className="space-y-6">
        <div className="flex justify-end md:hidden">
          <IncomePeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodSelect={setSelectedPeriod}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-yellow-500/10 bg-yellow-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {selectedPeriod === "TOTAL"
                  ? "All Time Income"
                  : selectedPeriod === "LAST_YEAR"
                    ? "Last Year Income"
                    : "This Year Income"}
              </CardTitle>
              <Icons.DollarSign className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">
                    <AmountDisplay
                      value={totalIncome}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                  <div className="justify-start text-xs">
                    {periodSummary.yoyGrowth !== null ? (
                      <div className="flex items-center text-xs">
                        <GainPercent
                          value={periodSummary.yoyGrowth}
                          className="text-left text-xs"
                          animated={true}
                        />
                        <span className="text-muted-foreground ml-2 text-xs">
                          Year-over-year growth
                        </span>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Cumulative income since inception
                      </p>
                    )}
                  </div>
                </div>
                <div className="h-16 w-16">
                  <ChartContainer
                    config={currencyData.reduce(
                      (acc: Record<string, { label: string; color: string }>, item, index) => {
                        acc[item.currency] = {
                          label: item.currency,
                          color: `var(--chart-${index})`,
                        };
                        return acc;
                      },
                      {},
                    )}
                    className="mx-auto aspect-square max-h-[62px]"
                  >
                    <PieChart>
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Pie data={currencyData} dataKey="amount" nameKey="currency" paddingAngle={4}>
                        {currencyData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={`var(--chart-${index + 2})`} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/10 bg-yellow-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Average</CardTitle>
              <Icons.DollarSign className="text-muted-foreground h-4 w-4" />
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
                <GainPercent value={monthlyAverageChange} className="text-left text-xs" />
                <span className="text-muted-foreground ml-2 text-xs">Since last period</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/10 bg-yellow-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Income Sources</CardTitle>
              <Icons.PieChart className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {bySourceType.map((source, index) => {
                  const chartColor = `var(--chart-${index + 1})`;
                  return (
                    <div key={index} className="flex items-center">
                      <div className="w-full">
                        <div className="mb-0 flex justify-between">
                          <span className="text-xs">{source.sourceType}</span>
                          <span className="text-muted-foreground text-xs">
                            <AmountDisplay
                              value={source.amount}
                              currency={currency}
                              isHidden={isBalanceHidden}
                            />
                          </span>
                        </div>
                        <div
                          className="relative h-4 w-full rounded-full"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${chartColor} 20%, transparent)`,
                          }}
                        >
                          <div
                            className="text-background flex h-4 items-center justify-center rounded-full text-xs"
                            style={{
                              width: `${source.percentage}%`,
                              backgroundColor: chartColor,
                            }}
                          >
                            {source.percentage > 0 ? `${source.percentage.toFixed(1)}%` : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <IncomeHistoryChart
            monthlyIncomeData={monthlyIncomeData}
            previousMonthlyIncomeData={previousMonthlyIncomeData}
            selectedPeriod={selectedPeriod}
            currency={currency}
            isBalanceHidden={isBalanceHidden}
          />
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Top 10 Income Sources</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {topIncomeSources.length === 0 ? (
                <EmptyPlaceholder
                  className="mx-auto flex h-[300px] max-w-[420px] items-center justify-center"
                  icon={<Icons.DollarSign className="h-10 w-10" />}
                  title="No income recorded"
                  description="There are no income sources for the selected period. Try selecting a different time range or check back later."
                />
              ) : (
                <div className="space-y-6">
                  {/* Horizontal Bar Chart - Separated Bars */}
                  <div className="flex w-full space-x-0.5">
                    {(() => {
                      const top5Sources = topIncomeSources.slice(0, 5);
                      const otherSources = topIncomeSources.slice(5);
                      const otherTotal = otherSources.reduce((sum, [, income]) => sum + income, 0);

                      const chartItems = [
                        ...top5Sources.map(([symbol, income]) => {
                          const isCash = symbol.startsWith("[$CASH]");
                          return {
                            symbol: isCash ? "Cash" : (/\[(.*?)\]/.exec(symbol)?.[1] || symbol),
                            companyName: symbol.replace(/\[.*?\]-/, "").trim(),
                            income,
                            isOther: false,
                            isCash,
                          };
                        }),
                        ...(otherTotal > 0
                          ? [
                              {
                                symbol: "Other",
                                companyName: `${otherSources.length} other sources`,
                                income: otherTotal,
                                isOther: true,
                                isCash: false,
                              },
                            ]
                          : []),
                      ];

                      const colors = [
                        "var(--chart-1)",
                        "var(--chart-2)",
                        "var(--chart-3)",
                        "var(--chart-4)",
                        "var(--chart-5)",
                        "var(--chart-6)",
                      ];

                      return chartItems.map((item, index) => {
                        const percentage =
                          totalIncome > 0 ? (item.income / totalIncome) * 100 : 0;

                        return (
                          <div
                            key={index}
                            className="group relative h-5 cursor-pointer rounded-lg transition-all duration-300 ease-in-out hover:brightness-110"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: colors[index % colors.length],
                            }}
                          >
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 transform group-hover:block">
                              <div className="bg-popover text-popover-foreground min-w-[180px] rounded-lg border px-3 py-2 shadow-md">
                                <div className="text-sm font-medium">{item.symbol}</div>
                                <div className="text-muted-foreground text-xs">
                                  {item.companyName}
                                </div>
                                <div className="text-sm font-medium">
                                  <PrivacyAmount value={item.income} currency={currency} />
                                </div>
                                <div className="text-muted-foreground text-xs">
                                  {percentage.toFixed(1)}% of total
                                </div>
                                {/* Tooltip arrow */}
                                <div className="border-t-border absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-r-transparent border-l-transparent"></div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {topIncomeSources.map(([symbolStr, income], index) => {
                    const isCash = symbolStr.startsWith("[$CASH]");
                    const ticker = /\[(.*?)\]/.exec(symbolStr)?.[1] || symbolStr;
                    const name = symbolStr.replace(/\[.*?\]-/, "").trim();

                    // For cash: parse "Category > Subcategory" format
                    const nameParts = isCash ? name.split(" > ") : [];
                    const category = nameParts[0] || name;
                    const subcategory = nameParts[1];

                    return (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isCash ? (
                            <>
                              <div className="bg-success/20 flex h-8 w-8 items-center justify-center rounded-full">
                                <Icons.Wallet className="text-success h-4 w-4" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{category}</span>
                                {subcategory && (
                                  <span className="text-muted-foreground text-xs">{subcategory}</span>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <Badge className="bg-primary flex min-w-[50px] items-center justify-center rounded-sm text-xs">
                                {ticker}
                              </Badge>
                              <div className="flex flex-col">
                                <span className="text-muted-foreground text-xs">{name}</span>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="text-success text-sm font-medium">
                          <PrivacyAmount value={income} currency={currency} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function IncomeDashboardSkeleton() {
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
