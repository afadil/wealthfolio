import React from 'react';
import { format, parseISO } from 'date-fns';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';
import { Icons } from '@/components/ui/icons';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatAmount } from '@wealthfolio/ui';

interface IncomeHistoryChartProps {
  monthlyIncomeData: [string, number][];
  previousMonthlyIncomeData: [string, number][];
  selectedPeriod: 'TOTAL' | 'YTD' | 'LAST_YEAR';
  currency: string;
  isBalanceHidden: boolean;
}

export const IncomeHistoryChart: React.FC<IncomeHistoryChartProps> = ({
  monthlyIncomeData,
  previousMonthlyIncomeData,
  selectedPeriod,
  currency,
  isBalanceHidden,
}) => {

  const chartData = monthlyIncomeData.map(([month, income], index) => {
    const cumulative = monthlyIncomeData
      .slice(0, index + 1)
      .reduce((sum, [, value]) => {
        const numericValue = Number(value) || 0;
        return sum + numericValue;
      }, 0);

    const dataPoint = {
      month,
      income: Number(income) || 0,
      cumulative: cumulative,
      previousIncome: Number(previousMonthlyIncomeData[index]?.[1]) || 0,
    };
    
    return dataPoint;
  });


  const periodDescription =
    selectedPeriod === 'TOTAL'
      ? 'All Time'
      : selectedPeriod === 'YTD'
        ? 'Year to Date'
        : 'Last Year';

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="text-xl">Income History</CardTitle>
        <CardDescription>{periodDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <EmptyPlaceholder
            className="mx-auto flex h-[300px] max-w-[420px] items-center justify-center"
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
                lineStyle: 'solid',
              },
              previousIncome: {
                label: 'Previous Period Income',
                color: 'hsl(var(--chart-5))',
                lineStyle: 'dashed',
              },
            }}
          >
            <ComposedChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => format(parseISO(`${value}-01`), 'MMM yy')}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, entry) => {
                      const formattedValue = isBalanceHidden
                        ? '••••'
                        : formatAmount(Number(value), currency);
                      return (
                        <>
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]"
                            style={
                              {
                                '--color-bg': entry.color,
                                '--color-border': entry.color,
                              } as React.CSSProperties
                            }
                          />
                          <div className="flex flex-1 items-center justify-between">
                            <span className="text-muted-foreground">
                              {name === 'income'
                                ? 'Monthly Income'
                                : name === 'previousIncome'
                                  ? 'Previous Period'
                                  : name === 'cumulative'
                                    ? 'Cumulative Income'
                                    : name}
                            </span>
                            <span className="ml-2 font-mono font-medium tabular-nums text-foreground">
                              {formattedValue}
                            </span>
                          </div>
                        </>
                      );
                    }}
                    labelFormatter={(label) => {
                      return format(parseISO(`${label}-01`), 'MMMM yyyy');
                    }}
                  />
                }
              />
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
  );
}; 