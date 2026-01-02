import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useBalancePrivacy } from "@wealthfolio/ui";
import { formatAmount, Skeleton } from "@wealthfolio/ui";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface InflationChartData {
  year: string;
  nominal: number;
  real: number;
  inflationRate: number | null;
  cumulativeInflation: number;
}

interface InflationChartProps {
  data: InflationChartData[];
  isLoading?: boolean;
  baseYear: number;
  currency: string;
}

export function InflationChart({ data, isLoading, baseYear, currency }: InflationChartProps) {
  const { isBalanceHidden } = useBalancePrivacy();

  const chartConfig = {
    nominal: {
      label: "Nominal",
      color: "hsl(221 83% 53%)", // Blue
    },
    real: {
      label: `Real (${baseYear})`,
      color: "hsl(142 71% 45%)", // Green
    },
  } satisfies ChartConfig;

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <p className="text-muted-foreground text-center">
          No data available. Add inflation rates in Settings to see real values.
        </p>
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[400px] w-full">
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/30" />
        <XAxis dataKey="year" tickLine={false} tickMargin={10} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => {
            if (isBalanceHidden) return "****";
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
            return value.toString();
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, entry) => {
                const formattedValue = isBalanceHidden
                  ? "****"
                  : formatAmount(Number(value), currency);

                const extra =
                  name === "real" && entry.payload.cumulativeInflation !== 0
                    ? ` (${entry.payload.cumulativeInflation > 0 ? "-" : "+"}${Math.abs(entry.payload.cumulativeInflation).toFixed(1)}%)`
                    : "";

                return (
                  <>
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{
                        backgroundColor:
                          name === "nominal"
                            ? "hsl(221 83% 53%)"
                            : "hsl(142 71% 45%)",
                      }}
                    />
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <span className="text-muted-foreground text-sm">
                        {name === "nominal" ? "Nominal" : `Real (${baseYear})`}
                      </span>
                      <span className="text-foreground font-mono text-sm font-medium tabular-nums">
                        {formattedValue}
                        {extra}
                      </span>
                    </div>
                  </>
                );
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="nominal" fill="var(--color-nominal)" radius={[4, 4, 0, 0]} barSize={30} />
        <Bar dataKey="real" fill="var(--color-real)" radius={[4, 4, 0, 0]} barSize={30} />
      </BarChart>
    </ChartContainer>
  );
}
