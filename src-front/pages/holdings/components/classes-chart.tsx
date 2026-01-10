import { Holding, HoldingType } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DonutChart,
  EmptyPlaceholder,
  Skeleton,
} from "@wealthfolio/ui";
import { useMemo, useState } from "react";

function getClassData(holdings: Holding[]) {
  if (!holdings?.length) return [];

  const currency = holdings[0]?.baseCurrency || "USD";

  const classes = holdings.reduce(
    (acc, holding) => {
      const isCash = holding.holdingType === HoldingType.CASH;
      // Use taxonomy-based assetType classification
      const assetType = isCash
        ? "Cash"
        : holding.instrument?.classifications?.assetType?.name || "Other";

      const current = acc[assetType] || 0;
      const value = Number(holding.marketValue?.base) || 0;
      acc[assetType] = current + value;
      return acc;
    },
    {} as Record<string, number>,
  );

  return Object.entries(classes)
    .filter(([_, value]) => value > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, currency }));
}

interface ClassesChartProps {
  holdings?: Holding[];
  isLoading?: boolean;
  onClassSectionClick?: (className: string) => void;
}

export function ClassesChart({ holdings, isLoading, onClassSectionClick }: ClassesChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const data = useMemo(() => getClassData(holdings ?? []), [holdings]);

  const handleInternalSectionClick = (sectionData: {
    name: string;
    value: number;
    currency: string;
  }) => {
    if (onClassSectionClick) {
      onClassSectionClick(sectionData.name);
    }
    const clickedIndex = data.findIndex((d) => d.name === sectionData.name);
    if (clickedIndex !== -1) {
      setActiveIndex(clickedIndex);
    }
  };

  if (isLoading) {
    return (
      <Card className="overflow-hidden backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-[180px]" />
            <Skeleton className="h-5 w-[80px]" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex h-[250px] items-center justify-center">
            <Skeleton className="h-[200px] w-[200px] rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            Asset Allocation
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length > 0 ? (
          <DonutChart
            data={data}
            activeIndex={activeIndex}
            onSectionClick={handleInternalSectionClick}
            startAngle={180}
            endAngle={0}
          />
        ) : (
          <EmptyPlaceholder description="There is no class data available for your holdings." />
        )}
      </CardContent>
    </Card>
  );
}
