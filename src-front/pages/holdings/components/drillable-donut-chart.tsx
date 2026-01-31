import { AllocationBreadcrumb } from "@/components/allocation-breadcrumb";
import { useDrillDownState } from "@/hooks/use-drill-down-state";
import type { Holding, TaxonomyAllocation } from "@/lib/types";
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

type TaxonomyType = "assetClasses" | "regions" | "sectors";

interface DrillableDonutChartProps {
  title: string;
  allocation?: TaxonomyAllocation;
  holdings?: Holding[];
  taxonomyType?: TaxonomyType;
  baseCurrency?: string;
  isLoading?: boolean;
  onCategoryClick?: (categoryId: string, categoryName: string) => void;
}

/**
 * A semi-donut chart with drill-down capability.
 * At root level, shows top-level categories from TaxonomyAllocation.
 * When drilled, aggregates holdings by leaf-level categories.
 */
export function DrillableDonutChart({
  title,
  allocation,
  holdings,
  taxonomyType,
  baseCurrency = "USD",
  isLoading,
  onCategoryClick,
}: DrillableDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { path, drillDown, navigateTo, isAtRoot } = useDrillDownState();

  // Root level data from allocation
  const rootData = useMemo(() => {
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

  // Drilled-down data computed from holdings
  const drilledData = useMemo(() => {
    if (path.length === 0 || !holdings || !taxonomyType) return [];

    const currentCategoryId = path[path.length - 1].id;
    const categoryMap = new Map<string, { name: string; value: number; color: string }>();

    holdings.forEach((holding) => {
      const classifications = holding.instrument?.classifications;
      if (!classifications) return;

      const taxonomyCategories = classifications[taxonomyType];
      if (!taxonomyCategories || !Array.isArray(taxonomyCategories)) return;

      taxonomyCategories.forEach((catWithWeight) => {
        if (catWithWeight.topLevelCategory.id === currentCategoryId) {
          const leafCategory = catWithWeight.category;
          const holdingValue = Number(holding.marketValue?.base ?? 0);
          const weightedValue = holdingValue * (catWithWeight.weight / 100);

          const existing = categoryMap.get(leafCategory.id);
          if (existing) {
            existing.value += weightedValue;
          } else {
            categoryMap.set(leafCategory.id, {
              name: leafCategory.name,
              value: weightedValue,
              color: leafCategory.color,
            });
          }
        }
      });
    });

    return Array.from(categoryMap.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        value: data.value,
        currency: baseCurrency,
        color: data.color,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [path, holdings, taxonomyType, baseCurrency]);

  const data = isAtRoot ? rootData : drilledData;

  const handleSectionClick = (
    sectionData: { name: string; value: number; currency: string },
    index: number,
  ) => {
    setActiveIndex(index);

    const clickedItem = data.find((d) => d.name === sectionData.name);
    if (!clickedItem) return;

    if (isAtRoot && holdings && taxonomyType) {
      // Drill down to show leaf categories
      drillDown(clickedItem.id, clickedItem.name);
      setActiveIndex(0);
    } else {
      // At leaf level, trigger parent handler
      onCategoryClick?.(clickedItem.id, clickedItem.name);
    }
  };

  const handleBreadcrumbNavigate = (index: number) => {
    navigateTo(index);
    setActiveIndex(0);
  };

  if (isLoading) {
    return (
      <Card className="overflow-hidden backdrop-blur-sm">
        <CardHeader>
          <Skeleton className="h-5 w-[140px]" />
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex h-[160px] items-center justify-center">
            <Skeleton className="h-[120px] w-[120px] rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden backdrop-blur-sm">
      <CardHeader>
        {isAtRoot ? (
          <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            {title}
          </CardTitle>
        ) : (
          <AllocationBreadcrumb
            path={path}
            rootLabel={title}
            onNavigate={handleBreadcrumbNavigate}
          />
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {data.length > 0 ? (
          <DonutChart
            data={data}
            activeIndex={activeIndex}
            onSectionClick={handleSectionClick}
            startAngle={180}
            endAngle={0}
          />
        ) : (
          <EmptyPlaceholder
            description={`No ${title.toLowerCase()} data available.`}
            className="max-h-[160px]"
          />
        )}
      </CardContent>
    </Card>
  );
}
