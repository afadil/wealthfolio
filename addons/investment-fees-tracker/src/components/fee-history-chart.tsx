import React from "react";
import { format, parseISO } from "date-fns";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@wealthfolio/ui";
import { EmptyPlaceholder, Icons } from "@wealthfolio/ui";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@wealthfolio/ui";
import { formatAmount } from "@wealthfolio/ui";

interface FeeHistoryChartProps {
  monthlyFeeData: [string, number][];
  previousMonthlyFeeData: [string, number][];
  selectedPeriod: "TOTAL" | "YTD" | "LAST_YEAR";
  currency: string;
  isBalanceHidden: boolean;
}

export function FeeHistoryChart({
  monthlyFeeData,
  previousMonthlyFeeData,
  selectedPeriod,
  currency,
  isBalanceHidden,
}: FeeHistoryChartProps) {
  // Prepare data for the chart
  const chartData = monthlyFeeData.map(([month, currentFees], index) => {
    const cumulative = monthlyFeeData.slice(0, index + 1).reduce((sum, [, value]) => {
      const numericValue = Number(value) || 0;
      return sum + numericValue;
    }, 0);

    // Calculate cumulative previous period fees
    const previousCumulative = previousMonthlyFeeData
      .slice(0, index + 1)
      .reduce((sum, [, value]) => {
        const numericValue = Number(value) || 0;
        return sum + numericValue;
      }, 0);

    const dataPoint = {
      month,
      currentFees: Number(currentFees) || 0,
      cumulative: cumulative,
      previousCumulative: previousCumulative,
    };

    return dataPoint;
  });

  const periodDescription =
    selectedPeriod === "TOTAL"
      ? "All Time"
      : selectedPeriod === "YTD"
        ? "Year to Date"
        : "Last Year";

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-xl">Fee History</CardTitle>
        <CardDescription>{periodDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <EmptyPlaceholder
            className="mx-auto flex h-[300px] max-w-[420px] items-center justify-center"
            icon={<Icons.CreditCard className="h-10 w-10" />}
            title="No fee history available"
            description="There is no fee history for the selected period. Try selecting a different time range or check back later."
          />
        ) : (
          <ChartContainer
            config={{
              currentFees: {
                label: "Monthly Fees",
                color: "var(--destructive)",
              },
              cumulative: {
                label: "Cumulative Fees",
                color: "var(--chart-5)",
                lineStyle: "solid",
              },
              previousCumulative: {
                label: "Previous Period Cumulative",
                color: "var(--chart-3)",
                lineStyle: "dashed",
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
                tickFormatter={(value) => format(parseISO(`${value}-01`), "MMM yy")}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, entry) => {
                      const formattedValue = isBalanceHidden
                        ? "••••"
                        : formatAmount(Number(value), currency);
                      return (
                        <>
                          <div
                            className="border-border h-2.5 w-2.5 shrink-0 rounded-[2px] bg-(--color-bg)"
                            style={
                              {
                                "--color-bg": entry.color,
                                "--color-border": entry.color,
                              } as React.CSSProperties
                            }
                          />
                          <div className="flex flex-1 items-center justify-between">
                            <span className="text-muted-foreground">
                              {name === "currentFees"
                                ? "Monthly Fees"
                                : name === "previousCumulative"
                                  ? "Previous Period Cumulative"
                                  : name === "cumulative"
                                    ? "Cumulative Fees"
                                    : name}
                            </span>
                            <span className="text-foreground ml-2 font-mono font-medium tabular-nums">
                              {formattedValue}
                            </span>
                          </div>
                        </>
                      );
                    }}
                    labelFormatter={(label) => {
                      return format(parseISO(`${label}-01`), "MMMM yyyy");
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                yAxisId="left"
                dataKey="currentFees"
                fill="var(--color-currentFees)"
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
              {previousMonthlyFeeData.length > 0 && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="previousCumulative"
                  stroke="var(--color-previousCumulative)"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="3 3"
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
