import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { formatDate } from "@/lib/utils";
import { AmountDisplay } from "@wealthfolio/ui";
import { useState } from "react";
import { Area, AreaChart, Tooltip, YAxis } from "recharts";

export interface HistoryChartData {
  date: string;
  totalValue: number;
  netContribution: number;
  currency: string;
}

interface TooltipEntry {
  dataKey?: string | number;
  payload?: HistoryChartData;
}

interface TooltipBaseProps {
  active?: boolean;
  payload?: TooltipEntry[];
}

interface CustomTooltipProps extends TooltipBaseProps {
  isBalanceHidden: boolean;
  isChartHovered: boolean;
}

const CustomTooltip = ({
  active,
  payload,
  isBalanceHidden,
  isChartHovered,
}: CustomTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const firstPayload = payload[0]?.payload;
  if (!firstPayload) {
    return null;
  }

  const totalValue = firstPayload.totalValue;
  const netContribution = firstPayload.netContribution;
  const currency = firstPayload.currency;

  return (
    <div className="bg-popover grid grid-cols-1 gap-1.5 rounded-md border p-2 shadow-md">
      <p className="text-muted-foreground text-xs">{formatDate(firstPayload.date)}</p>

      <div className="flex items-center justify-between space-x-2">
        <div className="flex items-center space-x-1.5">
          <span className="block h-0.5 w-3" style={{ backgroundColor: "var(--success)" }} />
          <span className="text-muted-foreground text-xs font-semibold">Total Value:</span>
        </div>
        <AmountDisplay
          value={totalValue}
          currency={currency}
          isHidden={isBalanceHidden}
          className="text-xs font-semibold"
        />
      </div>

      {isChartHovered && netContribution !== undefined && (
        <div className="flex items-center justify-between space-x-2 border-t pt-1 mt-1">
          <div className="flex items-center space-x-1.5">
            <span
              className="block h-0 w-3 border-b-2 border-dashed"
              style={{ borderColor: "var(--muted-foreground)" }}
            />
            <span className="text-muted-foreground text-xs">Net Deposit:</span>
          </div>
          <AmountDisplay
            value={netContribution}
            currency={currency}
            isHidden={isBalanceHidden}
            className="text-xs"
          />
        </div>
      )}
    </div>
  );
};

export function HistoryChart({
  data,
  isLoading,
}: {
  data: HistoryChartData[];
  isLoading?: boolean;
}) {
  const { isBalanceHidden } = useBalancePrivacy();
  const [isChartHovered, setIsChartHovered] = useState(false);

  const chartConfig = {
    totalValue: {
      label: "Total Value",
    },
    netContribution: {
      label: "Net Contribution",
    },
  } satisfies ChartConfig;

  if (isLoading && data.length === 0) {
    return <Skeleton className="h-full w-full" />;
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
            <stop offset="5%" stopColor="var(--success)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--success)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Tooltip
          position={{ y: -20 }}
          cursor={false}
          content={(props) => (
            <CustomTooltip
              {...(props as TooltipBaseProps)}
              isBalanceHidden={isBalanceHidden}
              isChartHovered={isChartHovered}
            />
          )}
        />
        <YAxis
          type="number"
          domain={["auto", "auto"]}
          mirror={true}
          tickFormatter={(value) => {
            if (isBalanceHidden) return "****";
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
            return value.toFixed(0);
          }}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={55}
        />

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

        {/* Net contribution line (always shown on hover) */}
        <Area
          isAnimationActive={true}
          animationDuration={300}
          animationEasing="ease-out"
          connectNulls={true}
          type="monotone"
          dataKey="netContribution"
          stroke="var(--muted-foreground)"
          fill="transparent"
          strokeDasharray="5 5"
          strokeOpacity={isChartHovered ? 0.8 : 0}
        />
      </AreaChart>
    </ChartContainer>
  );
}
