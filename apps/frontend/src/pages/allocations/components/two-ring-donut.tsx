import { useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer } from "@wealthfolio/ui/components/ui/chart";
import { cn } from "@wealthfolio/ui/lib/utils";

interface RingDataItem {
  id: string;
  name: string;
  value: number;
  color: string;
}

interface TwoRingDonutProps {
  targetData: RingDataItem[];
  currentData: RingDataItem[];
  onCategoryClick?: (categoryId: string) => void;
  className?: string;
}

export function TwoRingDonut({
  targetData,
  currentData,
  onCategoryClick,
  className,
}: TwoRingDonutProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleMouseEnter = (_: React.MouseEvent, index: number) => {
    setHoverIndex(index);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const handleClick = (_: unknown, index: number) => {
    if (onCategoryClick && currentData[index]) {
      onCategoryClick(currentData[index].id);
    }
  };

  // Center label shows hovered category info
  const activeItem = hoverIndex !== null ? currentData[hoverIndex] : null;
  const totalCurrent = useMemo(
    () => currentData.reduce((sum, d) => sum + d.value, 0),
    [currentData],
  );

  const hasData = targetData.length > 0 || currentData.length > 0;

  if (!hasData) {
    return (
      <div className={cn("flex h-[480px] items-center justify-center", className)}>
        <p className="text-muted-foreground text-sm">No allocation data</p>
      </div>
    );
  }

  return (
    <div className={cn("h-120 relative w-full", className)}>
      <ChartContainer config={{}} className="h-full w-full">
        <PieChart
          onMouseLeave={handleMouseLeave}
          margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          {/* Inner ring: Current allocation (thicker) */}
          <Pie
            data={currentData}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius="50%"
            outerRadius="75%"
            paddingAngle={2}
            cornerRadius={4}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            onMouseEnter={handleMouseEnter}
            onClick={handleClick}
          >
            {currentData.map((item, index) => (
              <Cell
                key={`current-${index}`}
                fill={item.color}
                opacity={hoverIndex !== null && hoverIndex !== index ? 0.4 : 1}
                style={{ cursor: onCategoryClick ? "pointer" : "default" }}
              />
            ))}
          </Pie>

          {/* Outer ring: Target allocation (thinner) */}
          <Pie
            data={targetData}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius="80%"
            outerRadius="87%"
            paddingAngle={2}
            cornerRadius={4}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {targetData.map((item, index) => (
              <Cell
                key={`target-${index}`}
                fill={item.color}
                opacity={0.5}
                style={{ cursor: onCategoryClick ? "pointer" : "default" }}
              />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      {/* Center label */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          {activeItem ? (
            <>
              <p className="text-muted-foreground text-xs">{activeItem.name}</p>
              <p className="text-foreground text-sm font-semibold">
                {totalCurrent > 0 ? ((activeItem.value / totalCurrent) * 100).toFixed(1) : "0.0"}%
              </p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-[10px]">inner = current</p>
              <p className="text-muted-foreground text-[10px]">outer = target</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
