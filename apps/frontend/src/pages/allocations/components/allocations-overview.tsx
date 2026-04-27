import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyPlaceholder } from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { AccountSelector } from "@/components/account-selector";
import {
  usePortfolioTargets,
  useAllocationDeviations,
  useTargetAllocations,
} from "@/hooks/use-portfolio-targets";
import { usePortfolioAllocations } from "@/hooks/use-portfolio-allocations";
import { useSettingsContext } from "@/lib/settings-provider";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import type { Account, AllocationDeviation, NewTargetAllocation } from "@/lib/types";

import { AllocationDonut } from "./allocation-donut";
import { HealthStrip } from "./health-strip";
import { TargetList } from "./target-list";
import { DrilldownView } from "./drilldown-view";
import { useTargetMutations } from "../use-target-mutations";

interface AllocationsOverviewProps {
  selectedAccount: Account | null;
  onAccountChange: (account: Account) => void;
}

export function AllocationsOverview({
  selectedAccount,
  onAccountChange,
}: AllocationsOverviewProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const accountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;
  const { targets, isLoading: targetsLoading } = usePortfolioTargets(accountId);
  const {
    createTargetMutation,
    batchSaveAllocationsMutation,
    deleteAllocationMutation,
    upsertAllocationMutation,
  } = useTargetMutations();

  const activeTarget = targets.find((t) => t.isActive) ?? targets[0] ?? null;

  const { deviationReport, isLoading: deviationsLoading } = useAllocationDeviations(
    activeTarget?.id,
  );

  const { allocations: portfolioAllocations, isLoading: allocationsLoading } =
    usePortfolioAllocations(accountId);

  // Get target allocations to find the real allocation IDs
  const { allocations: targetAllocations } = useTargetAllocations(activeTarget?.id);

  // Hover sync between donut and bullet rows
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Holding-level deviations pushed up from DrilldownView
  const [drilldownStripData, setDrilldownStripData] = useState<{
    deviations: AllocationDeviation[];
    categoryValue: number;
  } | null>(null);

  const handleHoldingDeviationsChange = useCallback(
    (deviations: AllocationDeviation[], categoryValue: number) => {
      setDrilldownStripData({ deviations, categoryValue });
    },
    [],
  );

  // Drill-down state
  const [drilldownCategory, setDrilldownCategory] = useState<{
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    categoryPercent: number;
    actualPercent: number;
    allocationId?: string;
  } | null>(null);

  // Reset drilldown when account changes
  useEffect(() => {
    setDrilldownCategory(null);
    setDrilldownStripData(null);
  }, [accountId]);

  const handleAccountSelect = (account: Account) => {
    onAccountChange(account);
  };

  const handleCategoryClick = useCallback(
    (
      categoryId: string,
      categoryName: string,
      categoryColor: string,
      categoryPercent: number,
      actualPercent: number,
      allocationId?: string,
    ) => {
      setDrilldownCategory({
        categoryId,
        categoryName,
        categoryColor,
        categoryPercent,
        actualPercent,
        allocationId,
      });
    },
    [],
  );

  const totalPortfolioValue = useMemo(() => {
    if (deviationReport?.totalValue) return deviationReport.totalValue;
    return portfolioAllocations?.totalValue ?? 0;
  }, [deviationReport, portfolioAllocations]);

  // Auto-create target when user first saves an allocation
  const handleSaveAllocations = useCallback(
    async (allocations: NewTargetAllocation[]) => {
      if (!activeTarget) {
        const accountName = selectedAccount?.name ?? "Portfolio";
        const newTarget = await createTargetMutation.mutateAsync({
          name: `${accountName} Allocation`,
          accountId,
          taxonomyId: "asset_classes",
          isActive: true,
        });
        const withTargetId = allocations.map((a) => ({ ...a, targetId: newTarget.id }));
        batchSaveAllocationsMutation.mutate(withTargetId);
      } else {
        batchSaveAllocationsMutation.mutate(allocations);
      }
    },
    [activeTarget, accountId, selectedAccount, createTargetMutation, batchSaveAllocationsMutation],
  );

  const handleDeleteAllocation = useCallback(
    (allocationId: string) => {
      deleteAllocationMutation.mutate(allocationId);
    },
    [deleteAllocationMutation],
  );

  const handleToggleLock = useCallback(
    (allocation: NewTargetAllocation) => {
      upsertAllocationMutation.mutate(allocation);
    },
    [upsertAllocationMutation],
  );

  // Build donut + list data
  const { targetData, currentData, deviations } = useMemo(() => {
    const hasDeviations = deviationReport && deviationReport.deviations.length > 0;

    if (hasDeviations) {
      const target = deviationReport.deviations
        .filter((d) => d.targetPercent > 0)
        .map((d) => ({
          id: d.categoryId,
          name: d.categoryName,
          value: d.targetPercent,
          color: d.color,
        }));

      const current = deviationReport.deviations
        .filter((d) => d.currentPercent > 0)
        .map((d) => ({
          id: d.categoryId,
          name: d.categoryName,
          value: d.currentPercent,
          color: d.color,
        }));

      // Sort deviations by current percentage (descending)
      const sortedDeviations = [...deviationReport.deviations].sort(
        (a, b) => b.currentPercent - a.currentPercent,
      );

      return {
        targetData: target,
        currentData: current,
        deviations: sortedDeviations,
      };
    }

    // Fallback: build from portfolio allocations (asset classes)
    if (portfolioAllocations?.assetClasses) {
      const categories = portfolioAllocations.assetClasses.categories;
      const current = categories
        .filter((c) => c.percentage > 0)
        .map((c) => ({
          id: c.categoryId,
          name: c.categoryName,
          value: c.percentage,
          color: c.color,
        }));

      const fallbackDeviations: AllocationDeviation[] = categories.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        color: c.color,
        targetPercent: 0,
        currentPercent: c.percentage,
        deviationPercent: 0,
        currentValue: c.value,
        targetValue: 0,
        valueDelta: 0,
        isLocked: false,
      }));

      return {
        targetData: [],
        currentData: current,
        deviations: fallbackDeviations,
      };
    }

    return { targetData: [], currentData: [], deviations: [] };
  }, [deviationReport, portfolioAllocations]);

  // Handle click from donut chart (only receives categoryId)
  const handleDonutClick = useCallback(
    (categoryId: string) => {
      // Don't allow drilling into Cash categories (they have synthetic holdings)
      if (categoryId === "CASH" || categoryId === "CASH_BANK_DEPOSITS") {
        return;
      }

      // Find the deviation for this category
      const deviation = deviations.find((d) => d.categoryId === categoryId);
      if (!deviation) return;

      // Find the saved allocation to get the real allocation ID
      const savedAllocation = targetAllocations.find((a) => a.categoryId === categoryId);

      handleCategoryClick(
        categoryId,
        deviation.categoryName,
        deviation.color,
        deviation.targetPercent ?? 0,
        deviation.currentPercent ?? 0,
        savedAllocation?.id, // Pass the real allocation ID
      );
    },
    [deviations, targetAllocations, handleCategoryClick],
  );

  const isLoading = targetsLoading || deviationsLoading || allocationsLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
          <Skeleton className="h-100" />
          <Skeleton className="h-100" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Account selector */}
      <div className="pointer-events-auto fixed right-2 top-4 z-20 hidden md:block lg:right-4">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>
      <div className="mb-4 flex justify-end md:hidden">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>

      {currentData.length === 0 && !activeTarget ? (
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.Target className="text-muted-foreground h-10 w-10" />}
            title="No allocation data"
            description="Add holdings to your portfolio to see asset class allocations and set targets."
          />
        </div>
      ) : (
        <>
          <HealthStrip
            deviations={
              drilldownCategory && drilldownStripData ? drilldownStripData.deviations : deviations
            }
            currency={baseCurrency}
            totalValue={
              drilldownCategory && drilldownStripData
                ? drilldownStripData.categoryValue
                : totalPortfolioValue
            }
          />

          {drilldownCategory ? (
            <DrilldownView
              category={drilldownCategory}
              onBack={() => {
                setDrilldownCategory(null);
                setDrilldownStripData(null);
              }}
              accountId={accountId}
              taxonomyId={activeTarget?.taxonomyId ?? ""}
              baseCurrency={baseCurrency}
              totalValue={totalPortfolioValue}
              onHoldingDeviationsChange={handleHoldingDeviationsChange}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
              {/* Left: Donut */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="shrink-0 pb-4">
                  <CardTitle className="text-sm font-medium uppercase tracking-wider">
                    Current Allocation
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 items-center justify-center p-4">
                  <AllocationDonut
                    targetData={targetData}
                    currentData={currentData}
                    totalValue={totalPortfolioValue}
                    currency={baseCurrency}
                    hoveredId={hoveredId}
                    onHover={setHoveredId}
                    onCategoryClick={handleDonutClick}
                    className="h-160 w-160"
                  />
                </CardContent>
              </Card>

              {/* Right: Bullet target list */}
              <TargetList
                deviations={deviations}
                targetId={activeTarget?.id}
                rebalanceMode={activeTarget?.rebalanceMode}
                onSave={handleSaveAllocations}
                onDeleteAllocation={handleDeleteAllocation}
                onToggleLock={handleToggleLock}
                isSaving={batchSaveAllocationsMutation.isPending}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onCategoryClick={handleCategoryClick}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
