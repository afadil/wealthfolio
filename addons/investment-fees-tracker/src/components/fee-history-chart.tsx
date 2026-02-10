import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  EmptyPlaceholder,
  formatAmount,
  Icons,
} from "@wealthfolio/ui";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "@wealthfolio/ui/chart";
import { format, parseISO } from "date-fns";
import React from "react";

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

  const isCondensedXAxis = chartData.length > 6;
  const xAxisInterval = isCondensedXAxis ? Math.ceil(chartData.length / 6) - 1 : 0;
  const barSize = isCondensedXAxis ? 18 : 25;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">Fee History</CardTitle>
        <CardDescription>{periodDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex h-full flex-col px-4 pb-6 pt-0 sm:px-6">
        {chartData.length === 0 ? (
          <EmptyPlaceholder
            className="mx-auto flex h-[300px] max-w-[420px] items-center justify-center"
            icon={<Icons.ChartBar className="size-10" />}
            title="No fee history available"
            description="There is no fee history for the selected period. Try selecting a different time range or check back later."
          />
        ) : (
          <ChartContainer
            className="min-h-[280px] w-full max-w-full flex-1 sm:min-h-[320px] lg:min-h-[360px] xl:min-h-[420px]"
            config={{
              currentFees: {
                label: "Monthly Fees",
                color: "var(--destructive)",
              },
              cumulative: {
                label: "Cumulative Fees",
                color: "var(--chart-5)",
              },
              previousCumulative: {
                label: "Previous Period Cumulative",
                color: "var(--chart-3)",
              },
            }}
          >
            <ComposedChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                interval={xAxisInterval}
                tickFormatter={(value) =>
                  format(parseISO(`${value}-01`), isCondensedXAxis ? "MMM" : "MMM yy")
                }
                tick={{
                  fontSize: 11,
                }}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
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
                            className="border-border bg-(--color-bg) h-2.5 w-2.5 shrink-0 rounded-[2px]"
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
              <ChartLegend
                content={
                  <ChartLegendContent className="flex-wrap !justify-start gap-3 text-[11px] sm:!justify-center sm:text-xs" />
                }
              />
              <Bar
                yAxisId="left"
                dataKey="currentFees"
                fill="var(--color-currentFees)"
                radius={[8, 8, 0, 0]}
                barSize={barSize}
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
