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
  "var(--chart-10)",
  "var(--chart-11)",
  "var(--chart-12)",
  "var(--chart-13)",
  "var(--chart-14)",
  "var(--chart-15)",
];

/**
 * Get color based on percentage value (not index position)
 * Higher % = darker (chart-1), Lower % = lighter (chart-15)
 * Darkest color starts at >=70%, more granularity for smaller values
 */
function getColorByPercent(percent: number): string {
  // Map percentage (0-100) to color index (0-14)
  // >=70% -> index 0 (darkest), <5% -> index 14 (lightest)
  // 15 colors with more granularity for smaller percentages
  if (percent >= 70) return COLORS[0];
  if (percent >= 60) return COLORS[1];
  if (percent >= 50) return COLORS[2];
  if (percent >= 40) return COLORS[3];
  if (percent >= 30) return COLORS[4];
  if (percent >= 25) return COLORS[5];
  if (percent >= 20) return COLORS[6];
  if (percent >= 15) return COLORS[7];
  if (percent >= 12) return COLORS[8];
  if (percent >= 10) return COLORS[9];
  if (percent >= 8) return COLORS[10];
  if (percent >= 6) return COLORS[11];
  if (percent >= 4) return COLORS[12];
  if (percent >= 2) return COLORS[13];
  return COLORS[14]; // <2% = lightest
}

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
      <p className="text-muted-foreground text-[10px] font-medium">{activeData.name}</p>
      <p className="text-foreground text-[10px] font-bold">
        <AmountDisplay value={activeData.value} currency={activeData.currency} isHidden={isBalanceHidden} />
      </p>
      <p className="text-muted-foreground text-[9px]">({formatPercent(percent)})</p>
      {status && (
        <div className={`mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold ${status.color}`}>
          {status.label === "Overweight" && <ArrowUp size={10} />}
          {status.label === "Underweight" && <ArrowDown size={10} />}
          {status.label === "In Line" && <Minus size={10} />}
          {status.label}
        </div>
      )}
    </div>
  );
};

interface DonutChartCompactProps {
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

export const DonutChartCompact: React.FC<DonutChartCompactProps> = ({
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

  // Calculate colors based on percentage for each slice
  const sliceColors = useMemo(() => {
    return data.map((item) => {
      const percent = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
      return getColorByPercent(percent);
    });
  }, [data, totalValue]);

  const displayIndex = hoverIndex ?? activeIndex;
  const activeData = data[displayIndex];
  const displayStatus = data[displayIndex]?.status || status;
  const activeColor = sliceColors[displayIndex] || COLORS[0];

  const handlePieEnter = (_: React.MouseEvent, index: number) => {
    setHoverIndex(index);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  return (
    <div className="relative h-full w-full p-0">
      <ChartContainer config={{}} className="h-full w-full">
        <PieChart onMouseLeave={handleMouseLeave} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          {/* Main pie chart - scaled down dimensions */}
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={85}
            paddingAngle={4}
            cornerRadius={4}
            dataKey="value"
            nameKey="name"
            startAngle={startAngle}
            endAngle={endAngle}
            minAngle={minSliceAngle}
            onMouseEnter={handlePieEnter}
            onClick={(_event, index) => {
              onSectionClick(data[index], index);
            }}
            isAnimationActive={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={sliceColors[index]} />
            ))}
          </Pie>

          {/* Active selection ring - scaled down dimensions */}
          {activeData && (
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={88}
              outerRadius={91}
              paddingAngle={4}
              cornerRadius={4}
              startAngle={startAngle}
              endAngle={endAngle}
              minAngle={minSliceAngle}
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
