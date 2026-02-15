import { useCallback, useMemo, useState } from "react";
import { EmptyPlaceholder, formatAmount } from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { AccountSelector } from "@/components/account-selector";
import { usePortfolioTargets, useAllocationDeviations } from "@/hooks/use-portfolio-targets";
import { usePortfolioAllocations } from "@/hooks/use-portfolio-allocations";
import { useSettingsContext } from "@/lib/settings-provider";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import type { Account, AllocationDeviation, NewTargetAllocation } from "@/lib/types";

import { TwoRingDonut } from "./two-ring-donut";
import { TargetList } from "./target-list";
import { useTargetMutations } from "../use-target-mutations";

export function AllocationsOverview() {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const [selectedAccount, setSelectedAccount] = useState<Account | null>({
    id: PORTFOLIO_ACCOUNT_ID,
    name: "All Portfolio",
    accountType: "PORTFOLIO" as unknown as Account["accountType"],
    balance: 0,
    currency: baseCurrency,
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account);

  const accountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;
  const { targets, isLoading: targetsLoading } = usePortfolioTargets(accountId);
  const { createTargetMutation, batchSaveAllocationsMutation, deleteAllocationMutation } =
    useTargetMutations();

  const activeTarget = targets.find((t) => t.isActive) ?? targets[0] ?? null;

  const { deviationReport, isLoading: deviationsLoading } = useAllocationDeviations(
    activeTarget?.id,
  );

  const { allocations: portfolioAllocations, isLoading: allocationsLoading } =
    usePortfolioAllocations(accountId);

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
  };

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

      return {
        targetData: target,
        currentData: current,
        deviations: deviationReport.deviations,
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[9fr_11fr]">
          {/* Left: Pie chart — stretches to match right column */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider">
                Current Allocation
              </CardTitle>
              <p className="text-2xl font-bold">
                {formatAmount(totalPortfolioValue, baseCurrency)}
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 items-center justify-center p-4">
              <TwoRingDonut
                targetData={targetData}
                currentData={currentData}
                className="max-w-100"
              />
            </CardContent>
          </Card>

          {/* Right: Target Status + Target vs Actual */}
          <div className="space-y-4">
            <TargetList
              deviations={deviations}
              targetId={activeTarget?.id}
              onSave={handleSaveAllocations}
              onDeleteAllocation={handleDeleteAllocation}
              isSaving={batchSaveAllocationsMutation.isPending}
            />
          </div>
        </div>
      )}
    </>
  );
}
