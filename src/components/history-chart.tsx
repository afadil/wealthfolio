import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { formatDate } from "@/lib/utils";
import { AmountDisplay } from "@wealthfolio/ui";
import { useState } from "react";
import { Area, AreaChart, Tooltip, YAxis } from "recharts";

interface HistoryChartData {
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

  const totalValueData = payload.find(
    (item): item is TooltipEntry & { dataKey: "totalValue"; payload: HistoryChartData } =>
      item?.dataKey === "totalValue" && item.payload !== undefined,
  );
  const netContributionData = payload.find(
    (item): item is TooltipEntry & { dataKey: "netContribution"; payload: HistoryChartData } =>
      item?.dataKey === "netContribution" && item.payload !== undefined,
  );

  const tvPayload = totalValueData?.payload;
  const ncPayload = netContributionData?.payload;

  if (!tvPayload) {
    return null;
  }

  return (
    <div className="bg-popover grid grid-cols-1 gap-1.5 rounded-md border p-2 shadow-md">
      <p className="text-muted-foreground text-xs">{formatDate(tvPayload.date)}</p>

      <div className="flex items-center justify-between space-x-2">
        <div className="flex items-center space-x-1.5">
          <span className="block h-0.5 w-3" style={{ backgroundColor: "var(--success)" }} />
          <span className="text-muted-foreground text-xs">Total Value:</span>
        </div>
        <AmountDisplay
          value={tvPayload.totalValue}
          currency={tvPayload.currency}
          isHidden={isBalanceHidden}
          className="text-xs font-semibold"
        />
      </div>
      {isChartHovered && ncPayload && (
        <div className="flex items-center justify-between space-x-2">
          <div className="flex items-center space-x-1.5">
            <span
              className="block h-0 w-3 border-b-2 border-dashed"
              style={{ borderColor: "var(--muted-foreground)" }}
            />
            <span className="text-muted-foreground text-xs">Net Deposit:</span>
          </div>
          <AmountDisplay
            value={ncPayload.netContribution}
            currency={ncPayload.currency}
            isHidden={isBalanceHidden}
            className="text-xs font-semibold"
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
    return null;
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
          content={(props) => (
            <CustomTooltip
              {...(props as TooltipBaseProps)}
              isBalanceHidden={isBalanceHidden}
              isChartHovered={isChartHovered}
            />
          )}
        />
        <YAxis hide type="number" domain={["auto", "auto"]} />
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
