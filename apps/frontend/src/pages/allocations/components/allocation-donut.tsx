import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer } from "@wealthfolio/ui/components/ui/chart";
import { formatAmount } from "@wealthfolio/ui";
import { cn } from "@wealthfolio/ui/lib/utils";

interface AllocationDataItem {
  id: string;
  name: string;
  value: number;
  color: string;
}

interface AllocationDonutProps {
  targetData: AllocationDataItem[];
  currentData: AllocationDataItem[];
  totalValue?: number;
  currency?: string;
  onCategoryClick?: (categoryId: string) => void;
  className?: string;
}

export function AllocationDonut({
  targetData,
  currentData,
  totalValue = 0,
  currency = "USD",
  onCategoryClick,
  className,
}: AllocationDonutProps) {
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
  const totalTarget = useMemo(() => targetData.reduce((sum, d) => sum + d.value, 0), [targetData]);

  // Calculate drift status for active item
  const activeStatus = useMemo(() => {
    if (!activeItem) return null;

    const currentPercent = totalCurrent > 0 ? (activeItem.value / totalCurrent) * 100 : 0;
    const targetItem = targetData.find((t) => t.id === activeItem.id);
    const targetPercent =
      targetItem && totalTarget > 0 ? (targetItem.value / totalTarget) * 100 : 0;

    if (targetPercent === 0) return null; // No target set

    const drift = currentPercent - targetPercent;

    if (drift > 5) {
      return { label: "Overweight", color: "text-red-600 dark:text-red-400", icon: ArrowUp };
    }
    if (drift < -5) {
      return { label: "Underweight", color: "text-blue-600 dark:text-blue-400", icon: ArrowDown };
    }
    return { label: "Aligned", color: "text-green-600 dark:text-green-400", icon: Minus };
  }, [activeItem, totalCurrent, targetData, totalTarget]);

  const hasData = targetData.length > 0 || currentData.length > 0;

  if (!hasData) {
    return (
      <div className={cn("h-70 flex items-center justify-center", className)}>
        <p className="text-muted-foreground text-sm">No allocation data</p>
      </div>
    );
  }

  return (
    <div className={cn("relative max-h-full max-w-full", className)}>
      <ChartContainer config={{}} className="aspect-square h-full w-full [&>div]:aspect-square">
        <PieChart
          onMouseLeave={handleMouseLeave}
          margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          {/* Single ring: Current allocation */}
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
        </PieChart>
      </ChartContainer>

      {/* Center label */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          {activeItem ? (
            <>
              <p className="text-muted-foreground text-xs">{activeItem.name}</p>
              <p className="text-foreground text-xl font-bold">
                {totalCurrent > 0 ? ((activeItem.value / totalCurrent) * 100).toFixed(1) : "0.0"}%
              </p>
              <p className="text-muted-foreground text-sm">
                {formatAmount((activeItem.value / totalCurrent) * totalValue, currency)}
              </p>
              {activeStatus && (
                <div
                  className={cn(
                    "mt-1 flex items-center justify-center gap-1 text-xs font-semibold",
                    activeStatus.color,
                  )}
                >
                  <activeStatus.icon size={14} />
                  {activeStatus.label}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-[10px] uppercase">Total Portfolio</p>
              <p className="text-foreground text-lg font-bold">
                {formatAmount(totalValue, currency)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
