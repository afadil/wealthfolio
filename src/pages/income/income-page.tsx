import { getIncomeSummary } from "@/commands/portfolio";
import { Page, PageContent, PageHeader } from "@/components/page/page";
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
  { value: "TOTAL" as const, label: "All Time" },
  { value: "LAST_YEAR" as const, label: "Last Year" },
  { value: "YTD" as const, label: "Year to Date" },
];

const IncomePeriodSelector: React.FC<{
  selectedPeriod: "TOTAL" | "YTD" | "LAST_YEAR";
  onPeriodSelect: (period: "TOTAL" | "YTD" | "LAST_YEAR") => void;
}> = ({ selectedPeriod, onPeriodSelect }) => (
  <div className="flex justify-end">
    <AnimatedToggleGroup
      variant="secondary"
      size="sm"
      items={periods}
      value={selectedPeriod}
      onValueChange={onPeriodSelect}
    />
  </div>
);

export default function IncomePage() {
  const [selectedPeriod, setSelectedPeriod] = useState<"TOTAL" | "YTD" | "LAST_YEAR">("TOTAL");

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
      <Page>
        <PageHeader heading="Investment Income">
          <div className="flex items-center space-x-2">
            <IncomePeriodSelector
              selectedPeriod={selectedPeriod}
              onPeriodSelect={setSelectedPeriod}
            />
          </div>
        </PageHeader>
        <PageContent>
          <EmptyPlaceholder
            className="mx-auto flex max-w-[420px] items-center justify-center"
            icon={<Icons.DollarSign className="h-10 w-10" />}
            title="No income data available"
            description="There is no income data for the selected period. Try selecting a different time range or check back later."
          />
        </PageContent>
      </Page>
    );
  }

  const { totalIncome, currency, monthlyAverage, byType, byCurrency } = periodSummary;
  const dividendIncome = byType.DIVIDEND || 0;
  const interestIncome = byType.INTEREST || 0;
  const dividendPercentage = totalIncome > 0 ? (dividendIncome / totalIncome) * 100 : 0;
  const interestPercentage = totalIncome > 0 ? (interestIncome / totalIncome) * 100 : 0;

  const topDividendStocks = Object.entries(periodSummary.bySymbol)
    .filter(([symbol, income]) => income > 0 && !symbol.startsWith("[$CASH-"))
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

  const { isBalanceHidden } = useBalancePrivacy();

  return (
    <Page>
      <PageHeader heading="Investment Income">
        <div className="flex items-center space-x-2">
          <IncomePeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodSelect={setSelectedPeriod}
          />
        </div>
      </PageHeader>
      <PageContent>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-success/10 bg-success/10">
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
          <Card className="border-blue-500/10 bg-blue-500/10">
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
          <Card className="border-purple-500/10 bg-purple-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Income Sources</CardTitle>
              <Icons.PieChart className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  {
                    name: "Dividends",
                    amount: (
                      <AmountDisplay
                        value={dividendIncome}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    ),
                    percentage: dividendPercentage,
                  },
                  {
                    name: "Interest",
                    amount: (
                      <AmountDisplay
                        value={interestIncome}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    ),
                    percentage: interestPercentage,
                  },
                ].map((source, index) => (
                  <div key={index} className="flex items-center">
                    <div className="w-full">
                      <div className="mb-0 flex justify-between">
                        <span className="text-xs">{source.name}</span>
                        <span className="text-muted-foreground text-xs">{source.amount}</span>
                      </div>
                      <div className="bg-primary/20 relative h-4 w-full rounded-full">
                        <div
                          className="bg-primary text-background flex h-4 items-center justify-center rounded-full text-xs"
                          style={{ width: `${source.percentage}%` }}
                        >
                          {source.percentage > 0 ? `${source.percentage.toFixed(1)}%` : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
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
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Top 10 Dividend Sources</CardTitle>
            </CardHeader>
            <CardContent className="h-full">
              {topDividendStocks.length === 0 ? (
                <EmptyPlaceholder
                  className="mx-auto flex h-[300px] max-w-[420px] items-center justify-center"
                  icon={<Icons.DollarSign className="h-10 w-10" />}
                  title="No dividend income recorded"
                  description="There are no dividend sources for the selected period. Try selecting a different time range or check back later."
                />
              ) : (
                <div className="space-y-6">
                  {/* Horizontal Bar Chart - Separated Bars */}
                  <div className="flex w-full space-x-0.5">
                    {(() => {
                      const top5Stocks = topDividendStocks.slice(0, 5);
                      const otherStocks = topDividendStocks.slice(5);
                      const otherTotal = otherStocks.reduce((sum, [, income]) => sum + income, 0);

                      const chartItems = [
                        ...top5Stocks.map(([symbol, income]) => ({
                          symbol: /\[(.*?)\]/.exec(symbol)?.[1] || symbol,
                          companyName: symbol.replace(/\[.*?\]-/, "").trim(),
                          income,
                          isOther: false,
                        })),
                        ...(otherTotal > 0
                          ? [
                              {
                                symbol: "Other",
                                companyName: `${otherStocks.length} other sources`,
                                income: otherTotal,
                                isOther: true,
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
                          dividendIncome > 0 ? (item.income / dividendIncome) * 100 : 0;

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

                  {topDividendStocks.map(([symbol, income], index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Badge className="bg-primary mr-2 flex min-w-[55px] items-center justify-center rounded-sm text-xs">
                          {/\[(.*?)\]/.exec(symbol)?.[1] || symbol}
                        </Badge>
                        <span className="text-muted-foreground mr-16 text-xs">
                          {symbol.replace(/\[.*?\]-/, "").trim()}
                        </span>
                      </div>
                      <div className="text-success text-sm">
                        <PrivacyAmount value={income} currency={currency} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </Page>
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
