import { CumulativeReturn } from '@/lib/types';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { format, parseISO } from 'date-fns';
import { formatPercent } from '@/lib/utils';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

interface PerformanceChartProps {
  data: {
    id: string;
    name: string;
    cumulativeReturns: CumulativeReturn[];
    totalReturn: number;
    annualizedReturn: number;
  }[];
  height?: number;
}

const CHART_COLORS = [
  'hsl(215 100% 50%)', // Blue
  'hsl(280 87% 65%)', // Purple
  'hsl(173.4 80.4% 40%)', // Teal-500
  'hsl(188.7 94.5% 42.7%)', // cyan-500
  'hsl(43 96% 58%)', // Yellow
  'hsl(330.4 81.2% 60.4%)', // Pink-500
  'hsl(24 75% 50%)', // Orange
  'hsl(271 91% 65%)', // Violet
];

export function PerformanceChart({ data, height = 400 }: PerformanceChartProps) {
  const formattedData = data[0]?.cumulativeReturns?.map((item) => {
    const dataPoint: Record<string, any> = { date: item.date };
    data.forEach((series) => {
      const matchingPoint = series.cumulativeReturns?.find((p) => p.date === item.date);
      if (matchingPoint) {
        dataPoint[series.id] = matchingPoint.value * 100;
      }
    });
    return dataPoint;
  });

  const chartConfig = data.reduce((config, series, index) => {
    config[series.id] = {
      label: series.name,
      color: CHART_COLORS[index % CHART_COLORS.length],
    };
    return config;
  }, {} as ChartConfig);

  const tooltipFormatter: (value: ValueType, name: NameType) => [string, string] = (
    value,
    name,
  ) => {
    const formattedValue = typeof value === 'number' ? formatPercent(value) : value.toString();
    return [formattedValue, name.toString()];
  };

  const tooltipLabelFormatter = (label: string) => format(parseISO(label), 'PPP');

  return (
    <ChartContainer config={chartConfig}>
      <LineChart
        data={formattedData}
        height={height}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(date) => format(parseISO(date), 'MMM d')}
        />
        <YAxis
          tickFormatter={(value) => formatPercent(value)}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={tooltipFormatter}
              labelFormatter={tooltipLabelFormatter}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {data.map((series, index) => (
          <Line
            key={series.id}
            type="monotone"
            dataKey={series.id}
            stroke={CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            name={series.name}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
