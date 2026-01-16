import { TaxonomyAllocation } from "@/lib/types";
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

interface ClassesChartProps {
  allocation?: TaxonomyAllocation;
  baseCurrency?: string;
  isLoading?: boolean;
  onClassSectionClick?: (categoryId: string, categoryName: string) => void;
}

export function ClassesChart({
  allocation,
  baseCurrency = "USD",
  isLoading,
  onClassSectionClick,
}: ClassesChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const data = useMemo(() => {
    if (!allocation?.categories?.length) return [];

    return allocation.categories
      .filter((cat) => cat.value > 0)
      .map((cat) => ({
        id: cat.categoryId,
        name: cat.categoryName,
        value: cat.value,
        currency: baseCurrency,
        color: cat.color,
      }));
  }, [allocation, baseCurrency]);

  const handleInternalSectionClick = (sectionData: {
    name: string;
    value: number;
    currency: string;
  }) => {
    const clickedItem = data.find((d) => d.name === sectionData.name);
    if (clickedItem && onClassSectionClick) {
      onClassSectionClick(clickedItem.id, clickedItem.name);
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
            Asset Classes
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
          <EmptyPlaceholder description="There is no asset class data available for your holdings." />
        )}
      </CardContent>
    </Card>
  );
}
