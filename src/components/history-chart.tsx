import { useMemo } from 'react';
import { Area, AreaChart, Tooltip, YAxis, TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatAmount, formatDate } from '@/lib/utils';
import { ChartConfig, ChartContainer } from './ui/chart';
import { useBalancePrivacy } from '@/context/privacy-context';
import { GainPercent } from '@/components/gain-percent';
import { Separator } from '@radix-ui/react-separator';

type CustomTooltipProps = TooltipProps<ValueType, NameType> & {
  isBalanceHidden: boolean;
};

const CustomTooltip = ({ active, payload, isBalanceHidden }: CustomTooltipProps) => {
  if (active && payload && payload.length > 0) {
    const data = payload[0]?.payload;
    if (data) {
      return (
        <div className="center-items space-y-1">
          <p className="font-thin">{formatDate(data.date)}</p>
          <div className="label flex items-center">
            {isBalanceHidden
              ? `•••• `
              : `${formatAmount(Number(payload[0]?.value), data.currency, false)} `}
            <Separator orientation="vertical" className="mx-1 h-4 w-px bg-secondary" />
            <GainPercent
              value={data.totalGainPercentage}
              className="items-start text-left text-xs"
            />
          </div>
        </div>
      );
    }
  }

  return null;
};

interface HistoryChartData {
  date: string;
  totalValue: number;
  totalGainPercentage: number;
  currency: string;
}

export function HistoryChart({
  data,
  interval,
}: {
  data: HistoryChartData[];
  interval: '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
}) {
  const { isBalanceHidden } = useBalancePrivacy();

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

  // Calculate min and max values for better domain control
  const minValue = useMemo(() => {
    if (!filteredData.length) return 0;
    const min = Math.min(...filteredData.map((d) => d.totalValue));
    // Return 0 if min is negative, otherwise add 5% padding to the bottom
    return min < 0 ? 0 : min * 0.9;
  }, [filteredData]);

  const maxValue = useMemo(() => {
    if (!filteredData.length) return 0;
    const max = filteredData.reduce((max, d) => Math.max(max, d.totalValue), -Infinity);
    return max;
  }, [filteredData]);
  
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
            <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
            <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Tooltip
          content={(props) => <CustomTooltip {...props} isBalanceHidden={isBalanceHidden} />}
        />
        <YAxis hide type="number" domain={[minValue, maxValue]} />
        <Area
          isAnimationActive={true}
          animationDuration={300}
          animationEasing="ease-out"
          connectNulls={true}
          type="monotone"
          dataKey="totalValue"
          stroke="hsl(var(--success))"
          fillOpacity={1}
          fill="url(#colorUv)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
