'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyPlaceholder,
  formatAmount,
  Icons,
} from '@wealthfolio/ui';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  XAxis,
  YAxis,
} from '@wealthfolio/ui/chart';
import type { TradeDistribution } from '../types';

interface DistributionChartsProps {
  distribution: TradeDistribution;
  currency: string;
}

export function DistributionCharts({ distribution, currency }: DistributionChartsProps) {
  // Prepare data for charts
  const symbolData = Object.entries(distribution.bySymbol)
    .map(([symbol, data]) => ({
      name: symbol,
      pl: data.pl,
      count: data.count,
      returnPercent: data.returnPercent,
    }))
    .sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl))
    .slice(0, 10); // Top 10

  const holdingPeriodData = Object.entries(distribution.byHoldingPeriod)
    .map(([period, data]) => ({
      name: period,
      pl: data.pl,
      count: data.count,
      returnPercent: data.returnPercent,
    }))
    .sort((a, b) => b.count - a.count);

  const formatCurrency = (value: number) => {
    return formatAmount(value, currency);
  };

  const chartConfig = {
    pl: {
      label: 'P/L',
      color: 'var(--chart-1)',
    },
    count: {
      label: 'Trades',
      color: 'var(--chart-2)',
    },
  };

  // const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  // Check if there's data for charts
  const hasSymbolData = symbolData.length > 0;
  const hasHoldingPeriodData = holdingPeriodData.length > 0;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* P/L by Symbol */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">P/L by Symbol</CardTitle>
        </CardHeader>
        <CardContent>
          {hasSymbolData ? (
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={symbolData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, entry) => {
                        if (value === undefined || value === null) return null;
                        const formattedValue = formatCurrency(Number(value));
                        return (
                          <>
                            <div
                              className="border-border h-2.5 w-2.5 shrink-0 rounded-[2px] bg-(--color-bg)"
                              style={
                                {
                                  '--color-bg': entry.color,
                                  '--color-border': entry.color,
                                } as React.CSSProperties
                              }
                            />
                            <div className="flex flex-1 items-center justify-between gap-2">
                              <span className="text-muted-foreground">
                                {name === 'pl' ? 'P/L' : name}
                              </span>
                              <span className="text-foreground font-mono font-medium tabular-nums">
                                {formattedValue}
                              </span>
                            </div>
                          </>
                        );
                      }}
                      labelFormatter={(label) => `Symbol: ${label}`}
                    />
                  }
                />
                <Bar dataKey="pl" fill="var(--color-pl)" radius={[2, 2, 0, 0]}>
                  {symbolData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.pl >= 0 ? 'var(--success)' : 'var(--destructive)'}
                      fillOpacity={0.6}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex h-[300px] w-full items-center justify-center">
              <EmptyPlaceholder
                className="mx-auto flex max-w-[420px] items-center justify-center"
                icon={<Icons.BarChart className="h-10 w-10" />}
                title="No Symbol Data"
                description="No completed trades in this period to analyze P/L by symbol. Switch to a different time period or wait for more trading activity."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* P/L by Holding Period */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">P/L by Holding Period</CardTitle>
        </CardHeader>
        <CardContent>
          {hasHoldingPeriodData ? (
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart
                data={holdingPeriodData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, entry) => {
                        if (value === undefined || value === null) return null;
                        const formattedValue = formatCurrency(Number(value));
                        return (
                          <>
                            <div
                              className="border-border h-2.5 w-2.5 shrink-0 rounded-[2px] bg-(--color-bg)"
                              style={
                                {
                                  '--color-bg': entry.color,
                                  '--color-border': entry.color,
                                } as React.CSSProperties
                              }
                            />
                            <div className="flex flex-1 items-center justify-between gap-2">
                              <span className="text-muted-foreground">
                                {name === 'pl' ? 'P/L' : name}
                              </span>
                              <span className="text-foreground font-mono font-medium tabular-nums">
                                {formattedValue}
                              </span>
                            </div>
                          </>
                        );
                      }}
                      labelFormatter={(label) => `Period: ${label}`}
                    />
                  }
                />
                <Bar dataKey="pl" fill="var(--chart-3)" radius={[2, 2, 0, 0]}>
                  {holdingPeriodData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.pl >= 0 ? 'var(--success)' : 'var(--destructive)'}
                      fillOpacity={0.6}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex h-[300px] w-full items-center justify-center">
              <EmptyPlaceholder
                className="mx-auto flex max-w-[420px] items-center justify-center"
                icon={<Icons.Clock className="h-10 w-10" />}
                title="No Holding Period Data"
                description="No completed trades in this period to analyze P/L by holding period. This chart shows performance across different time horizons."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trade Count Distribution */}
      {/* <Card>
        <CardHeader>
          <CardTitle>Trade Count by Symbol</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <PieChart>
              <Pie
                data={symbolData.slice(0, 6)} // Top 6 for readability
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, count }) => `${name}: ${count}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {symbolData.slice(0, 6).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => [value, 'Trades']}
                    labelFormatter={(label) => `Symbol: ${label}`}
                  />
                }
              />
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card> */}
    </div>
  );
}
