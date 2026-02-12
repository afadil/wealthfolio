import { useCallback, useMemo, useState } from "react";
import { Button, EmptyPlaceholder } from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { AccountSelector } from "@/components/account-selector";
import { usePortfolioTargets, useAllocationDeviations } from "@/hooks/use-portfolio-targets";
import { useSettingsContext } from "@/lib/settings-provider";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import type { Account, AllocationDeviation, NewTargetAllocation } from "@/lib/types";

import { TwoRingDonut } from "./components/two-ring-donut";
import { CategoryList } from "./components/category-list";
import { CategorySidePanel } from "./components/category-side-panel";
import { useTargetMutations } from "./use-target-mutations";

const AllocationsPage = () => {
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
  const { createTargetMutation, deleteTargetMutation, batchSaveAllocationsMutation } =
    useTargetMutations();

  const activeTarget = targets.find((t) => t.isActive) ?? targets[0] ?? null;

  const { deviationReport, isLoading: deviationsLoading } = useAllocationDeviations(
    activeTarget?.id,
  );

  // Side panel state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const selectedDeviation = useMemo<AllocationDeviation | null>(() => {
    if (!selectedCategoryId || !deviationReport) return null;
    return deviationReport.deviations.find((d) => d.categoryId === selectedCategoryId) ?? null;
  }, [selectedCategoryId, deviationReport]);

  const handleCategoryClick = useCallback((categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setIsPanelOpen(true);
  }, []);

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
    setIsPanelOpen(false);
    setSelectedCategoryId(null);
  };

  // Auto-create target when user first saves an allocation
  const handleSaveAllocations = useCallback(
    async (allocations: NewTargetAllocation[]) => {
      if (!activeTarget) {
        // Auto-create target for this account
        const accountName = selectedAccount?.name ?? "Portfolio";
        const newTarget = await createTargetMutation.mutateAsync({
          name: `${accountName} Allocation`,
          accountId,
          taxonomyId: "asset_classes",
          isActive: true,
        });
        // Update allocations with the new target ID
        const withTargetId = allocations.map((a) => ({ ...a, targetId: newTarget.id }));
        batchSaveAllocationsMutation.mutate(withTargetId);
      } else {
        batchSaveAllocationsMutation.mutate(allocations);
      }
    },
    [activeTarget, accountId, selectedAccount, createTargetMutation, batchSaveAllocationsMutation],
  );

  const handleDeleteTarget = useCallback(() => {
    if (activeTarget) {
      deleteTargetMutation.mutate(activeTarget.id);
    }
  }, [activeTarget, deleteTargetMutation]);

  // Build donut data from deviations
  const { targetData, currentData, totalTargetPercent } = useMemo(() => {
    if (!deviationReport || deviationReport.deviations.length === 0) {
      return { targetData: [], currentData: [], totalTargetPercent: 0 };
    }

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

    const totalTarget = deviationReport.deviations.reduce((sum, d) => sum + d.targetPercent, 0);

    return { targetData: target, currentData: current, totalTargetPercent: totalTarget };
  }, [deviationReport]);

  const isLoading = targetsLoading || deviationsLoading;

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
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

      {/* Tabs (Overview only for now; Rebalancing in Section 3) */}
      <nav className="bg-muted/60 mb-4 inline-flex items-center rounded-full p-1">
        <button
          type="button"
          className="text-foreground relative flex items-center rounded-full px-3 py-1.5 text-sm font-medium"
          aria-current="page"
        >
          <div className="bg-background absolute inset-0 rounded-full shadow-sm" />
          <span className="relative z-10">Overview</span>
        </button>
        <button
          type="button"
          className="text-muted-foreground cursor-not-allowed rounded-full px-3 py-1.5 text-sm font-medium opacity-50"
          disabled
          title="Coming soon"
        >
          Rebalancing
        </button>
      </nav>

      {!activeTarget && deviationReport === undefined ? (
        /* Empty state: no target yet */
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.Target className="text-muted-foreground h-10 w-10" />}
            title="No allocation target"
            description="Set target allocations to define your ideal portfolio mix and track deviations. Click to start."
          >
            <Button onClick={() => handleCategoryClick("__new__")}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Set Targets
            </Button>
          </EmptyPlaceholder>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header with target name + delete */}
          {activeTarget && (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{activeTarget.name}</h2>
              <Button variant="outline" size="sm" onClick={handleDeleteTarget}>
                <Icons.Trash className="mr-1 h-3 w-3" />
                Delete
              </Button>
            </div>
          )}

          {/* Two-column layout: donut + category list */}
          <Card>
            <CardContent className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
              {/* Left: donut chart */}
              <TwoRingDonut
                targetData={targetData}
                currentData={currentData}
                onCategoryClick={handleCategoryClick}
              />

              {/* Right: category list */}
              <CategoryList
                deviations={deviationReport?.deviations ?? []}
                totalTargetPercent={totalTargetPercent}
                onCategoryClick={handleCategoryClick}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Side panel for category editing */}
      {activeTarget && (
        <CategorySidePanel
          isOpen={isPanelOpen}
          onOpenChange={setIsPanelOpen}
          targetId={activeTarget.id}
          deviation={selectedDeviation}
          onSave={handleSaveAllocations}
          isSaving={batchSaveAllocationsMutation.isPending}
        />
      )}
    </>
  );
};

export default AllocationsPage;
