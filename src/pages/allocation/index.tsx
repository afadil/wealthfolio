import { getRebalancingStrategies, saveRebalancingStrategy } from "@/commands/rebalancing";
import { AccountSelector } from "@/components/account-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { formatCurrencyDisplay } from "@/lib/currency-format";
import { QueryKeys } from "@/lib/query-keys";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account, AccountType, Holding } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from "@wealthfolio/ui";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AllocationPieChartView } from "./components/allocation-pie-chart-view";
import { AssetClassFormDialog } from "./components/asset-class-form-dialog";
import { AssetClassTargetCard } from "./components/asset-class-target-card";
import { RebalancingAdvisor } from './components/rebalancing-advisor';
import { TargetPercentInput } from "./components/target-percent-input";
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

type TabType = 'targets' | 'composition' | 'pie-chart' | 'rebalancing';

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

// KEEP existing getAssetClassColor function (for base colors)
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

// KEEP existing getSubClassColor (orange tones)
const getSubClassColor = (percent: number): string => {
  if (percent >= 50) return "bg-orange-500";
  if (percent >= 30) return "bg-orange-400";
  if (percent >= 15) return "bg-amber-400";
  return "bg-yellow-400";
};

export default function AllocationPage() {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(
    createPortfolioAccount()
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<TabType>('pie-chart');
  const [showAssetDetails, setShowAssetDetails] = useState(false);
  const [selectedAssetClass, setSelectedAssetClass] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings } = useSettingsContext(); // ← NEW: Get base currency

  const selectedAccountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;
  const baseCurrency = settings?.baseCurrency || "USD"; // ← NEW: Default to USD

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

  const { data: targets = [] } =
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
  const totalAllocated = targets.reduce((sum, t) => sum + t.targetPercent, 0);

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

    // Validate input
    const validPercent = Math.max(0, Math.min(100, formData.targetPercent));

    const existingTarget = editingTarget
      ? targets.find((t) => t.assetClass === editingTarget)
      : null;

    // Calculate current total (excluding the target being edited if editing)
    const currentTotalInt = Math.round(targets.reduce((sum, t) => sum + t.targetPercent, 0) * 100);
    const editingAmountInt = Math.round((existingTarget?.targetPercent || 0) * 100);
    const newAmountInt = Math.round(validPercent * 100);
    const totalIfSavedInt = currentTotalInt - editingAmountInt + newAmountInt;

    // Check if we're over 100% and need to auto-scale
    if (totalIfSavedInt > 10000) {
      // User is creating a new target or increasing existing one beyond 100%
      // Auto-scale existing targets proportionally
      const availableSpaceInt = 10000 - newAmountInt;
      const otherTargetsInt = currentTotalInt - editingAmountInt;

      if (otherTargetsInt > 0) {
        const scaleFactor = availableSpaceInt / otherTargetsInt;

        // Update all OTHER targets (not including the one being saved) with scaled percentages
        const targetsToUpdate = targets
          .filter((t) => {
            if (editingTarget) {
              // If editing, exclude the edited target
              return t.assetClass !== editingTarget;
            }
            // If creating new, update all existing targets
            return true;
          })
          .map((t) => ({
            ...t,
            targetPercent: Math.max(0, t.targetPercent * scaleFactor),
          }));

        // Save all scaled targets
        for (const target of targetsToUpdate) {
          await saveTargetMutation.mutateAsync({
            id: target.id,
            strategyId: strategy.id,
            assetClass: target.assetClass,
            targetPercent: target.targetPercent,
          });
        }
      }
    }

    // Save the new/edited target
    const payload = {
      ...(existingTarget?.id && { id: existingTarget.id }),
      strategyId: strategy.id,
      assetClass: formData.assetClass,
      targetPercent: validPercent,
    };

    console.log("Form submit payload:", payload);

    await saveTargetMutation.mutateAsync(payload);

    // Clear editing state on success
    setEditingTarget(null);
    setFormOpen(false);

    // Force refresh of targets to sync card display
    queryClient.invalidateQueries({
      queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
    });
  };

  const handleDelete = async (assetClass: string) => {
    const targetToDelete = targets.find((t) => t.assetClass === assetClass);

    if (targetToDelete) {
      // First, delete the target
      await deleteTargetMutation.mutateAsync(targetToDelete.id);

      // Calculate remaining targets after deletion
      const remainingTargets = targets.filter((t) => t.assetClass !== assetClass);
      const remainingTotalInt = Math.round(
        remainingTargets.reduce((sum, t) => sum + t.targetPercent, 0) * 100
      );

      // If remaining targets exist and don't total 100%, scale them proportionally
      if (remainingTargets.length > 0 && remainingTotalInt > 0 && remainingTotalInt !== 10000) {
        const scaleFactor = 10000 / remainingTotalInt; // Scale to exactly 100%

        // Update all remaining targets with scaled percentages
        for (const target of remainingTargets) {
          const scaledPercent = target.targetPercent * scaleFactor;
          await saveTargetMutation.mutateAsync({
            id: target.id,
            strategyId: strategy?.id!,
            assetClass: target.assetClass,
            targetPercent: scaledPercent,
          });
        }
      }

      // Force refresh of targets after all updates complete
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
      });
    }
  };

  // Composition tab holdings display
  const renderHoldingName = (holding: Holding): string => {
    // For cash holdings in specific account, use account name
    // Check if holding has no instrument (indicates cash holding)
    if (!holding.instrument && selectedAccount?.id !== PORTFOLIO_ACCOUNT_ID) {
      return getHoldingDisplayName(holding, selectedAccount?.name);
    }
    // For portfolio view or non-cash, use standard logic
    // In portfolio view, find account by holding.accountId from available data
    const holdingAccount = holdings.find(h => h.accountId === holding.accountId)?.accountId;
    return getHoldingDisplayName(holding, holdingAccount ? selectedAccount?.name : undefined);
  };

  // Format currency helper (use throughout)
  const formatCurrency = (value: number): string => {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: baseCurrency,
    });
  };

  return (
    <div className="space-y-6 p-8">
      {/* Account Selector - Fixed position in top right corner */}
      <div className="pointer-events-auto fixed top-4 right-2 z-20 hidden md:block lg:right-4">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={setSelectedAccount}
          includePortfolio={true}
          variant="dropdown"
          className="h-9"
        />
      </div>

      {/* Account Selector - Mobile */}
      <div className="mb-4 flex justify-end md:hidden">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={setSelectedAccount}
          includePortfolio={true}
          variant="dropdown"
          className="h-9"
        />
      </div>

      {/* Tabs - Navigation Pills style */}
      <nav className="bg-muted/60 inline-flex items-center rounded-lg p-1">
        {[
          { id: 'targets', label: 'Targets' },
          { id: 'composition', label: 'Composition' },
          { id: 'pie-chart', label: 'Allocation Overview' },
          { id: 'rebalancing', label: 'Rebalancing Suggestions' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewTab(tab.id as TabType)}
            className={`relative flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none ${
              viewTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            }`}
            aria-current={viewTab === tab.id ? "page" : undefined}
          >
            {viewTab === tab.id && (
              <div className="bg-background absolute inset-0 rounded-md shadow-sm" />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="mt-6">
        {viewTab === 'targets' && (
          <div className="space-y-4">
            {/* Header with Action Button */}
            <div className="flex items-center justify-between">
              <Button
                onClick={() => handleOpenForm()}
                disabled={isMutating || availableAssetClasses.length === 0}
                size="sm"
              >
                + Add Target
              </Button>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Allocated:</span>{" "}
                  <span className="font-semibold">
                    {totalAllocated.toFixed(1)}%
                  </span>
                </div>
                <div className={totalAllocated > 100 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                  <span className="text-muted-foreground">Remaining:</span>{" "}
                  <span className="font-semibold">
                    {(100 - totalAllocated).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Target Cards Grid - FULL WIDTH WITH SLIDERS */}
            <div className="grid grid-cols-1 gap-4">
              {composition.map((comp) => {
                const target = targets.find(t => t.assetClass === comp.assetClass);
                return (
                  <AssetClassTargetCard
                    key={comp.assetClass}
                    composition={comp}
                    targetPercent={target?.targetPercent || 0}
                    onEdit={() => handleOpenForm(comp.assetClass)}
                    onDelete={() => handleDelete(comp.assetClass)}
                    onTargetChange={async (newPercent) => {
                      if (!strategy?.id) return;
                      const existingTarget = targets.find(t => t.assetClass === comp.assetClass);
                      if (existingTarget) {
                        await saveTargetMutation.mutateAsync({
                          id: existingTarget.id,
                          strategyId: strategy.id,
                          assetClass: comp.assetClass,
                          targetPercent: newPercent,
                        });
                      }
                    }}
                    isLoading={isMutating}
                    accountId={selectedAccountId}
                  />
                );
              })}
            </div>
          </div>
        )}

        {viewTab === 'composition' && (
          <div className="space-y-4">
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
                {/* Summary stats - USE formatCurrency */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Total Value</p>
                    <p className="text-xl font-bold">
                      {formatCurrency(currentAllocation.totalValue)}
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
                    <details
                      key={assetClass.assetClass}
                      className="rounded-lg border bg-card p-4 space-y-3 group"
                    >
                      {/* Tier 1: Asset Class Header - TWO LINES: (chevron + name) then (color bar) */}
                      <summary className="cursor-pointer list-none space-y-2">
                        {/* LINE 1: Chevron + Name + Percentage */}
                        <div className="flex items-center gap-3">
                          {/* Chevron icon (LEFT) */}
                          <div className="flex-shrink-0 w-5 flex items-center justify-center">
                            <svg
                              className="w-4 h-4 transition-transform group-open:rotate-90 text-muted-foreground"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </div>

                          {/* Asset Class Name */}
                          <span className="text-sm font-semibold text-foreground flex-shrink-0">
                            {assetClass.assetClass}
                          </span>

                          {/* Spacer */}
                          <div className="flex-1" />

                          {/* Percentage (RIGHT) */}
                          <span className="text-sm font-semibold text-foreground flex-shrink-0 w-12 text-right">
                            {assetClass.actualPercent.toFixed(1)}%
                          </span>
                        </div>

                        {/* LINE 2: Color Bar - DIMMED WHEN OPEN */}
                        <div className="h-6 rounded overflow-hidden bg-muted">
                          <div
                            className={`h-full rounded transition-all ${getAssetClassColor(assetClass.actualPercent)} group-open:opacity-50 group-open:brightness-110`}
                            style={{ width: `${Math.min(assetClass.actualPercent, 100)}%` }}
                          />
                        </div>
                      </summary>

                      {/* Expanded Content (Hidden when collapsed) */}
                      <div className="hidden group-open:block space-y-3 pl-8">
                        {/* Asset Class Value */}
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(assetClass.currentValue)}
                        </p>

                        {/* Tier 2: Asset Sub-Classes Breakdown */}
                        {assetClass.subClasses.length > 0 && (
                          <div className="space-y-2 pt-3 border-t border-border/50">
                            <p className="text-xs font-semibold text-muted-foreground uppercase">
                              By Sub-Class
                            </p>
                            {assetClass.subClasses.map((subClass) => (
                              <details
                                key={subClass.subClass}
                                className="rounded-md bg-muted/30 p-2 space-y-2 group"
                              >
                                {/* Sub-Class Header - TWO LINES: (chevron + name) then (color bar) */}
                                <summary className="cursor-pointer list-none space-y-2">
                                  {/* LINE 1: Chevron + Name + Percentage */}
                                  <div className="flex items-center gap-2">
                                    {/* Chevron icon (LEFT) */}
                                    <div className="flex-shrink-0 w-4 flex items-center justify-center">
                                      <svg
                                        className="w-3 h-3 transition-transform group-open:rotate-90 text-muted-foreground"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M9 5l7 7-7 7"
                                        />
                                      </svg>
                                    </div>

                                    {/* Sub-Class Name */}
                                    <span className="text-xs font-semibold text-foreground flex-shrink-0">
                                      {subClass.subClass}
                                    </span>

                                    {/* Spacer */}
                                    <div className="flex-1" />

                                    {/* Percentage (RIGHT) */}
                                    <span className="text-xs font-semibold text-foreground flex-shrink-0 w-10 text-right">
                                      {subClass.subClassPercent.toFixed(1)}%
                                    </span>
                                  </div>

                                  {/* LINE 2: Color Bar */}
                                  <div className="h-5 rounded overflow-hidden bg-muted">
                                    <div
                                      className={`h-full rounded transition-all ${getSubClassColor(subClass.subClassPercent)}`}
                                      style={{ width: `${Math.min(subClass.subClassPercent, 100)}%` }}
                                    />
                                  </div>
                                </summary>

                                {/* Sub-Class Details */}
                                <div className="hidden group-open:block space-y-2 pl-4">
                                  {/* Info row: "X% of Asset Class" + Value */}
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">
                                      {subClass.subClassPercent.toFixed(1)}% of {assetClass.assetClass}
                                    </span>
                                    <span className="text-xs font-semibold text-foreground">
                                      {formatCurrency(subClass.subClassValue)}
                                    </span>
                                  </div>

                                  {/* Holdings in Sub-Class (Tier 3) */}
                                  <div className="space-y-1 pl-2 text-xs border-l border-border/30">
                                    {subClass.holdings
                                      .sort((a, b) => (b.marketValue?.base || 0) - (a.marketValue?.base || 0))
                                      .map((h) => (
                                        <div
                                          key={h.id}
                                          className="flex justify-between text-muted-foreground"
                                        >
                                          <span>
                                            {renderHoldingName(h)}
                                          </span>
                                          <span>
                                            {formatCurrency(h.marketValue?.base || 0)}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              </details>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {viewTab === 'pie-chart' && (
          <AllocationPieChartView
            currentAllocation={currentAllocation}
            targets={targets}
            onSliceClick={(assetClass: string) => {
              setSelectedAssetClass(assetClass);
              setShowAssetDetails(true);
            }}
            onUpdateTarget={async (assetClass: string, newPercent: number) => {
              const target = targets.find((t) => t.assetClass === assetClass);
              if (target && strategy?.id) {
                await saveTargetMutation.mutateAsync({
                  id: target.id,
                  strategyId: strategy.id,
                  assetClass,
                  targetPercent: newPercent,
                });
                queryClient.invalidateQueries({
                  queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
                });
              }
            }}
            onAddTarget={() => handleOpenForm()}
            onDeleteTarget={async (assetClass: string) => {
              await handleDelete(assetClass);
            }}
            accountId={selectedAccountId}
          />
        )}

        {viewTab === 'rebalancing' && (
          <RebalancingAdvisor
            key={selectedAccountId}
            targets={targets}
            composition={composition}
            totalPortfolioValue={currentAllocation.totalValue}
            isLoading={isMutating}
            baseCurrency={baseCurrency}
          />
        )}
      </div>

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

      {/* Side Panel for Selected Asset Class */}
      {showAssetDetails && selectedAssetClass && (
        <Sheet open={showAssetDetails} onOpenChange={setShowAssetDetails}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{selectedAssetClass} Allocation</SheetTitle>
            </SheetHeader>

            <div className="py-8 space-y-6">
              {currentAllocation.assetClasses
                .find((ac) => ac.assetClass === selectedAssetClass)
                && (
                <div className="space-y-4">
                  {/* Section 1: Target Bar (Grey, Non-Slider) + Editable Target % */}
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="font-semibold text-sm">Allocation Target</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          handleOpenForm(selectedAssetClass);
                        }}
                        className="h-7 w-7 p-0"
                      >
                        ✎
                      </Button>
                    </div>

                    {targets.find(t => t.assetClass === selectedAssetClass) && (
                      <div className="space-y-3">
                        {/* Actual % */}
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Actual:</span>
                          <span className="font-semibold">
                            {currentAllocation.assetClasses.find(ac => ac.assetClass === selectedAssetClass)?.actualPercent.toFixed(1)}%
                          </span>
                        </div>

                        {/* Actual Progress Bar (Green) */}
                        <div className="h-3 rounded bg-muted overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{
                              width: `${Math.min(
                                currentAllocation.assetClasses.find(ac => ac.assetClass === selectedAssetClass)?.actualPercent || 0,
                                100
                              )}%`,
                            }}
                          />
                        </div>

                        {/* Target % - EDITABLE INLINE */}
                        <div className="flex justify-between items-center text-sm mt-4">
                          <span className="text-muted-foreground">Target:</span>
                          <TargetPercentInput
                            value={targets.find(t => t.assetClass === selectedAssetClass)?.targetPercent || 0}
                            onSave={async (newPercent: number) => {
                              const target = targets.find(t => t.assetClass === selectedAssetClass);
                              if (target && strategy?.id) {
                                await saveTargetMutation.mutateAsync({
                                  id: target.id,
                                  strategyId: strategy.id,
                                  assetClass: selectedAssetClass,
                                  targetPercent: newPercent,
                                });
                              }
                            }}
                            disabled={isMutating}
                          />
                        </div>

                        {/* Target Progress Bar - Sector Allocation Style */}
                        <div className="bg-secondary relative h-4 flex-1 overflow-hidden rounded">
                          <div
                            className="bg-chart-2 absolute top-0 left-0 h-full rounded transition-all"
                            style={{
                              width: `${Math.min(
                                targets.find(t => t.assetClass === selectedAssetClass)?.targetPercent || 0,
                                100
                              )}%`,
                            }}
                          />
                          <div className="text-background absolute top-0 left-0 flex h-full items-center px-2 text-xs font-medium">
                            <span className="whitespace-nowrap">
                              Target {(targets.find(t => t.assetClass === selectedAssetClass)?.targetPercent || 0).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section 2: Sub-Class Breakdown (RESTORED) */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Holdings by Type</h4>
                    {currentAllocation.assetClasses
                      .find((ac) => ac.assetClass === selectedAssetClass)
                      ?.subClasses && currentAllocation.assetClasses
                      .find((ac) => ac.assetClass === selectedAssetClass)
                      ?.subClasses.length! > 0 ? (
                      <div className="space-y-3">
                        {currentAllocation.assetClasses
                          .find((ac) => ac.assetClass === selectedAssetClass)
                          ?.subClasses.map((subClass) => (
                            <details key={subClass.subClass} className="group">
                              <summary className="flex flex-col gap-2 cursor-pointer list-none">
                                <div className="flex items-center gap-2">
                                  <ChevronDown
                                    size={14}
                                    className={`transition-transform group-open:rotate-180 text-muted-foreground flex-shrink-0`}
                                  />
                                  <p className="font-medium text-sm flex-1">{subClass.subClass}</p>
                                  <span className="font-semibold text-sm flex-shrink-0">
                                    {formatCurrencyDisplay(subClass.subClassValue)}
                                  </span>
                                </div>

                                {/* Progress Bar - INSIDE summary, always visible */}
                                <div className="h-4 rounded bg-muted overflow-hidden">
                                  <div
                                    className="h-full bg-orange-500"
                                    style={{
                                      width: `${Math.min(subClass.subClassPercent, 100)}%`,
                                    }}
                                  />
                                </div>
                              </summary>

                              {/* Percentage text and Holdings (only visible when expanded) */}
                              {(subClass.holdings || []).length > 0 && (
                                <div className="hidden group-open:block space-y-1 pl-6">
                                  <span className="text-xs text-muted-foreground">
                                    {subClass.subClassPercent.toFixed(1)}% of {selectedAssetClass}
                                  </span>
                                  <div className="space-y-1 text-xs border-l border-border/30 pl-4 ml-5">
                                    {(subClass.holdings || [])
                                      .sort((a, b) => (b.marketValue?.base || 0) - (a.marketValue?.base || 0))
                                      .map((h) => (
                                        <div
                                          key={h.id}
                                          className="flex justify-between text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                          onClick={() => {
                                            if (h.instrument?.symbol) {
                                              navigate(`/holdings/${h.instrument.symbol}`);
                                            }
                                          }}
                                        >
                                          <span className="truncate flex-1">
                                            {renderHoldingName(h)}
                                          </span>
                                          <span className="font-semibold text-foreground flex-shrink-0 ml-2">
                                            {formatCurrency(h.marketValue?.base || 0)}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </details>
                          ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No sub-classes</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
