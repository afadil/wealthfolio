import { useMemo } from "react";
import { Area, AreaChart, Tooltip, YAxis, XAxis, ResponsiveContainer } from "recharts";
import { ChartConfig, ChartContainer } from "@wealthfolio/ui/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ToolRendererProps, ValuationPointDto } from "./types";

interface ValuationTooltipProps {
  active?: boolean;
  payload?: readonly {
    dataKey?: string;
    payload?: ValuationPointDto;
  }[];
  currency: string;
}

function ValuationTooltip({ active, payload, currency }: ValuationTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) return null;

  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <div className="bg-popover grid gap-1.5 rounded-md border p-2 shadow-md">
      <p className="text-muted-foreground text-xs font-medium">{formatDate(data.date)}</p>
      <div className="grid gap-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Total Value:</span>
          <span className="font-semibold">{formatter.format(data.totalValue)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Cost Basis:</span>
          <span className="font-medium">{formatter.format(data.costBasis)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Net Deposit:</span>
          <span className="font-medium">{formatter.format(data.netContribution)}</span>
        </div>
      </div>
    </div>
  );
}

interface ValuationChartProps extends ToolRendererProps<ValuationPointDto[]> {
  currency?: string;
}

export function ValuationChart({ data, meta, currency = "USD" }: ValuationChartProps) {
  const chartConfig = {
    totalValue: {
      label: "Total Value",
      color: "var(--success)",
    },
    costBasis: {
      label: "Cost Basis",
      color: "var(--muted-foreground)",
    },
  } satisfies ChartConfig;

  // Compute summary stats
  const summary = useMemo(() => {
    if (!data?.length) return null;
    const first = data[0];
    const last = data[data.length - 1];
    const change = last.totalValue - first.totalValue;
    const changePercent = first.totalValue > 0 ? (change / first.totalValue) * 100 : 0;
    return {
      startDate: first.date,
      endDate: last.date,
      startValue: first.totalValue,
      endValue: last.totalValue,
      change,
      changePercent,
    };
  }, [data]);

  if (!data?.length) {
    return (
      <Card className="w-full">
        <CardContent className="py-4">
          <p className="text-muted-foreground text-sm">No valuation data available.</p>
        </CardContent>
      </Card>
    );
  }

  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Portfolio Valuation</CardTitle>
            {summary && (
              <p className="text-muted-foreground mt-1 text-xs">
                {formatDate(summary.startDate)} - {formatDate(summary.endDate)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meta?.accountScope && meta.accountScope !== "TOTAL" && (
              <Badge variant="outline" className="text-xs">
                {meta.accountScope}
              </Badge>
            )}
            {meta?.truncated && (
              <Badge variant="secondary" className="text-xs">
                {meta.returnedCount} / {meta.originalCount} points
              </Badge>
            )}
          </div>
        </div>
        {summary && (
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-bold">{formatter.format(summary.endValue)}</span>
            <span
              className={`text-sm font-medium ${summary.change >= 0 ? "text-success" : "text-destructive"}`}
            >
              {summary.change >= 0 ? "+" : ""}
              {formatter.format(summary.change)} ({summary.changePercent.toFixed(1)}%)
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="pb-4">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <defs>
                <linearGradient id="valuationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => {
                  const date = new Date(value);
                  return date.toLocaleDateString(undefined, { month: "short" });
                }}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                hide
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={(props) => (
                  <ValuationTooltip
                    {...props}
                    currency={currency}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="totalValue"
                stroke="var(--success)"
                strokeWidth={2}
                fill="url(#valuationGradient)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="costBasis"
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="4 4"
                fill="transparent"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
