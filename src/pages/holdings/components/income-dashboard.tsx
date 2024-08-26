import { useQuery } from '@tanstack/react-query';
import { DollarSign, BarChart as BarChartIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Bar, ComposedChart, CartesianGrid, XAxis, YAxis, Line } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { getIncomeSummary } from '@/commands/portfolio';
import type { IncomeSummary } from '@/lib/types';
import { formatAmount } from '@/lib/utils';

export function IncomeDashboard() {
  const {
    data: incomeSummary,
    isLoading,
    error,
  } = useQuery<IncomeSummary, Error>({
    queryKey: ['incomeSummary'],
    queryFn: getIncomeSummary,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error || !incomeSummary) {
    return <div>Failed to load income summary: {error?.message || 'Unknown error'}</div>;
  }

  console.log(incomeSummary);
  const totalIncome = incomeSummary.total_income;
  const dividendIncome = incomeSummary.by_type['DIVIDEND'] || 0;
  const interestIncome = incomeSummary.by_type['INTEREST'] || 0;
  const dividendPercentage = (dividendIncome / totalIncome) * 100;
  const interestPercentage = (interestIncome / totalIncome) * 100;

  // Filter out interest and only keep dividend income for top stocks
  const topDividendStocks = Object.entries(incomeSummary.by_symbol)
    .filter(([symbol, income]) => {
      return income > 0 && !symbol.startsWith('$CASH');
    })
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const monthlyIncomeData = Object.entries(incomeSummary.by_month)
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
              <div className="text-2xl font-bold">
                {formatAmount(totalIncome, incomeSummary.currency)}
              </div>
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
                {formatAmount(incomeSummary.total_income_ytd, incomeSummary.currency)}
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
                    amount: formatAmount(dividendIncome, incomeSummary.currency),
                    percentage: dividendPercentage,
                  },
                  {
                    name: 'Interest',
                    amount: formatAmount(interestIncome, incomeSummary.currency),
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
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Top 10 Dividend Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topDividendStocks.map(([symbol, income], index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="font-medium">{symbol}</div>
                    <div className="font-medium text-green-600">
                      {formatAmount(income, incomeSummary.currency)}
                    </div>
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
