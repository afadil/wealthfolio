import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import type { Holding } from "@/lib/types";
import { DonutChartCompact } from "@wealthfolio/ui";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

interface SubPieChartProps {
  holdings: Holding[];
  baseCurrency: string;
}

interface PieDataItem {
  name: string;
  value: number;
  currency: string;
  symbol: string;
}

export function SubPieChart({ holdings, baseCurrency }: SubPieChartProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const navigate = useNavigate();

  const pieData = useMemo<PieDataItem[]>(() => {
    const data = holdings
      .filter((h) => h.marketValue?.base && h.marketValue.base > 0)
      .map((holding) => ({
        name: holding.instrument?.symbol || "Unknown",
        value: holding.marketValue?.base || 0,
        currency: baseCurrency,
        symbol: holding.instrument?.symbol || "",
      }))
      .sort((a, b) => b.value - a.value);

    return data;
  }, [holdings, baseCurrency]);

  const [activeIndex, setActiveIndex] = useState(0);

  const handleSectionClick = (
    _sectionData: { name: string; value: number; currency: string },
    index: number,
  ) => {
    setActiveIndex(index);
    // Navigate to holding detail page on click
    const item = pieData[index];
    if (item?.symbol) {
      navigate(`/holdings/${item.symbol}`);
    }
  };

  // Empty state
  if (pieData.length === 0) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        No holdings in this asset class
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-center py-2">
      <div style={{ width: "200px", height: "200px" }}>
        <DonutChartCompact
          data={pieData}
          activeIndex={activeIndex}
          onSectionClick={handleSectionClick}
          startAngle={0}
          endAngle={360}
          isBalanceHidden={isBalanceHidden}
          minSliceAngle={1}
        />
      </div>
    </div>
  );
}
