import type React from "react";
import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import type { NameType, Payload, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { useBalancePrivacy } from "../../hooks/use-balance-privacy";
import { formatPercent } from "../../lib/utils";
import { AmountDisplay } from "../financial/amount-display";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
];

interface ChartCenterLabelProps {
  activeData: { name: string; value: number; currency: string } | undefined;
  totalValue: number;
  isBalanceHidden: boolean;
}

const ChartCenterLabel: React.FC<ChartCenterLabelProps> = ({ activeData, totalValue, isBalanceHidden }) => {
  if (!activeData) {
    return null;
  }

  const percent = totalValue > 0 ? activeData.value / totalValue : 0;

  return (
    <div className="pointer-events-none absolute top-[108px] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
      <p className="text-muted-foreground text-xs font-medium">{activeData.name}</p>
      <p className="text-foreground text-xs font-bold">
        <AmountDisplay value={activeData.value} currency={activeData.currency} isHidden={isBalanceHidden} />
      </p>
      <p className="text-muted-foreground text-xs">({formatPercent(percent)})</p>
    </div>
  );
};

interface DonutChartProps {
  data: { name: string; value: number; currency: string }[];
  activeIndex: number;
  onSectionClick?: (data: { name: string; value: number; currency: string }, index: number) => void;
  startAngle?: number;
  endAngle?: number;
  displayTooltip?: boolean;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  activeIndex,
  onSectionClick,
  startAngle = 180,
  endAngle = 0,
  displayTooltip = false,
}) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handlePieEnter = (_: React.MouseEvent, index: number) => {
    setHoverIndex(index);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const totalValue = useMemo(() => data.reduce((acc, item) => acc + item.value, 0), [data]);
  const displayIndex = hoverIndex ?? activeIndex;
  const activeData = data[displayIndex];
  const activeColor = COLORS[displayIndex % COLORS.length];

  const tooltipFormatter = (value: ValueType, name: NameType, entry: Payload<ValueType, NameType>) => {
    const payload = entry.payload as { currency: string };
    return (
      <div className="flex flex-col">
        <span className="text-muted-foreground text-[0.70rem] uppercase">{name}</span>
        <span className="font-bold">
          <AmountDisplay value={Number(value)} currency={payload.currency} isHidden={isBalanceHidden} />
        </span>
      </div>
    );
  };

  type PieComponentProps = ComponentProps<typeof Pie>;

  const pieProps = {
    data,
    cy: "80%",
    innerRadius: "110%",
    outerRadius: "140%",
    paddingAngle: 4,
    cornerRadius: 6,
    dataKey: "value",
    nameKey: "name",
    onMouseEnter: handlePieEnter,
    onClick: (_event, index) => {
      if (onSectionClick && data[index]) {
        onSectionClick(data[index], index);
      }
    },
    startAngle,
    endAngle,
    isAnimationActive: false,
  } as PieComponentProps;

  return (
    <div className="relative h-[160px] w-full p-0">
      <ChartContainer config={{}} className="h-full w-full">
        <PieChart onMouseLeave={handleMouseLeave} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          {displayTooltip && (
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.3 }}
              content={<ChartTooltipContent formatter={tooltipFormatter} hideLabel hideIndicator />}
              position={{ y: 0 }}
            />
          )}
          <Pie {...pieProps}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          {activeData && (
            <Pie
              data={data}
              dataKey="value"
              cy="80%"
              innerRadius="143%"
              outerRadius="145%"
              paddingAngle={6}
              cornerRadius={6}
              startAngle={startAngle}
              endAngle={endAngle}
              isAnimationActive={false}
            >
              {data.map((_, index) => (
                <Cell key={`active-ring-${index}`} fill={index === displayIndex ? activeColor : "transparent"} />
              ))}
            </Pie>
          )}
        </PieChart>
      </ChartContainer>
      <ChartCenterLabel activeData={activeData} totalValue={totalValue} isBalanceHidden={isBalanceHidden} />
    </div>
  );
};
