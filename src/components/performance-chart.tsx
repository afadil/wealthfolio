import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ReturnData } from "@/lib/types";
import { formatPercent } from "@wealthfolio/ui";
import { differenceInDays, differenceInMonths, format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

interface PerformanceChartProps {
  data: {
    id: string;
    name: string;
    returns: ReturnData[];
  }[];
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  const formattedData = data[0]?.returns?.map((item) => {
    const dataPoint: Record<string, number | string> = { date: item.date };
    data.forEach((series) => {
      const matchingPoint = series.returns?.find((p) => p.date === item.date);
      if (matchingPoint) {
        dataPoint[series.id] = matchingPoint.value;
      }
    });
    return dataPoint;
  });

  // Calculate appropriate tick interval based on date range
  const getTickInterval = () => {
    if (!formattedData?.length) return 30;

    const firstDate = parseISO(String(formattedData[0].date));
    const lastDate = parseISO(String(formattedData[formattedData.length - 1].date));
    const monthsDiff = differenceInMonths(lastDate, firstDate);
    const daysDiff = differenceInDays(lastDate, firstDate);

    if (daysDiff <= 7) return 0; // Show all days for 1 week
    if (daysDiff <= 31) return 7; // Weekly for 1 month
    if (monthsDiff <= 3) return 14; // Bi-weekly for 3 months
    if (monthsDiff <= 6) return 30; // Monthly for 6 months
    if (monthsDiff <= 12) return 60; // Bi-monthly for 1 year
    if (monthsDiff <= 36) return 90; // Quarterly for 3 years
    return 180; // Semi-annually for longer periods
  };

  // Format date based on range
  const formatXAxis = (dateStr: string) => {
    if (!formattedData?.length) return "";

    const date = parseISO(dateStr);
    const firstDate = parseISO(String(formattedData[0].date));
    const lastDate = parseISO(String(formattedData[formattedData.length - 1].date));
    const monthsDiff = differenceInMonths(lastDate, firstDate);
    const daysDiff = differenceInDays(lastDate, firstDate);

    if (daysDiff <= 31) {
      return format(date, "MMM d"); // e.g., "Sep 15"
    }
    if (monthsDiff <= 36) {
      return format(date, "MMM yyyy"); // e.g., "Sep 2023"
    }
    return format(date, "yyyy"); // e.g., "2023"
  };

  // Add back the custom colors
  const CHART_COLORS = [
    "#4385BE", // blue-400
    "#CE5D97", // magenta-400
    "#3AA99F", // cyan-400
    "#8B7EC8", // purple-400
    "#879A39", // green-400
    "#D0A215", // yellow-500
    "#DA702C", // orange-400
    "#D14D41", // red-400
  ];

  // Update the chartConfig and Line components to use CHART_COLORS
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
    const formattedValue = formatPercent(Number(value));
    return [formattedValue + " - ", name.toString()];
  };

  const tooltipLabelFormatter = (label: string) => format(parseISO(label), "PPP");

  return (
    <div className="h-full w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%" aspect={undefined}>
          <LineChart data={formattedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatXAxis}
              interval={getTickInterval()}
            />
            <YAxis
              tickFormatter={(value: number) => formatPercent(value)}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              domain={[-0.12, "auto"]}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={tooltipFormatter}
                  labelFormatter={tooltipLabelFormatter}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent payload={[]} />} />
            {data.map((series, seriesIndex) => (
              <Line
                key={series.id}
                type="linear"
                dataKey={series.id}
                stroke={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                name={series.name}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
