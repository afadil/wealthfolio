import { ChartConfig, ChartContainer } from "@wealthfolio/ui/components/ui/chart";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { formatDate } from "@/lib/utils";
import { AmountDisplay } from "@wealthfolio/ui";
import { Area, AreaChart, Tooltip, YAxis } from "recharts";
import type { NetWorthHistoryPoint } from "@/lib/types";

// Goldish orange for net worth chart (consistent across light/dark modes)
const CHART_COLOR = "hsl(38, 75%, 50%)";

interface ChartDataPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  currency: string;
}

interface TooltipEntry {
  dataKey?: string | number;
  payload?: ChartDataPoint;
}

interface TooltipBaseProps {
  active?: boolean;
  payload?: TooltipEntry[];
}

interface CustomTooltipProps extends TooltipBaseProps {
  isBalanceHidden: boolean;
}

const CustomTooltip = ({ active, payload, isBalanceHidden }: CustomTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0]?.payload;
  if (!entry) {
    return null;
  }

  const hasLiabilities = entry.totalLiabilities > 0;

  return (
    <div className="bg-popover grid grid-cols-1 gap-1.5 rounded-md border p-2 shadow-md">
      <p className="text-muted-foreground text-xs">{formatDate(entry.date)}</p>

      {/* Net Worth - primary value */}
      <div className="flex items-center justify-between space-x-4">
        <div className="flex items-center space-x-1.5">
          <span className="block h-0.5 w-3" style={{ backgroundColor: CHART_COLOR }} />
          <span className="text-muted-foreground text-xs">Net Worth:</span>
        </div>
        <AmountDisplay
          value={entry.netWorth}
          currency={entry.currency}
          isHidden={isBalanceHidden}
          className="text-xs font-semibold"
        />
      </div>

      {/* Show breakdown only if there are liabilities (otherwise net worth = assets) */}
      {hasLiabilities && (
        <div className="border-border mt-1 border-t pt-1.5">
          <div className="flex items-center justify-between space-x-4">
            <span className="text-muted-foreground/70 text-xs">Assets:</span>
            <AmountDisplay
              value={entry.totalAssets}
              currency={entry.currency}
              isHidden={isBalanceHidden}
              className="text-muted-foreground text-xs"
            />
          </div>
          <div className="flex items-center justify-between space-x-4">
            <span className="text-muted-foreground/70 text-xs">Liabilities:</span>
            <span className="text-muted-foreground text-xs">
              -
              <AmountDisplay
                value={entry.totalLiabilities}
                currency={entry.currency}
                isHidden={isBalanceHidden}
                className="inline text-xs"
              />
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Transform NetWorthHistoryPoint data to chart-compatible format
 */
function transformData(data: NetWorthHistoryPoint[]): ChartDataPoint[] {
  return data.map((point) => ({
    date: point.date,
    netWorth: parseFloat(point.netWorth) || 0,
    totalAssets: parseFloat(point.totalAssets) || 0,
    totalLiabilities: parseFloat(point.totalLiabilities) || 0,
    currency: point.currency,
  }));
}

interface NetWorthChartProps {
  data: NetWorthHistoryPoint[];
  isLoading?: boolean;
}

export function NetWorthChart({ data, isLoading }: NetWorthChartProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const isMobile = useIsMobileViewport();

  const chartData = transformData(data);

  const chartConfig = {
    netWorth: {
      label: "Net Worth",
    },
  } satisfies ChartConfig;

  if (isLoading || chartData.length === 0) {
    return null;
  }

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <AreaChart
        data={chartData}
        margin={{
          top: 0,
          right: 0,
          left: 0,
          bottom: 0,
        }}
      >
        <defs>
          <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLOR} stopOpacity={0.4} />
            <stop offset="95%" stopColor={CHART_COLOR} stopOpacity={0.15} />
          </linearGradient>
        </defs>
        <Tooltip
          position={isMobile ? { y: 60 } : { y: -20 }}
          content={(props) => (
            <CustomTooltip
              {...(props as unknown as TooltipBaseProps)}
              isBalanceHidden={isBalanceHidden}
            />
          )}
        />
        <YAxis hide type="number" domain={["auto", "auto"]} />

        {/* Net Worth (main filled area) */}
        <Area
          isAnimationActive={true}
          animationDuration={300}
          animationEasing="ease-out"
          connectNulls={true}
          type="monotone"
          dataKey="netWorth"
          stroke={CHART_COLOR}
          fillOpacity={1}
          fill="url(#netWorthGradient)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
