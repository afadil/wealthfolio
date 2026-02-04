import { getRebalancingStrategies, saveRebalancingStrategy } from "@/commands/rebalancing";
import { AccountSelector } from "@/components/account-selector";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useAccounts } from "@/hooks/use-accounts";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, AccountType, Holding } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@wealthfolio/ui";
import { useEffect, useState } from "react";
import { AssetClassFormDialog } from "./components/asset-class-form-dialog";
import { AssetClassTargetCard } from "./components/asset-class-target-card";
import {
  useAssetClassMutations,
  useAssetClassTargets,
  useHoldingsForAllocation,
  useRebalancingStrategy,
} from "./hooks";
import {
  getAvailableAssetClasses,
  getHoldingDisplayName,
  useCurrentAllocation,
  useHoldingsByAssetClass,
} from "./hooks/use-current-allocation";

const createPortfolioAccount = (): Account => ({
  id: PORTFOLIO_ACCOUNT_ID,
  name: "All Portfolio",
  accountType: "portfolio" as AccountType,
  balance: 0,
  currency: "USD",
  isDefault: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Add this helper function at the top of the file (after imports)

/**
 * Get green color based on asset class percentage
 * Higher % = darker green, Lower % = lighter green
 */
function getAssetClassColor(percent: number): string {
  if (percent >= 80) return "bg-green-700 dark:bg-green-600"; // Dark green (80%+)
  if (percent >= 50) return "bg-green-500 dark:bg-green-600"; // Dark green (50-79%)
  if (percent >= 30) return "bg-green-400 dark:bg-green-500"; // Medium green (30-49%)
  if (percent >= 20) return "bg-green-300 dark:bg-green-400"; // Light green (20-29%)
  return "bg-green-300 dark:bg-green-200"; // Very light green (<20%)
}

export default function AllocationPage() {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(
    createPortfolioAccount()
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { accounts } = useAccounts(); // Get all accounts for name lookup

  const selectedAccountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;

  // Auto-create strategy for account if it doesn't exist
  useEffect(() => {
    const ensureStrategy = async () => {
      if (!selectedAccount || selectedAccount.id === PORTFOLIO_ACCOUNT_ID) {
        return; // Skip for portfolio view
      }

      try {
        const strategies = await getRebalancingStrategies();
        const exists = strategies.some((s) => s.accountId === selectedAccountId);

        if (!exists) {
          console.log("Creating strategy for account:", selectedAccountId, selectedAccount.name);
          await saveRebalancingStrategy({
            name: `${selectedAccount.name} Allocation Strategy`,
            accountId: selectedAccountId,
            isActive: true,
          } as any);

          // Invalidate strategy queries to force refetch
          queryClient.invalidateQueries({
            queryKey: [QueryKeys.REBALANCING_STRATEGIES],
          });
        }
      } catch (err) {
        console.error("Failed to ensure strategy:", err);
      }
    };

    ensureStrategy();
  }, [selectedAccountId, selectedAccount, queryClient]);

  const { data: targets = [], isLoading: targetsLoading } =
    useAssetClassTargets(selectedAccountId);
  const { data: holdings = [], isLoading: holdingsLoading } =
    useHoldingsForAllocation(selectedAccountId);

  // NEW: Get available asset classes from holdings
  const availableAssetClasses = getAvailableAssetClasses(holdings);

  const { saveTargetMutation, deleteTargetMutation } =
    useAssetClassMutations();
  const { data: strategy } = useRebalancingStrategy(selectedAccountId);

  // NEW: Get current allocation breakdown (Tier 1: by asset class)
  const { currentAllocation } = useCurrentAllocation(holdings);

  // Calculate composition (target vs actual)
  const composition = useHoldingsByAssetClass(targets, holdings);

  // Calculate total allocated
  const totalAllocated = composition.reduce((sum, c) => sum + c.targetPercent, 0);

  const isLoading = targetsLoading || holdingsLoading;
  const isMutating = saveTargetMutation.isPending || deleteTargetMutation.isPending;

  const handleOpenForm = (assetClass?: string) => {
    if (assetClass) {
      setEditingTarget(assetClass);
    } else {
      setEditingTarget(null);
    }
    setFormOpen(true);
  };

  const handleFormSubmit = async (formData: { assetClass: string; targetPercent: number }) => {
    if (!strategy?.id) {
      console.error("No strategy ID available");
      return;
    }

    // If editing an existing target, pass its ID
    const existingTarget = editingTarget
      ? targets.find((t) => t.assetClass === editingTarget)
      : null;

    const payload = {
      ...(existingTarget?.id && { id: existingTarget.id }),
      strategyId: strategy.id,
      assetClass: formData.assetClass,
      targetPercent: formData.targetPercent,
    };

    console.log("Form submit payload:", payload);

    await saveTargetMutation.mutateAsync(payload);

    // Clear editing state on success
    setEditingTarget(null);
    setFormOpen(false);
  };

  const handleDelete = async (assetClass: string) => {
    if (confirm(`Delete ${assetClass} allocation target?`)) {
      const targetToDelete = targets.find((t) => t.assetClass === assetClass);
      if (targetToDelete) {
        await deleteTargetMutation.mutateAsync(targetToDelete.id);
      }
    }
  };

  const handleQuickAdjustTarget = async (assetClass: string, newPercent: number) => {
    const target = targets.find((t) => t.assetClass === assetClass);
    if (!target || !strategy?.id) return;

    const payload = {
      id: target.id,
      strategyId: strategy.id,
      assetClass: target.assetClass,
      targetPercent: newPercent,
      createdAt: target.createdAt,
      updatedAt: new Date(),
    };

    await saveTargetMutation.mutateAsync(payload);
  };

  // Composition tab holdings display
  const renderHoldingName = (holding: Holding): string => {
    // For cash holdings in specific account, use account name
    // Check if holding has no instrument (indicates cash holding)
    if (!holding.instrument && selectedAccount?.id !== PORTFOLIO_ACCOUNT_ID) {
      return getHoldingDisplayName(holding, selectedAccount?.name);
    }
    // For portfolio view or non-cash, use standard logic
    return getHoldingDisplayName(holding, accounts.find(a => a.id === holding.accountId)?.name);
  };

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Allocations</h1>
        <p className="text-muted-foreground">
          Manage your strategic asset allocation targets and track actual
          holdings.
        </p>
      </div>

      {/* Account Selector - Standalone */}
      <AccountSelector
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        includePortfolio={true}
        variant="button"
        buttonText={selectedAccount?.name || "Select Account"}
      />

      {/* Tabs */}
      <Tabs defaultValue="targets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="composition">Composition</TabsTrigger>
          <TabsTrigger value="rebalancing">Rebalancing</TabsTrigger>
        </TabsList>

        {/* Targets Tab */}
        <TabsContent value="targets" className="space-y-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          )}

          {!isLoading && composition.length === 0 && (
            <div className="text-center py-12 rounded-lg border border-dashed">
              <p className="text-muted-foreground mb-4">
                No allocation targets set
              </p>
              <Button
                onClick={() => handleOpenForm()}
                disabled={isMutating || availableAssetClasses.length === 0}
              >
                Create Allocation Target
              </Button>
            </div>
          )}

          {!isLoading && composition.length > 0 && (
            <div className="space-y-4">
              {/* Header with Total & Remaining */}
              <div className="flex items-center justify-between">
                <Button
                  onClick={() => handleOpenForm()}
                  disabled={isMutating || availableAssetClasses.length === 0}
                >
                  Create Allocation Target
                </Button>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Allocated:</span>{" "}
                    <span className="font-semibold">
                      {targets.reduce((sum, t) => sum + t.targetPercent, 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className={targets.reduce((sum, t) => sum + t.targetPercent, 0) < 100 ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}>
                    <span className="text-muted-foreground">Remaining:</span>{" "}
                    <span className="font-semibold">
                      {(100 - targets.reduce((sum, t) => sum + t.targetPercent, 0)).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Target Cards */}
              <div className="grid gap-4">
                {composition.map((comp) => (
                  <AssetClassTargetCard
                    key={comp.assetClass}
                    composition={comp}
                    onEdit={() => handleOpenForm(comp.assetClass)}
                    onDelete={() => handleDelete(comp.assetClass)}
                    onQuickAdjust={(percent) => handleQuickAdjustTarget(comp.assetClass, percent)}
                    isLoading={isMutating}
                    totalAllocated={totalAllocated}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Composition Tab */}
        <TabsContent value="composition" className="space-y-4">
          {holdingsLoading && (
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          )}

          {!holdingsLoading && currentAllocation.assetClasses.length === 0 && (
            <div className="text-center py-12 rounded-lg border border-dashed">
              <p className="text-muted-foreground">
                No holdings in this account yet
              </p>
            </div>
          )}

          {!holdingsLoading && currentAllocation.assetClasses.length > 0 && (
            <div className="space-y-6">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="text-xl font-bold">
                    {currentAllocation.totalValue.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Asset Classes</p>
                  <p className="text-xl font-bold">
                    {currentAllocation.assetClasses.length}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Holdings</p>
                  <p className="text-xl font-bold">{holdings.length}</p>
                </div>
              </div>

              {/* Asset class breakdown (Tier 1) */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm">By Asset Class</h3>
                {currentAllocation.assetClasses.map((assetClass) => (
                  <div
                    key={assetClass.assetClass}
                    className="rounded-lg border bg-card p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {assetClass.assetClass}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {assetClass.currentPercent.toFixed(1)}%
                      </span>
                    </div>

                    {/* Progress bar with green gradient based on % */}
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-colors ${getAssetClassColor(assetClass.currentPercent)}`}
                        style={{ width: `${assetClass.currentPercent}%` }}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {assetClass.currentValue.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </p>

                    {/* Holdings in this class (Tier 2) */}
                    {assetClass.holdings.length > 0 && (
                      <details className="pt-2 border-t">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          {assetClass.holdings.length} holding{assetClass.holdings.length !== 1 ? "s" : ""}
                        </summary>
                        <div className="space-y-2 pt-2 pl-2 text-xs">
                          {assetClass.holdings.map((h) => (
                            <div
                              key={h.id}
                              className="flex justify-between text-muted-foreground"
                            >
                              <span>
                                {renderHoldingName(h)}{" "}
                                <span className="text-xs text-muted-foreground">
                                  ({h.quantity})
                                </span>
                              </span>
                              <span>
                                {h.marketValue?.base?.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Rebalancing Tab */}
        <TabsContent value="rebalancing" className="space-y-4">
          <div className="text-center py-12 rounded-lg border border-dashed">
            <p className="text-muted-foreground">
              Rebalancing suggestions coming in Phase 2
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Asset Class Form Dialog - Original Design */}
      {formOpen && (
        <AssetClassFormDialog
          open={formOpen}
          onOpenChange={() => {
            setFormOpen(false);
            setEditingTarget(null);
          }}
          onSubmit={handleFormSubmit}
          existingTargets={targets}
          editingTarget={editingTarget ? targets.find((t) => t.assetClass === editingTarget) ?? null : null}
          isLoading={isMutating}
          availableAssetClasses={availableAssetClasses}
        />
      )}
    </div>
  );
}
