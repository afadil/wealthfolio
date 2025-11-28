import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { formatAmount } from "@wealthfolio/ui";
import { format, parseISO } from "date-fns";
import React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

interface SpendingHistoryChartProps {
  monthlySpendingData: [string, number][];
  previousMonthlySpendingData: [string, number][];
  selectedPeriod: "TOTAL" | "YTD" | "LAST_YEAR";
  currency: string;
  isBalanceHidden: boolean;
}

export const SpendingHistoryChart: React.FC<SpendingHistoryChartProps> = ({
  monthlySpendingData,
  previousMonthlySpendingData,
  selectedPeriod,
  currency,
  isBalanceHidden,
}) => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const chartData = monthlySpendingData.map(([month, spending], index) => {
    const cumulative = monthlySpendingData.slice(0, index + 1).reduce((sum, [, value]) => {
      const numericValue = Number(value) || 0;
      return sum + numericValue;
    }, 0);

    const dataPoint = {
      month,
      spending: Number(spending) || 0,
      cumulative: cumulative,
      previousSpending: Number(previousMonthlySpendingData[index]?.[1]) || 0,
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
      <CardHeader className="pb-4 md:pb-6">
        <CardTitle className="text-sm font-medium">Spending History</CardTitle>
        <CardDescription className="text-xs md:text-sm">{periodDescription}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pt-0 md:px-6">
        {chartData.length === 0 ? (
          <EmptyPlaceholder
            className="mx-auto flex h-[250px] max-w-[420px] items-center justify-center md:h-[300px]"
            icon={<Icons.Activity className="h-8 w-8 md:h-10 md:w-10" />}
            title="No spending history available"
            description="There is no spending history for the selected period. Try selecting a different time range or check back later."
          />
        ) : (
          <ChartContainer
            config={{
              spending: {
                label: "Monthly Spending",
                color: "var(--chart-1)",
              },
              cumulative: {
                label: "Cumulative Spending",
                color: "var(--chart-5)",
              },
              previousSpending: {
                label: "Previous Period Spending",
                color: "var(--chart-5)",
              },
            }}
            className={cn("h-[280px] w-full md:h-[380px]")}
          >
            <ComposedChart
              data={chartData}
              margin={{
                left: isMobile ? -16 : 0,
                right: isMobile ? 4 : 8,
                top: 12,
                bottom: 4,
              }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={8}
                axisLine={false}
                tick={{ fontSize: isMobile ? 11 : 12 }}
                tickFormatter={(value) => {
                  const date = parseISO(`${value}-01`);
                  return isMobile ? format(date, "MMM") : format(date, "MMM yy");
                }}
              />
              <YAxis
                yAxisId="left"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: isMobile ? 10 : 12 }}
                width={isMobile ? 45 : 60}
                tickFormatter={(value: number) => {
                  if (value >= 1000) {
                    return `${(value / 1000).toFixed(0)}k`;
                  }
                  return value.toString();
                }}
              />
              {!isMobile && (
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
              )}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="min-w-[150px] md:min-w-[180px]"
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
                          <div className="flex flex-1 items-center justify-between gap-2">
                            <span className="text-muted-foreground text-xs md:text-sm">
                              {name === "spending"
                                ? isMobile
                                  ? "Monthly"
                                  : "Monthly Spending"
                                : name === "previousSpending"
                                  ? "Previous"
                                  : name === "cumulative"
                                    ? "Cumulative"
                                    : name}
                            </span>
                            <span className="text-foreground font-mono text-xs font-medium tabular-nums md:text-sm">
                              {formattedValue}
                            </span>
                          </div>
                        </>
                      );
                    }}
                    labelFormatter={(label) => {
                      return format(parseISO(`${label}-01`), isMobile ? "MMM yyyy" : "MMMM yyyy");
                    }}
                  />
                }
              />
              {!isMobile && <ChartLegend content={<ChartLegendContent payload={[]} />} />}
              <Bar
                yAxisId="left"
                dataKey="spending"
                fill="var(--color-spending)"
                radius={[isMobile ? 4 : 8, isMobile ? 4 : 8, 0, 0]}
                barSize={isMobile ? 16 : 25}
              />
              <Line
                yAxisId={isMobile ? "left" : "right"}
                type="monotone"
                dataKey="cumulative"
                stroke="var(--color-cumulative)"
                strokeWidth={isMobile ? 1.5 : 2}
                dot={false}
              />
              <Line
                yAxisId={isMobile ? "left" : "right"}
                type="monotone"
                dataKey="previousSpending"
                stroke="var(--color-previousSpending)"
                strokeWidth={isMobile ? 1.5 : 2}
                dot={false}
                strokeDasharray="3 3"
                opacity={0.6}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};
