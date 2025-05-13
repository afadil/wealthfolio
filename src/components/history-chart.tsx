import { useMemo, useState } from 'react';
import { Area, AreaChart, Tooltip, YAxis, TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatDate } from '@/lib/utils';
import { ChartConfig, ChartContainer } from './ui/chart';
import { useBalancePrivacy } from '@/context/privacy-context';
import { AmountDisplay } from './amount-display';
import { Skeleton } from './ui/skeleton';

type CustomTooltipProps = TooltipProps<ValueType, NameType> & {
  isBalanceHidden: boolean;
};

const CustomTooltip = ({ active, payload, isBalanceHidden, isChartHovered }: CustomTooltipProps & { isChartHovered: boolean }) => {
  if (active && payload && payload.length > 0) {
    const totalValueData = payload.find(p => p.dataKey === 'totalValue');
    const netContributionData = payload.find(p => p.dataKey === 'netContribution');

    if (totalValueData?.payload) {
      return (
          <div className="grid grid-cols-1 gap-1.5 rounded-md border bg-popover p-2 shadow-md">
            <p className="text-xs text-muted-foreground">
              {formatDate(totalValueData.payload.date)}
            </p>
            
            <div className="flex items-center justify-between space-x-2">
              <div className="flex items-center space-x-1.5">
                <span className="block h-0.5 w-3" style={{ backgroundColor: 'hsl(var(--success))' }} />
                <span className="text-xs text-muted-foreground">Total Value:</span>
              </div>
              <AmountDisplay
                value={totalValueData.payload.totalValue}
                currency={totalValueData.payload.currency}
                isHidden={isBalanceHidden}
                className="text-xs font-semibold"
              />
            </div>
            {isChartHovered && netContributionData?.payload && (
              <div className="flex items-center justify-between space-x-2">
                 <div className="flex items-center space-x-1.5">
                  <span className="block h-0 w-3 border-b-2 border-dashed" style={{ borderColor: 'hsl(var(--muted-foreground))' }} />
                  <span className="text-xs text-muted-foreground">Net Deposit:</span>
                </div>
                <AmountDisplay
                  value={netContributionData.payload.netContribution}
                  currency={netContributionData.payload.currency}
                  isHidden={isBalanceHidden}
                  className="text-xs font-semibold"
                />
              </div>
            )}
          </div>
      );
    }
  }

  return null;
};

interface HistoryChartData {
  date: string;
  totalValue: number;
  netContribution: number;
  currency: string;
}

export function HistoryChart({
  data,
  isLoading,
}: {
  data: HistoryChartData[];
  isLoading?: boolean;
}) {
  const { isBalanceHidden } = useBalancePrivacy();
  const [isChartHovered, setIsChartHovered] = useState(false);

  // Calculate min and max values for better domain control
  const minValue = useMemo(() => {
    if (!data.length) return 0;
    const min = Math.min(...data.map((d) => Number(d.totalValue)));
    // Return 0 if min is negative,
    return min < 0 ? 0 : min ;
  }, [data]);

  const maxValue = useMemo(() => {
    if (!data.length) return 0;
    const max = data.reduce((max, d) => Math.max(max, Number(d.totalValue)), -Infinity);
    // Return max with 1% padding,
    return max * 1.01;
  }, [data]);
  
  const chartConfig = {
    totalValue: {
      label: 'Total Value',
    },
    netContribution: {
      label: 'Net Contribution',
    },
  } satisfies ChartConfig;

  // Conditional rendering for loading state
  if (isLoading && data.length === 0) {
    return (
      <Skeleton className="h-full w-full" />
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <AreaChart
        data={data}
        stackOffset="sign"
        margin={{
          top: 0,
          right: 0,
          left: 0,
          bottom: 0,
        }}
        onMouseEnter={() => setIsChartHovered(true)}
        onMouseLeave={() => setIsChartHovered(false)}
      >
        <defs>
          <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
            <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Tooltip
          position={{ y: -20 }}
          content={(props) => <CustomTooltip {...props} isBalanceHidden={isBalanceHidden} isChartHovered={isChartHovered} />}
        />
        <YAxis hide type="number" domain={[minValue, maxValue]} />
          {/* <YAxis hide type="number" domain={['auto', 'auto']} /> */}
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
        <Area
          isAnimationActive={true}
          animationDuration={300}
          animationEasing="ease-out"
          connectNulls={true}
          type="monotone"
          dataKey="netContribution"
          stroke="hsl(var(--muted-foreground))"
          fill="transparent"
          strokeDasharray="5 5"
          strokeOpacity={isChartHovered ? 0.8 : 0}
        />
      </AreaChart>
    </ChartContainer>
  );
}
