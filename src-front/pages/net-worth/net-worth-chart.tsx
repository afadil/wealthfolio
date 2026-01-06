import { ChartConfig, ChartContainer } from "@wealthfolio/ui/components/ui/chart";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { formatDate } from "@/lib/utils";
import { AmountDisplay } from "@wealthfolio/ui";
import { useState } from "react";
import { Area, AreaChart, Tooltip, YAxis } from "recharts";
import type { NetWorthHistoryPoint } from "@/lib/types";

// Muted tan/gold for net worth chart (consistent across light/dark modes)
const CHART_COLOR = "hsl(35, 45%, 65%)";

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
  showDetails: boolean;
}

const CustomTooltip = ({
  active,
  payload,
  isBalanceHidden,
  showDetails,
}: CustomTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0]?.payload;
  if (!entry) {
    return null;
  }

  return (
    <div className="bg-popover grid grid-cols-1 gap-1.5 rounded-md border p-2 shadow-md">
      <p className="text-muted-foreground text-xs">{formatDate(entry.date)}</p>

      <div className="flex items-center justify-between space-x-2">
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

      {showDetails && (
        <>
          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-1.5">
              <span className="block h-0 w-3 border-b-2 border-dashed border-[var(--success)]" />
              <span className="text-muted-foreground text-xs">Assets:</span>
            </div>
            <AmountDisplay
              value={entry.totalAssets}
              currency={entry.currency}
              isHidden={isBalanceHidden}
              className="text-success text-xs font-semibold"
            />
          </div>

          {entry.totalLiabilities > 0 && (
            <div className="flex items-center justify-between space-x-2">
              <div className="flex items-center space-x-1.5">
                <span className="block h-0 w-3 border-b-2 border-dashed border-[var(--destructive)]" />
                <span className="text-muted-foreground text-xs">Liabilities:</span>
              </div>
              <AmountDisplay
                value={entry.totalLiabilities}
                currency={entry.currency}
                isHidden={isBalanceHidden}
                className="text-destructive text-xs font-semibold"
              />
            </div>
          )}
        </>
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
  const [isChartHovered, setIsChartHovered] = useState(false);
  const isMobile = useIsMobileViewport();

  const chartData = transformData(data);

  const chartConfig = {
    netWorth: {
      label: "Net Worth",
    },
    totalAssets: {
      label: "Total Assets",
    },
    totalLiabilities: {
      label: "Total Liabilities",
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
        onMouseEnter={() => setIsChartHovered(true)}
        onMouseLeave={() => setIsChartHovered(false)}
      >
        <defs>
          <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLOR} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLOR} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Tooltip
          position={isMobile ? { y: 60 } : { y: -20 }}
          content={(props) => (
            <CustomTooltip
              {...(props as unknown as TooltipBaseProps)}
              isBalanceHidden={isBalanceHidden}
              showDetails={isChartHovered}
            />
          )}
        />
        <YAxis hide type="number" domain={["auto", "auto"]} />

        {/* Assets line (dashed, shown on hover) */}
        <Area
          isAnimationActive={true}
          animationDuration={300}
          animationEasing="ease-out"
          connectNulls={true}
          type="monotone"
          dataKey="totalAssets"
          stroke="var(--success)"
          fill="transparent"
          strokeDasharray="5 5"
          strokeOpacity={isChartHovered ? 0.6 : 0}
        />

        {/* Liabilities line (dashed, shown on hover) */}
        <Area
          isAnimationActive={true}
          animationDuration={300}
          animationEasing="ease-out"
          connectNulls={true}
          type="monotone"
          dataKey="totalLiabilities"
          stroke="var(--destructive)"
          fill="transparent"
          strokeDasharray="5 5"
          strokeOpacity={isChartHovered ? 0.6 : 0}
        />

        {/* Net Worth (main filled area) - orange color */}
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
