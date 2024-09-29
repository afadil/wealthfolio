import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, PieChart as PieChartIcon } from 'lucide-react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Icons } from '@/components/icons';
import { getIncomeSummary } from '@/commands/portfolio';
import type { IncomeSummary } from '@/lib/types';
import { formatAmount } from '@/lib/utils';
import { QueryKeys } from '@/lib/query-keys';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { GainPercent } from '@/components/gain-percent';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';
import { Badge } from '@/components/ui/badge';

const periods: { code: 'TOTAL' | 'YTD' | 'LAST_YEAR'; label: string }[] = [
  { code: 'TOTAL', label: 'All Time' },
  { code: 'LAST_YEAR', label: 'Last Year' },
  { code: 'YTD', label: 'Year to Date' },
];

const IncomePeriodSelector: React.FC<{
  selectedPeriod: 'TOTAL' | 'YTD' | 'LAST_YEAR';
  onPeriodSelect: (period: 'TOTAL' | 'YTD' | 'LAST_YEAR') => void;
}> = ({ selectedPeriod, onPeriodSelect }) => (
  <div className="flex justify-end">
    <div className="flex space-x-1 rounded-full bg-secondary p-1">
      {periods.map(({ code, label }) => (
        <Button
          key={code}
          size="sm"
          className="h-8 rounded-full px-2 text-xs"
          variant={selectedPeriod === code ? 'default' : 'ghost'}
          onClick={() => onPeriodSelect(code)}
        >
          {label}
        </Button>
      ))}
    </div>
  </div>
);

export default function IncomePage() {
  const [selectedPeriod, setSelectedPeriod] = useState<'TOTAL' | 'YTD' | 'LAST_YEAR'>('TOTAL');

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
    return <div>Failed to load income summary: {error?.message || 'Unknown error'}</div>;
  }

  const periodSummary = incomeData.find((summary) => summary.period === selectedPeriod);
  const totalSummary = incomeData.find((summary) => summary.period === 'TOTAL');

  if (!periodSummary || !totalSummary) {
    return (
      <EmptyPlaceholder
        className="mx-auto max-w-[420px]"
        icon={<Icons.DollarSign className="h-10 w-10" />}
        title="No income data available"
        description="There is no income data for the selected period. Try selecting a different time range or check back later."
      />
    );
  }

  const { totalIncome, currency, monthlyAverage, byType, byCurrency } = periodSummary;
  const dividendIncome = byType['DIVIDEND'] || 0;
  const interestIncome = byType['INTEREST'] || 0;
  const dividendPercentage = totalIncome > 0 ? (dividendIncome / totalIncome) * 100 : 0;
  const interestPercentage = totalIncome > 0 ? (interestIncome / totalIncome) * 100 : 0;

  const topDividendStocks = Object.entries(periodSummary.bySymbol)
    .filter(([symbol, income]) => income > 0 && !symbol.startsWith('[$CASH-'))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const monthlyIncomeData = Object.entries(periodSummary.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(selectedPeriod === 'TOTAL' ? 0 : -12);

  const getPreviousPeriodData = (currentMonth: string) => {
    const [year, month] = currentMonth.split('-');
    let previousYear = parseInt(year) - 1;
    let previousMonth = month;

    if (selectedPeriod === 'YTD') {
      return totalSummary.byMonth[`${previousYear}-${month}`] || 0;
    } else if (selectedPeriod === 'LAST_YEAR') {
      return (
        incomeData.find((summary) => summary.period === 'TWO_YEARS_AGO')?.byMonth[
          `${previousYear}-${month}`
        ] || 0
      );
    }

    const previousYearMonth = `${previousYear}-${previousMonth}`;
    return totalSummary.byMonth[previousYearMonth] || 0;
  };

  const previousMonthlyIncomeData = monthlyIncomeData.map(([month]) => [
    month,
    getPreviousPeriodData(month),
  ]);

  const previousMonthlyAverage =
    previousMonthlyIncomeData.length > 0
      ? previousMonthlyIncomeData.reduce((sum, [, value]) => sum + (value as number), 0) /
        previousMonthlyIncomeData.length
      : 0;

  const monthlyAverageChange =
    previousMonthlyAverage > 0
      ? ((monthlyAverage - previousMonthlyAverage) / previousMonthlyAverage) * 100
      : 0;

  const currencyData = Object.entries(byCurrency).map(([currency, amount]) => ({
    currency,
    amount,
  }));

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader heading="Investment Income">
        <div className="flex items-center space-x-2">
          <IncomePeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodSelect={setSelectedPeriod}
          />
        </div>
      </ApplicationHeader>
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-success-background/30 bg-success-background/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {selectedPeriod === 'TOTAL'
                  ? 'All Time Income'
                  : selectedPeriod === 'LAST_YEAR'
                    ? 'Last Year Income'
                    : 'This Year Income'}
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{formatAmount(totalIncome, currency)}</div>
                  <div className="justify-start text-xs">
                    {periodSummary.yoyGrowth !== null ? (
                      <div className="flex items-center text-xs">
                        <GainPercent
                          value={periodSummary.yoyGrowth}
                          className="text-left text-xs"
                        />
                        <span className="ml-2 text-xs text-muted-foreground">
                          Year-over-year growth
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Cumulative income since inception
                      </p>
                    )}
                  </div>
                </div>
                <div className="h-12 w-12">
                  <ChartContainer
                    config={currencyData.reduce(
                      (acc: Record<string, { label: string; color: string }>, item, index) => {
                        acc[item.currency] = {
                          label: item.currency,
                          color: `hsl(var(--chart-${index}))`,
                        };
                        return acc;
                      },
                      {},
                    )}
                    className="mx-auto aspect-square max-h-[48px]"
                  >
                    <PieChart>
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Pie data={currencyData} dataKey="amount" nameKey="currency">
                        {currencyData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${index + 3}))`} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-indigo-200 bg-indigo-100 dark:border-indigo-300/30 dark:bg-indigo-300/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Average</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatAmount(monthlyAverage, currency)}</div>
              <div className="flex items-center text-xs">
                <GainPercent value={monthlyAverageChange} className="text-left text-xs" />
                <span className="ml-2 text-xs text-muted-foreground">Since last period</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-purple-100 dark:border-purple-300/30 dark:bg-purple-300/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Income Sources</CardTitle>
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  {
                    name: 'Dividends',
                    amount: formatAmount(dividendIncome, currency),
                    percentage: dividendPercentage,
                  },
                  {
                    name: 'Interest',
                    amount: formatAmount(interestIncome, currency),
                    percentage: interestPercentage,
                  },
                ].map((source, index) => (
                  <div key={index} className="flex items-center">
                    <div className="w-full">
                      <div className="mb-0 flex justify-between">
                        <span className="text-xs">{source.name}</span>
                        <span className="text-xs text-muted-foreground">{source.amount}</span>
                      </div>
                      <div className="relative h-4 w-full rounded-full bg-purple-200 dark:bg-purple-300/30">
                        <div
                          className="flex h-4 items-center justify-center rounded-full bg-primary text-xs text-background"
                          style={{ width: `${source.percentage}%` }}
                        >
                          {source.percentage > 0 ? `${source.percentage.toFixed(1)}%` : ''}
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
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-xl">Income History</CardTitle>
              <CardDescription>
                {selectedPeriod === 'TOTAL'
                  ? 'All Time'
                  : selectedPeriod === 'YTD'
                    ? 'Year to Date'
                    : selectedPeriod === 'LAST_YEAR'
                      ? 'Last Year'
                      : 'Two Years Ago'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyIncomeData.length === 0 ? (
                <EmptyPlaceholder
                  className="mx-auto max-w-[420px]"
                  icon={<Icons.Activity className="h-10 w-10" />}
                  title="No income history available"
                  description="There is no income history for the selected period. Try selecting a different time range or check back later."
                />
              ) : (
                <ChartContainer
                  config={{
                    income: {
                      label: 'Monthly Income',
                      color: 'hsl(var(--chart-1))',
                    },
                    cumulative: {
                      label: 'Cumulative Income',
                      color: 'hsl(var(--chart-5))',
                    },
                    previousIncome: {
                      label: 'Previous Period Income',
                      color: 'hsl(var(--chart-5))',
                    },
                  }}
                >
                  <ComposedChart
                    data={monthlyIncomeData.map(([month, income], index) => ({
                      month,
                      income,
                      cumulative: monthlyIncomeData
                        .slice(0, index + 1)
                        .reduce((sum, [, value]) => sum + value, 0),
                      previousIncome: previousMonthlyIncomeData[index][1],
                    }))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(value) => value}
                    />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      yAxisId="left"
                      dataKey="income"
                      fill="var(--color-income)"
                      radius={[8, 8, 0, 0]}
                      barSize={25}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cumulative"
                      stroke="var(--color-cumulative)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="previousIncome"
                      stroke="var(--color-previousIncome)"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="3 3"
                    />
                  </ComposedChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Top 10 Dividend Sources</CardTitle>
            </CardHeader>
            <CardContent className="h-full">
              {topDividendStocks.length === 0 ? (
                <EmptyPlaceholder
                  className="mx-auto max-w-[420px]"
                  icon={<Icons.DollarSign className="h-10 w-10" />}
                  title="No dividend income recorded"
                  description="There are no dividend sources for the selected period. Try selecting a different time range or check back later."
                />
              ) : (
                <div className="space-y-4">
                  {topDividendStocks.map(([symbol, income], index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Badge className="mr-2 flex min-w-[55px] items-center justify-center rounded-sm bg-secondary text-xs text-foreground">
                          {symbol.match(/\[(.*?)\]/)?.[1] || symbol}
                        </Badge>
                        <span className="mr-16 text-xs text-muted-foreground">
                          {symbol.replace(/\[.*?\]-/, '').trim()}
                        </span>
                      </div>
                      <div className="text-sm text-success">{formatAmount(income, currency)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ApplicationShell>
  );
}

function IncomeDashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
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
