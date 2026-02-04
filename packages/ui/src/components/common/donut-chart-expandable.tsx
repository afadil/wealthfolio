import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { formatPercent } from "../../lib/utils";
import { AmountDisplay } from "../financial/amount-display";
import { ChartContainer } from "../ui/chart";

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
  status?: { label: string; color: string } | null;
}

const ChartCenterLabel: React.FC<ChartCenterLabelProps> = ({ activeData, totalValue, isBalanceHidden, status }) => {
  if (!activeData) {
    return null;
  }

  const percent = totalValue > 0 ? activeData.value / totalValue : 0;

  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
      <p className="text-muted-foreground text-xs font-medium">{activeData.name}</p>
      <p className="text-foreground text-xs font-bold">
        <AmountDisplay value={activeData.value} currency={activeData.currency} isHidden={isBalanceHidden} />
      </p>
      <p className="text-muted-foreground text-xs">({formatPercent(percent)})</p>
      {status && (
        <div className={`mt-2 flex items-center justify-center gap-2 text-sm font-semibold ${status.color}`}>
          {status.label === "Overweight" && <ArrowUp size={16} />}
          {status.label === "Underweight" && <ArrowDown size={16} />}
          {status.label === "In Line" && <Minus size={16} />}
          {status.label}
        </div>
      )}
    </div>
  );
};

interface DonutChartExpandableProps {
  data: {
    name: string;
    value: number;
    currency: string;
    status?: { label: string; color: string };
  }[];
  activeIndex: number;
  onSectionClick: (data: { name: string; value: number; currency: string }, index: number) => void;
  startAngle?: number;
  endAngle?: number;
  isBalanceHidden?: boolean;
  status?: { label: string; color: string } | null;
  minSliceAngle?: number;
}

export const DonutChartExpandable: React.FC<DonutChartExpandableProps> = ({
  data,
  activeIndex,
  onSectionClick,
  startAngle = 0,
  endAngle = 360,
  isBalanceHidden = false,
  status,
  minSliceAngle = 8,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const totalValue = useMemo(() => data.reduce((acc, item) => acc + item.value, 0), [data]);
  const displayIndex = hoverIndex ?? activeIndex;
  const activeData = data[displayIndex];
  const displayStatus = data[displayIndex]?.status || status;
  const activeColor = COLORS[displayIndex % COLORS.length];

  const handlePieEnter = (_: React.MouseEvent, index: number) => {
    setHoverIndex(index);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  return (
    <div className="relative w-full p-0">
      <ChartContainer config={{}} className="h-200 w-full">
        <PieChart onMouseLeave={handleMouseLeave} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          {/* Main pie chart */}
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={140}
            outerRadius={250}
            paddingAngle={6}
            cornerRadius={6}
            dataKey="value"
            nameKey="name"
            startAngle={startAngle}
            endAngle={endAngle}
            minAngle={minSliceAngle} // NEW: Minimum angle ensures visibility
            onMouseEnter={handlePieEnter}
            onClick={(_event, index) => {
              onSectionClick(data[index], index);
            }}
            isAnimationActive={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>

          {/* Active selection ring - MOVED OUTSIDE */}
          {activeData && (
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={255}
              outerRadius={260}
              paddingAngle={6}
              cornerRadius={6}
              startAngle={startAngle}
              endAngle={endAngle}
              minAngle={minSliceAngle} // NEW: Match main pie
              isAnimationActive={false}
            >
              {data.map((_, index) => (
                <Cell key={`active-ring-${index}`} fill={index === displayIndex ? activeColor : "transparent"} />
              ))}
            </Pie>
          )}
        </PieChart>
      </ChartContainer>

      {/* Center label */}
      <ChartCenterLabel
        activeData={activeData}
        totalValue={totalValue}
        isBalanceHidden={isBalanceHidden}
        status={displayStatus}
      />
    </div>
  );
};
