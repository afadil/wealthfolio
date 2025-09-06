import { format, parseISO } from "date-fns"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  EmptyPlaceholder,
  Icons,
  formatAmount,
} from '@wealthfolio/ui';
import type { EquityPoint } from "../types"

interface EquityCurveChartProps {
  data: EquityPoint[]
  currency: string
  height?: number
  periodType?: 'daily' | 'weekly' | 'monthly'
  periodType?: 'daily' | 'weekly' | 'monthly'
}

export function EquityCurveChart({ data, currency, periodType = 'monthly' }: EquityCurveChartProps) {
  // Transform data for chart - calculate period P/L from cumulative values
  const chartData = data.map((point, index) => {
    const prevCumulative = index > 0 ? data[index - 1].cumulativeRealizedPL : 0;
    const periodPL = point.cumulativeRealizedPL - prevCumulative;
    
    // Format date based on period type
    const dateFormat = periodType === 'daily' ? "MMM dd" : "MMM yy";
    
    return {
      date: point.date,
      periodPL: periodPL,
      cumulativeRealizedPL: point.cumulativeRealizedPL,
      formattedDate: format(parseISO(point.date), dateFormat),
    };
  });

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center py-12">
        <EmptyPlaceholder
          className="mx-auto flex max-w-[420px] items-center justify-center"
          icon={<Icons.TrendingUp className="h-10 w-10" />}
          title="No data available"
          description="There is no equity curve data for the selected period. Try selecting a different time range or check the selected activities."
        />
      </div>
    )
  }

  const periodLabel = periodType === 'daily' ? 'Daily' : 'Monthly';
  const dateFormat = periodType === 'daily' ? "MMM dd" : "MMM yy";
  const tooltipDateFormat = periodType === 'daily' ? "MMMM dd, yyyy" : "MMMM yyyy";

  return (
    <div className="flex h-full min-h-[300px] w-full items-center justify-center py-12">
      <ChartContainer
        config={{
          periodPL: {
            label: `${periodLabel} P/L`,
            color: 'var(--chart-1)',
          },
          cumulativeRealizedPL: {
            label: 'Cumulative Equity',
            color: 'var(--primary)',
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
          tickFormatter={(value) => format(parseISO(value), dateFormat)}
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
                        {name === 'periodPL'
                          ? `${periodLabel} P/L`
                          : name === 'cumulativeRealizedPL'
                            ? 'Cumulative Equity'
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
                return format(parseISO(label), tooltipDateFormat);
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
              fill={entry.periodPL >= 0 ? 'var(--success)' : 'var(--destructive)'}
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
      </ChartContainer>
    </div>
  )
}
