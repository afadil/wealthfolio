import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import type { AssetClassTarget } from "@/lib/types";
import { DonutChartExpandable } from "@wealthfolio/ui";
import { useMemo, useState } from "react";
import type { CurrentAllocation } from "../hooks/use-current-allocation";

interface DonutChartFullProps {
  currentAllocation: CurrentAllocation;
  targets: AssetClassTarget[];
  onSliceClick: (assetClass: string) => void;
  baseCurrency: string;
}

interface PieDataItem {
  name: string;
  value: number;
  currency: string;
  status?: { label: string; color: string };
}

export function DonutChartFull({
  currentAllocation,
  targets,
  onSliceClick,
  baseCurrency,
}: DonutChartFullProps) {
  const { isBalanceHidden } = useBalancePrivacy();

  const pieData = useMemo<PieDataItem[]>(() => {
    const totalValue = currentAllocation.assetClasses.reduce((sum, ac) => sum + ac.currentValue, 0);

    const mappedData = currentAllocation.assetClasses
      .map((ac) => {
        const target = targets.find((t) => t.assetClass === ac.assetClass);
        const currentPercent = totalValue > 0 ? (ac.currentValue / totalValue) * 100 : 0;
        const targetPercent = target?.targetPercent || 0;
        const diff = currentPercent - targetPercent;

        let status: { label: string; color: string } | undefined;
        if (target && targetPercent > 0) {
          if (diff > 2) {
            status = { label: "Overweight", color: "text-red-600" };
          } else if (diff < -2) {
            status = { label: "Underweight", color: "text-blue-600" };
          } else {
            status = { label: "In Line", color: "text-green-600" };
          }
        }

        return {
          name: ac.assetClass,
          value: ac.currentValue,
          currency: baseCurrency,
          status,
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    return mappedData;
  }, [currentAllocation, targets, baseCurrency]);

  const [activeIndex, setActiveIndex] = useState(0);

  const handleSectionClick = (sectionData: PieDataItem, index: number) => {
    setActiveIndex(index);
    onSliceClick(sectionData.name);
  };

  if (!pieData || pieData.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <p className="text-muted-foreground">No allocation data available</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div style={{ height: "100%", width: "100%" }}></div>
      <DonutChartExpandable
        data={pieData}
        activeIndex={activeIndex}
        onSectionClick={handleSectionClick}
        startAngle={0}
        endAngle={360}
        isBalanceHidden={isBalanceHidden}
        status={pieData[activeIndex]?.status}
        minSliceAngle={2}
      />
    </div>
  );
}
