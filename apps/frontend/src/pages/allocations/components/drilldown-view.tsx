import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";

import { getHoldingsByAllocation, getHoldingTargets } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { AllocationDeviation } from "@/lib/types";

import { AllocationDonut } from "./allocation-donut";
import { CategorySidePanel } from "./category-side-panel";

interface DrilldownCategory {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryPercent: number;
  actualPercent: number;
  allocationId?: string;
}

interface DrilldownViewProps {
  category: DrilldownCategory;
  onBack: () => void;
  accountId: string;
  taxonomyId: string;
  baseCurrency: string;
  totalValue: number;
  onHoldingDeviationsChange: (deviations: AllocationDeviation[], categoryValue: number) => void;
}

const ALPHA_BY_RANK = ["FF", "CC", "99", "77", "55", "44"];

export function DrilldownView({
  category,
  onBack,
  accountId,
  taxonomyId,
  baseCurrency,
  onHoldingDeviationsChange,
}: DrilldownViewProps) {
  const { data: holdingsData } = useQuery({
    queryKey: [QueryKeys.HOLDINGS_BY_ALLOCATION, accountId, taxonomyId, category.categoryId],
    queryFn: () => getHoldingsByAllocation(accountId, taxonomyId, category.categoryId),
    enabled: !!category.categoryId,
    staleTime: 30000,
  });

  const { data: savedTargets = [] } = useQuery({
    queryKey: [QueryKeys.HOLDING_TARGETS, category.allocationId],
    queryFn: () => getHoldingTargets(category.allocationId ?? ""),
    enabled: !!category.allocationId,
    staleTime: 30000,
  });

  const { currentData: donutData, targetData: donutTargetData } = useMemo(() => {
    const holdings = holdingsData?.holdings ?? [];
    const sorted = [...holdings].sort((a, b) => b.marketValue - a.marketValue);

    const current = sorted
      .filter((h) => h.marketValue > 0)
      .map((h, i) => ({
        id: h.id,
        name: h.name || h.symbol,
        value: h.marketValue,
        color: `${category.categoryColor}${ALPHA_BY_RANK[Math.min(i, ALPHA_BY_RANK.length - 1)]}`,
      }));

    const target = holdings
      .map((h) => {
        const t = savedTargets.find((st) => st.assetId === h.id);
        if (!t || t.targetPercent === 0) return null;
        return {
          id: h.id,
          name: h.name || h.symbol,
          value: t.targetPercent / 100,
          color: `${category.categoryColor}${
            ALPHA_BY_RANK[
              Math.min(
                sorted.findIndex((s) => s.id === h.id),
                ALPHA_BY_RANK.length - 1,
              )
            ]
          }`,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return { currentData: current, targetData: target };
  }, [holdingsData, savedTargets, category.categoryColor]);

  const totalHoldingsValue = holdingsData?.totalValue ?? 0;

  // Compute holding-level deviations for the HealthStrip
  const holdingDeviations = useMemo<AllocationDeviation[]>(() => {
    const holdings = holdingsData?.holdings ?? [];
    const sorted = [...holdings].sort((a, b) => b.marketValue - a.marketValue);
    return sorted.map((h, i) => {
      const savedTarget = savedTargets.find((t) => t.assetId === h.id);
      const targetPercent = savedTarget ? savedTarget.targetPercent / 100 : 0;
      const currentPercent = h.weightInCategory ?? 0;
      const targetValue = totalHoldingsValue * (targetPercent / 100);
      return {
        categoryId: h.id,
        categoryName: h.name || h.symbol,
        color: `${category.categoryColor}${ALPHA_BY_RANK[Math.min(i, ALPHA_BY_RANK.length - 1)]}`,
        targetPercent,
        currentPercent,
        deviationPercent: currentPercent - targetPercent,
        currentValue: h.marketValue,
        targetValue,
        valueDelta: targetValue - h.marketValue,
        isLocked: savedTarget?.isLocked ?? false,
      };
    });
  }, [holdingsData, savedTargets, totalHoldingsValue, category.categoryColor]);

  useEffect(() => {
    onHoldingDeviationsChange(holdingDeviations, totalHoldingsValue);
  }, [holdingDeviations, totalHoldingsValue, onHoldingDeviationsChange]);

  const [hoveredHoldingId, setHoveredHoldingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const highlightedIds = useMemo(() => {
    if (!activeFilter) return null;
    const holdings = holdingsData?.holdings ?? [];
    return new Set(
      holdings
        .filter((h) => (h.instrumentTypeCategory || h.holdingType || "Other") === activeFilter)
        .map((h) => h.id),
    );
  }, [activeFilter, holdingsData]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
      {/* Left: sub-donut */}
      <Card className="flex flex-col overflow-hidden">
        <CardHeader className="shrink-0 pb-2">
          {/* Breadcrumb lives here — grid stays at same Y as overview */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack} className="h-7 gap-1 px-1.5">
              <Icons.ArrowLeft className="h-3.5 w-3.5" />
              <span className="text-xs">Back</span>
            </Button>
            <span className="text-muted-foreground text-sm">/</span>
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: category.categoryColor }}
              />
              <CardTitle className="text-sm font-medium">{category.categoryName}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 items-center justify-center p-4">
          <AllocationDonut
            targetData={donutTargetData}
            currentData={donutData}
            totalValue={totalHoldingsValue}
            currency={baseCurrency}
            hoveredId={hoveredHoldingId}
            onHover={setHoveredHoldingId}
            highlightedIds={highlightedIds}
            centerLabel={`${category.categoryName} Holdings`}
            className="h-160 w-160"
          />
        </CardContent>
      </Card>

      {/* Right: holdings panel inline, scrollable */}
      <Card className="flex max-h-[77vh] flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col p-4">
          <CategorySidePanel
            isOpen={false}
            onOpenChange={() => {}}
            isInline={true}
            categoryId={category.categoryId}
            allocationId={category.allocationId}
            categoryName={category.categoryName}
            categoryColor={category.categoryColor}
            categoryPercent={category.categoryPercent}
            actualPercent={category.actualPercent}
            accountId={accountId}
            taxonomyId={taxonomyId}
            baseCurrency={baseCurrency}
            hoveredHoldingId={hoveredHoldingId}
            onHoverHolding={setHoveredHoldingId}
            onFilterChange={setActiveFilter}
          />
        </CardContent>
      </Card>
    </div>
  );
}
