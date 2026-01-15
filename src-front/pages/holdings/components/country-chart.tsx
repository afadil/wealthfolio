import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { TaxonomyAllocation } from "@/lib/types";
import { DonutChart, EmptyPlaceholder, Skeleton } from "@wealthfolio/ui";
import { useMemo, useState } from "react";

interface CountryChartProps {
  allocation?: TaxonomyAllocation;
  baseCurrency?: string;
  isLoading?: boolean;
  onCountrySectionClick?: (countryName: string) => void;
}

export const CountryChart = ({
  allocation,
  baseCurrency = "USD",
  isLoading,
  onCountrySectionClick,
}: CountryChartProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const data = useMemo(() => {
    if (!allocation?.categories?.length) return [];

    return allocation.categories
      .filter((cat) => cat.value > 0)
      .slice(0, 10) // Show top 10 regions
      .map((cat) => ({
        name: cat.categoryName,
        value: cat.value,
        currency: baseCurrency,
        color: cat.color,
      }));
  }, [allocation, baseCurrency]);

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
          <div className="flex h-[200px] items-center justify-center">
            <Skeleton className="h-[150px] w-[150px] rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleInternalSectionClick = (sectionData: {
    name: string;
    value: number;
    currency: string;
  }) => {
    if (onCountrySectionClick) {
      onCountrySectionClick(sectionData.name);
    }
    const clickedIndex = data.findIndex((d) => d.name === sectionData.name);
    if (clickedIndex !== -1) {
      setActiveIndex(clickedIndex);
    }
  };

  return (
    <Card className="overflow-hidden backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            Region Allocation
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
            displayTooltip={false}
          />
        ) : (
          <EmptyPlaceholder
            description="There is no region data available for your holdings."
            className="max-h-[160px]"
          />
        )}
      </CardContent>
    </Card>
  );
};
