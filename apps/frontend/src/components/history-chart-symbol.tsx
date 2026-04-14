import { TimePeriod } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { formatAmount } from "@wealthfolio/ui";
import type { MouseHandlerDataParam } from "recharts/types/synchronisation/types";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface CustomTooltipProps<TPayload = { timestamp: string; currency: string }> {
  active: boolean;
  payload: { value: number; payload: TPayload }[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload?.length) {
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
  onPointClick,
}: {
  data: HistoryChartData[];
  interval?: TimePeriod;
  height?: number;
  /** ISO timestamp of the clicked quote (from chart payload). */
  onPointClick?: (timestampIso: string) => void;
}) {
  const handleChartClick = (chartState: MouseHandlerDataParam) => {
    if (!onPointClick) return;
    const label = chartState.activeLabel;
    if (label == null) return;
    const asString = String(label);
    if (!asString) return;
    onPointClick(asString);
  };

  return (
    <div className={`relative flex h-full flex-col ${onPointClick ? "cursor-pointer" : ""}`}>
      <div className="grow">
        <ResponsiveContainer width="100%" height="100%" minHeight={height}>
          <AreaChart
            data={data}
            stackOffset="sign"
            margin={{
              top: 0,
              right: 0,
              left: 0,
              bottom: 0,
            }}
            onClick={onPointClick ? handleChartClick : undefined}
          >
            <defs>
              <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--success)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--success)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            {/* @ts-expect-error - Recharts Tooltip content typing mismatch */}
            <Tooltip content={<CustomTooltip />} />
            {interval &&
            interval !== "ALL" &&
            interval !== "1Y" &&
            interval !== "3Y" &&
            interval !== "5Y" ? (
              <YAxis hide={true} type="number" domain={["auto", "auto"]} />
            ) : null}
            <XAxis dataKey="timestamp" type="category" hide />
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
              style={{ pointerEvents: "none" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
