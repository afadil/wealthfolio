import { useQuery } from '@tanstack/react-query';
import { DollarSign, BarChart as BarChartIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bar, ComposedChart, CartesianGrid, XAxis, YAxis, Line } from 'recharts';
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

export function IncomeDashboard() {
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

  // Extract TOTAL and YTD summaries
  const totalSummary = incomeData.find((summary) => summary.period === 'TOTAL');
  const ytdSummary = incomeData.find((summary) => summary.period === 'YTD');

  if (!totalSummary || !ytdSummary) {
    return <div>Income summary data is incomplete.</div>;
  }

  const { totalIncome, currency } = totalSummary;
  const dividendIncome = totalSummary.byType['DIVIDEND'] || 0;
  const interestIncome = totalSummary.byType['INTEREST'] || 0;
  const dividendPercentage = (dividendIncome / totalIncome) * 100 || 0;
  const interestPercentage = (interestIncome / totalIncome) * 100 || 0;

  // Filter out interest and only keep dividend income for top stocks
  const topDividendStocks = Object.entries(totalSummary.bySymbol)
    .filter(([symbol, income]) => income > 0 && !symbol.startsWith('$CASH'))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const monthlyIncomeData = Object.entries(totalSummary.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 space-y-6 px-4 py-6 md:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Income</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatAmount(totalIncome, currency)}</div>
              <p className="text-xs text-muted-foreground">All time total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Income YTD</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatAmount(ytdSummary.totalIncome, currency)}
              </div>
              <p className="text-xs text-muted-foreground">Year-to-date total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Income Sources</CardTitle>
              <BarChartIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
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
                    <div className="mr-4 w-full">
                      <div className="mb-1 flex justify-between">
                        <span className="text-sm font-medium">{source.name}</span>
                        <span className="text-sm text-muted-foreground">{source.amount}</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-secondary">
                        <div
                          className="h-2.5 rounded-full bg-primary"
                          style={{ width: `${source.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{source.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Income History</CardTitle>
              <CardDescription>Last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyIncomeData.length === 0 ? (
                <div className="-mt-14 flex h-[300px] flex-col items-center justify-center text-center">
                  <Icons.Activity className="mb-2 h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No income history available</p>
                </div>
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
                  }}
                >
                  <ComposedChart
                    data={monthlyIncomeData.map(([month, income], index) => ({
                      month,
                      income,
                      cumulative: monthlyIncomeData
                        .slice(0, index + 1)
                        .reduce((sum, [, value]) => sum + value, 0),
                    }))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(value) => value.slice(5)} // Show only MM part of YYYY-MM
                    />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      yAxisId="left"
                      dataKey="income"
                      fill="var(--color-income)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cumulative"
                      stroke="var(--color-cumulative)"
                      strokeWidth={2}
                      dot={false}
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
                <div className="-mt-14 flex h-full min-h-64 flex-col items-center justify-center text-center">
                  <Icons.DollarSign className="mb-2 h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No dividend income recorded</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {topDividendStocks.map(([symbol, income], index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="font-medium">{symbol}</div>
                      <div className="text-success">{formatAmount(income, currency)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
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
