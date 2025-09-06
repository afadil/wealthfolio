import { TimePeriod } from '@/lib/types';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { formatAmount } from '@wealthfolio/ui';
import { formatDate } from '@/lib/utils';

type CustomTooltipProps = {
  active: boolean;
  payload: { value: number; payload: any }[];
};

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="center-items">
        <p className="font-thin">{formatDate(data.timestamp)}</p>
        <p className="label">{formatAmount(payload[0].value, data.currency, false)}</p>
      </div>
    );
  }

  return null;
};

interface HistoryChartData {
  timestamp: string;
  totalValue: number;
  currency: string;
}

export default function HistoryChart({
  data,
  interval,
  height = 350,
}: {
  data: HistoryChartData[];
  interval?: TimePeriod;
  height?: number;
}) {
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-grow">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart
            data={data}
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
                <stop offset="5%" stopColor="var(--success)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--success)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            {/* @ts-ignore */}
            <Tooltip content={<CustomTooltip />} />
            {interval !== 'ALL' && interval !== '1Y' ? (
              <YAxis hide={true} type="number" domain={['auto', 'auto']} />
            ) : null}
            <Area
              isAnimationActive={true}
              animationDuration={300}
              animationEasing="ease-out"
              connectNulls={true}
              type="monotone"
              dataKey="totalValue"
              stroke="var(--success)"
              fillOpacity={1}
              fill="url(#colorUv)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
