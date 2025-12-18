import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { formatAmount } from "@wealthfolio/ui";
import { format, parseISO } from "date-fns";
import React, { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

// Source type IDs for filtering
const SOURCE_TYPE_IDS = ["Investment Income", "Cash Income", "Capital Gains"];

interface IncomeHistoryChartProps {
  monthlyIncomeData: [string, number][];
  previousMonthlyIncomeData: [string, number][];
  byMonthBySourceType: Record<string, Record<string, number>>;
  byMonthBySymbol: Record<string, Record<string, number>>;
  bySymbol: Record<string, number>;
  hiddenSourceTypes: Set<string>;
  hiddenSymbols: Set<string>;
  selectedPeriod: "TOTAL" | "YTD" | "LAST_YEAR";
  currency: string;
  isBalanceHidden: boolean;
}

export const IncomeHistoryChart: React.FC<IncomeHistoryChartProps> = ({
  monthlyIncomeData,
  previousMonthlyIncomeData,
  byMonthBySourceType,
  byMonthBySymbol,
  bySymbol,
  hiddenSourceTypes,
  hiddenSymbols,
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

  // Get all symbol IDs for filtering
  const allSymbolIds = useMemo(() => {
    return Object.keys(bySymbol || {});
  }, [bySymbol]);

  // Transform data for bar chart, filtering out hidden source types OR hidden symbols
  const chartData = useMemo(() => {
    let cumulativeTotal = 0;

    return monthlyIncomeData.map(([month], index) => {
      let filteredIncome = 0;

      // If source types are hidden, use source type filtering
      if (hiddenSourceTypes.size > 0) {
        const monthSourceTypes = byMonthBySourceType?.[month] || {};
        for (const sourceTypeId of SOURCE_TYPE_IDS) {
          if (!hiddenSourceTypes.has(sourceTypeId)) {
            filteredIncome += Number(monthSourceTypes[sourceTypeId]) || 0;
          }
        }
      }
      // If symbols are hidden (top 10 toggles), use symbol filtering
      else if (hiddenSymbols.size > 0) {
        const monthSymbols = byMonthBySymbol?.[month] || {};
        for (const symbolId of allSymbolIds) {
          if (!hiddenSymbols.has(symbolId)) {
            filteredIncome += Number(monthSymbols[symbolId]) || 0;
          }
        }
      }
      // No filters - use original monthly data
      else {
        filteredIncome = Number(monthlyIncomeData.find(([m]) => m === month)?.[1]) || 0;
      }

      cumulativeTotal += filteredIncome;

      return {
        month,
        income: filteredIncome,
        cumulative: cumulativeTotal,
        previousIncome: Number(previousMonthlyIncomeData[index]?.[1]) || 0,
      };
    });
  }, [
    monthlyIncomeData,
    previousMonthlyIncomeData,
    byMonthBySourceType,
    byMonthBySymbol,
    allSymbolIds,
    hiddenSourceTypes,
    hiddenSymbols,
  ]);

  const periodDescription =
    selectedPeriod === "TOTAL"
      ? "All Time"
      : selectedPeriod === "YTD"
        ? "Year to Date"
        : "Last Year";

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-4 md:pb-6">
        <CardTitle className="text-sm font-medium">Income History</CardTitle>
        <CardDescription className="text-xs md:text-sm">{periodDescription}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pt-0 md:px-6">
        {chartData.length === 0 ? (
          <EmptyPlaceholder
            className="mx-auto flex h-[250px] max-w-[420px] items-center justify-center md:h-[300px]"
            icon={<Icons.Activity className="h-8 w-8 md:h-10 md:w-10" />}
            title="No income history available"
            description="There is no income history for the selected period. Try selecting a different time range or check back later."
          />
        ) : (
          <ChartContainer
            config={{
              income: {
                label: "Income",
                color: "var(--chart-2)",
              },
              cumulative: {
                label: "Cumulative Income",
                color: "var(--chart-5)",
              },
              previousIncome: {
                label: "Previous Period Income",
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
                      // Skip zero values in tooltip
                      if (Number(value) === 0) return null;
                      const formattedValue = isBalanceHidden
                        ? "••••"
                        : formatAmount(Number(value), currency);
                      const displayName =
                        name === "previousIncome"
                          ? "Previous"
                          : name === "cumulative"
                            ? "Cumulative"
                            : name === "income"
                              ? "Income"
                              : String(name);
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
                            <span className="text-muted-foreground max-w-[120px] truncate text-xs md:text-sm">
                              {displayName}
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
              <Bar
                yAxisId="left"
                dataKey="income"
                fill="var(--color-income)"
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
                dataKey="previousIncome"
                stroke="var(--color-previousIncome)"
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
