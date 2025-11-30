import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  EmptyPlaceholder,
  Icons,
  formatAmount,
} from "@wealthvn/ui";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from "@wealthvn/ui/chart";
import { parseISO } from "date-fns";
import type { EquityPoint } from "../types";
import { useTranslation } from "react-i18next";
import { useDateFormatter } from "@/hooks/use-date-formatter";

interface EquityCurveChartProps {
  data: EquityPoint[];
  currency: string;
  height?: number;
  periodType?: "daily" | "weekly" | "monthly";
}

export function EquityCurveChart({
  data,
  currency,
  periodType = "monthly",
}: EquityCurveChartProps) {
  const { t } = useTranslation("trading");
  const { formatChartDate } = useDateFormatter();
  // Transform data for chart - calculate period P/L from cumulative values
  const chartData = data.map((point, index) => {
    const prevCumulative = index > 0 ? data[index - 1].cumulativeRealizedPL : 0;
    const periodPL = point.cumulativeRealizedPL - prevCumulative;

    return {
      date: point.date,
      periodPL: periodPL,
      cumulativeRealizedPL: point.cumulativeRealizedPL,
      formattedDate: formatChartDate(parseISO(point.date)),
    };
  });

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center py-12">
        <EmptyPlaceholder
          className="mx-auto flex max-w-[420px] items-center justify-center"
          icon={<Icons.TrendingUp className="h-10 w-10" />}
          title={t("components.equityCurve.emptyState.title")}
          description={t("components.equityCurve.emptyState.description")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[300px] w-full items-center justify-center py-12">
      <ChartContainer
        config={{
          periodPL: {
            label:
              periodType === "daily"
                ? t("components.equityCurve.labels.dailyPL")
                : t("components.equityCurve.labels.monthlyPL"),
            color: "var(--chart-1)",
          },
          cumulativeRealizedPL: {
            label: t("components.equityCurve.labels.cumulativeEquity"),
            color: "var(--primary)",
          },
        }}
        className="h-full w-full"
      >
        <ComposedChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tickFormatter={(value) => formatChartDate(parseISO(value))}
          />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name, entry) => {
                  const formattedValue = formatAmount(Number(value), currency);
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
                          {name === "periodPL"
                            ? periodType === "daily"
                              ? t("components.equityCurve.labels.dailyPL")
                              : t("components.equityCurve.labels.monthlyPL")
                            : name === "cumulativeRealizedPL"
                              ? t("components.equityCurve.labels.cumulativeEquity")
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
                  return formatChartDate(parseISO(label));
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            yAxisId="left"
            dataKey="periodPL"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
            barSize={20}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.periodPL >= 0 ? "var(--success)" : "var(--destructive)"}
                fillOpacity={0.6}
              />
            ))}
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulativeRealizedPL"
            stroke="var(--color-cumulativeRealizedPL)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
