import { useMemo } from 'react';
import { Area, AreaChart, Tooltip, YAxis } from 'recharts';
import { formatAmount, formatDate } from '@/lib/utils';
import { ChartConfig, ChartContainer } from './ui/chart';

type CustomTooltipProps = {
  active: boolean;
  payload: { value: number; payload: any }[];
};

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="center-items">
        <p className="font-thin">{formatDate(data.date)}</p>
        <p className="label">{formatAmount(payload[0].value, data.currency, false)}</p>
      </div>
    );
  }

  return null;
};

interface HistoryChartData {
  date: string;
  totalValue: number;
  currency: string;
}

export function HistoryChart({
  data,
  interval,
}: {
  data: HistoryChartData[];
  interval: '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
}) {
  const filteredData = useMemo(() => {
    if (!data) return [];
    const today = new Date();
    let startDate: Date;
    switch (interval) {
      case '1D':
        startDate = new Date(today.setDate(today.getDate() - 1));
        break;
      case '1W':
        startDate = new Date(today.setDate(today.getDate() - 7));
        break;
      case '1M':
        startDate = new Date(today.setMonth(today.getMonth() - 1));
        break;
      case '3M':
        startDate = new Date(today.setMonth(today.getMonth() - 3));
        break;
      case '1Y':
        startDate = new Date(today.setFullYear(today.getFullYear() - 1));
        break;
      case 'ALL':
        return data;
    }

    return data.filter((d) => new Date(d.date) >= startDate);
  }, [data, interval]);

  const chartConfig = {
    totalValue: {
      label: 'Total Value',
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <AreaChart
        data={filteredData}
        stackOffset="sign"
        margin={{
          top: 0,
          right: 0,
          left: 0,
          bottom: 0,
        }}
      >
        <defs>
          <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#cbd492" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#cad38c" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        {/* @ts-ignore */}
        <Tooltip content={<CustomTooltip />} />
        {interval !== 'ALL' && interval !== '1Y' && (
          <YAxis hide type="number" domain={['auto', 'auto']} />
        )}
        <Area
          isAnimationActive={true}
          animationDuration={300}
          animationEasing="ease-out"
          connectNulls={true}
          type="monotone"
          dataKey="totalValue"
          stroke="#a2b35e"
          fillOpacity={1}
          fill="url(#colorUv)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
