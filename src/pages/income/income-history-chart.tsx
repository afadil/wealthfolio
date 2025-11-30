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
import { formatAmount } from "@wealthvn/ui";
import { parseISO } from "date-fns";
import React from "react";
import { useTranslation } from "react-i18next";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { useDateFormatter } from "@/hooks/use-date-formatter";

interface IncomeHistoryChartProps {
  monthlyIncomeData: [string, number][];
  previousMonthlyIncomeData: [string, number][];
  selectedPeriod: "TOTAL" | "YTD" | "LAST_YEAR";
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
  const { t } = useTranslation(["income"]);
  const { formatIncomeChartDate } = useDateFormatter();
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const chartData = monthlyIncomeData.map(([month, income], index) => {
    const cumulative = monthlyIncomeData.slice(0, index + 1).reduce((sum, [, value]) => {
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
    selectedPeriod === "TOTAL"
      ? t("income:periods.allTime")
      : selectedPeriod === "YTD"
        ? t("income:periods.ytd")
        : t("income:periods.lastYear");

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-4 md:pb-6">
        <CardTitle className="text-sm font-medium">{t("income:chart.incomeHistory")}</CardTitle>
        <CardDescription className="text-xs md:text-sm">{periodDescription}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pt-0 md:px-6">
        {chartData.length === 0 ? (
          <EmptyPlaceholder
            className="mx-auto flex h-[250px] max-w-[420px] items-center justify-center md:h-[300px]"
            icon={<Icons.Activity className="h-8 w-8 md:h-10 md:w-10" />}
            title={t("income:empty.noHistory")}
            description={t("income:empty.description")}
          />
        ) : (
          <ChartContainer
            config={{
              income: {
                label: t("income:chart.monthlyIncome"),
                color: "var(--chart-1)",
              },
              cumulative: {
                label: t("income:chart.cumulativeIncome"),
                color: "var(--chart-5)",
              },
              previousIncome: {
                label: t("income:chart.previousPeriod"),
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
                  return formatIncomeChartDate(date, isMobile);
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
                              {name === "income"
                                ? isMobile
                                  ? t("income:chart.monthly")
                                  : t("income:chart.monthlyIncome")
                                : name === "previousIncome"
                                  ? t("income:chart.previous")
                                  : name === "cumulative"
                                    ? t("income:chart.cumulative")
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
                      const date = parseISO(`${label}-01`);
                      return formatIncomeChartDate(date, isMobile);
                    }}
                  />
                }
              />
              {!isMobile && <ChartLegend content={<ChartLegendContent payload={[]} />} />}
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
