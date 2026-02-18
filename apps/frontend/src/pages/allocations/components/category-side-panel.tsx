import { Button } from "@wealthfolio/ui/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@wealthfolio/ui/components/ui/sheet";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getHoldingsByAllocation, getHoldingTargets } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { HoldingSummary, HoldingTarget, NewHoldingTarget } from "@/lib/types";
import { useTargetMutations } from "../use-target-mutations";
import { HoldingTargetRow } from "./holding-target-row";

interface CategorySidePanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string; // The taxonomy category ID (e.g., "EQUITY")
  allocationId?: string; // The TargetAllocation.id for saving targets
  categoryName?: string;
  categoryColor?: string;
  categoryPercent?: number; // The target % for this category (from parent)
  accountId: string;
  taxonomyId: string;
  baseCurrency: string;
  actualPercent?: number; // The actual current % for this category
}

interface PendingHoldingEdit {
  targetPercent: number;
  isLocked: boolean;
  userSet?: boolean; // True if user explicitly set this value
}

export function CategorySidePanel({
  isOpen,
  onOpenChange,
  categoryId,
  allocationId,
  categoryName,
  categoryColor,
  categoryPercent = 0,
  accountId,
  taxonomyId,
  baseCurrency,
  actualPercent = 0,
}: CategorySidePanelProps) {
  const navigate = useNavigate();
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingHoldingEdit>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { batchSaveHoldingTargetsMutation, deleteHoldingTargetMutation } = useTargetMutations();

  // Fetch actual holdings for this category
  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({
    queryKey: [QueryKeys.HOLDINGS_BY_ALLOCATION, accountId, taxonomyId, categoryId],
    queryFn: () => getHoldingsByAllocation(accountId, taxonomyId, categoryId),
    enabled: !!categoryId && isOpen,
    staleTime: 30000,
  });

  // Fetch saved holding targets for this allocation
  const { data: savedTargets = [], isLoading: targetsLoading } = useQuery({
    queryKey: [QueryKeys.HOLDING_TARGETS, allocationId],
    queryFn: () => getHoldingTargets(allocationId ?? ""),
    enabled: !!allocationId && isOpen,
    staleTime: 30000,
  });

  const holdings = useMemo(() => holdingsData?.holdings ?? [], [holdingsData?.holdings]);
  const totalValue = holdingsData?.totalValue ?? 0;

  // Reset state when panel is closed
  useEffect(() => {
    if (!isOpen) {
      setPendingEdits(new Map());
      setHasUnsavedChanges(false);
      setCollapsedGroups(new Set());
    }
  }, [isOpen]);

  // Helper: get saved target for a holding by symbol
  // Note: We use symbol as key because HoldingSummary doesn't have asset_id
  const getSavedTarget = useCallback(
    (symbol: string): HoldingTarget | undefined => {
      // Try to find by symbol first (most common case)
      // The backend should be using asset.id, but we match by the data we have
      return savedTargets.find((t) => {
        // For now, we need to find the matching holding to get its asset info
        const matchingHolding = holdings.find((h) => h.symbol === symbol);
        return matchingHolding?.id === t.assetId;
      });
    },
    [savedTargets, holdings],
  );

  // Helper: convert saved target percent (basis points) to display percent (0-100)
  const getSavedPercent = useCallback(
    (assetId: string): number => {
      const saved = getSavedTarget(assetId);
      return saved ? saved.targetPercent / 100 : 0;
    },
    [getSavedTarget],
  );

  // Helper: get display percent with auto-distribution
  const getDisplayPercent = useCallback(
    (assetId: string): number => {
      const pending = pendingEdits.get(assetId);

      // If there are pending edits, we need to consider auto-distribution
      if (pendingEdits.size > 0) {
        // If this holding has a user-set value or is locked, use that
        if (pending?.userSet || pending?.isLocked) {
          return pending.targetPercent;
        }

        // Otherwise, calculate auto-distributed value
        // 1. Sum all locked and user-set values
        const lockedTotal = holdings.reduce((sum, h) => {
          const edit = pendingEdits.get(h.symbol);
          if (edit?.userSet || edit?.isLocked) {
            return sum + edit.targetPercent;
          }
          const saved = getSavedTarget(h.symbol);
          if (saved?.isLocked) {
            return sum + getSavedPercent(h.symbol);
          }
          return sum;
        }, 0);

        // 2. Count eligible holdings (not locked, not user-set)
        const eligibleHoldings = holdings.filter((h) => {
          const edit = pendingEdits.get(h.symbol);
          if (edit?.userSet || edit?.isLocked) return false;
          const saved = getSavedTarget(h.symbol);
          if (saved?.isLocked) return false;
          return true;
        });

        // 3. Distribute remaining % proportionally
        if (eligibleHoldings.length > 0) {
          const remaining = Math.max(0, 100 - lockedTotal);

          // Get current values for eligible holdings
          const eligibleTotal = eligibleHoldings.reduce((sum, h) => {
            return sum + getSavedPercent(h.symbol);
          }, 0);

          if (eligibleTotal > 0) {
            // Distribute proportionally based on current values
            const currentValue = getSavedPercent(assetId);
            return Math.round((currentValue / eligibleTotal) * remaining * 100) / 100;
          } else {
            // Distribute equally if no current values
            return Math.round((remaining / eligibleHoldings.length) * 100) / 100;
          }
        }

        return 0;
      }

      // No pending edits, return saved or 0
      if (pending) return pending.targetPercent;
      return getSavedPercent(assetId);
    },
    [pendingEdits, holdings, getSavedTarget, getSavedPercent],
  );

  // Helper: get lock status
  const getIsLocked = useCallback(
    (assetId: string): boolean => {
      const pending = pendingEdits.get(assetId);
      if (pending !== undefined) return pending.isLocked;

      const saved = getSavedTarget(assetId);
      if (saved) return saved.isLocked;

      return false;
    },
    [pendingEdits, getSavedTarget],
  );

  // Helper: check if value is auto-distributed (preview mode)
  const isAutoBalanced = useCallback(
    (assetId: string): boolean => {
      const pending = pendingEdits.get(assetId);
      // If user explicitly set it or it's locked, it's not auto-balanced
      if (pending?.userSet || pending?.isLocked) return false;

      const saved = getSavedTarget(assetId);
      // If it's saved and locked, it's not auto-balanced
      if (saved?.isLocked) return false;

      // If there are pending edits in the system and this holding isn't user-set,
      // then it's being auto-distributed
      if (pendingEdits.size > 0 && !pending?.userSet) {
        return true;
      }

      return false;
    },
    [pendingEdits, getSavedTarget],
  );

  // Calculate total of all targets
  const totalPercent = useMemo(() => {
    return holdings.reduce((sum, h) => sum + getDisplayPercent(h.symbol), 0);
  }, [holdings, getDisplayPercent]);

  // Calculate cascaded percent (category % × holding %)
  const getCascadedPercent = useCallback(
    (holdingPercent: number): number => {
      return (categoryPercent * holdingPercent) / 100;
    },
    [categoryPercent],
  );

  // Group holdings by instrument type taxonomy
  const groupedHoldings = useMemo(() => {
    const groups = new Map<string, HoldingSummary[]>();
    for (const holding of holdings) {
      // Use instrument type category if available, otherwise fall back to holding type
      const type = holding.instrumentTypeCategory || holding.holdingType || "Other";
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(holding);
    }

    // Calculate total value across all holdings
    const totalCategoryValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);

    return Array.from(groups.entries()).map(([type, holdings]) => {
      const groupTotalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
      const percentOfCategory =
        totalCategoryValue > 0 ? (groupTotalValue / totalCategoryValue) * 100 : 0;

      return {
        type,
        holdings,
        totalValue: groupTotalValue,
        percentOfCategory,
      };
    });
  }, [holdings]);

  // Initialize collapsed groups with all group types (collapsed by default)
  // Only run once when panel opens
  const hasInitializedCollapsed = useRef(false);
  useEffect(() => {
    if (isOpen && groupedHoldings.length > 0 && !hasInitializedCollapsed.current) {
      setCollapsedGroups(new Set(groupedHoldings.map((g) => g.type)));
      hasInitializedCollapsed.current = true;
    }
    if (!isOpen) {
      hasInitializedCollapsed.current = false;
    }
  }, [isOpen, groupedHoldings]);

  // Handle edit change
  const handleEditChange = useCallback((symbol: string, value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    const rounded = Math.round(clamped * 100) / 100;

    setPendingEdits((prev) => {
      const next = new Map(prev);
      const existing = prev.get(symbol);
      next.set(symbol, {
        targetPercent: rounded,
        isLocked: existing?.isLocked ?? false,
        userSet: true,
      });
      return next;
    });
    setHasUnsavedChanges(true);
  }, []);

  // Handle lock toggle
  const handleToggleLock = useCallback(
    async (symbol: string) => {
      const pending = pendingEdits.get(symbol);
      const saved = getSavedTarget(symbol);
      const currentLocked = getIsLocked(symbol);
      const displayPercent = getDisplayPercent(symbol);

      // If there's a pending edit (user has modified this), toggle lock in pending
      if (pending?.userSet) {
        setPendingEdits((prev) => {
          const next = new Map(prev);
          next.set(symbol, {
            ...pending,
            isLocked: !currentLocked,
          });
          return next;
        });
        setHasUnsavedChanges(true);
        return;
      }

      // If user is actively editing (auto-distribution is active)
      // Create a pending edit to lock the auto-distributed value
      if (pendingEdits.size > 0 && displayPercent > 0) {
        setPendingEdits((prev) => {
          const next = new Map(prev);
          next.set(symbol, {
            targetPercent: displayPercent,
            isLocked: !currentLocked,
            userSet: true,
          });
          return next;
        });
        setHasUnsavedChanges(true);
        return;
      }

      // If there's a saved target and no active editing, toggle lock via API (auto-save)
      if (saved && allocationId) {
        const holding = holdings.find((h) => h.symbol === symbol);
        if (!holding) {
          console.error("Cannot find holding for symbol:", symbol);
          return;
        }

        const updatedTarget: NewHoldingTarget = {
          id: saved.id,
          allocationId,
          assetId: holding.id,
          targetPercent: saved.targetPercent, // Keep existing percent
          isLocked: !currentLocked,
        };
        await batchSaveHoldingTargetsMutation.mutateAsync([updatedTarget]);
      }
    },
    [
      pendingEdits,
      getSavedTarget,
      getIsLocked,
      getDisplayPercent,
      allocationId,
      holdings,
      batchSaveHoldingTargetsMutation,
    ],
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!allocationId) {
      console.error("Cannot save holding targets: allocationId is missing");
      return;
    }

    // Build array of targets to save from pendingEdits
    const targetsToSave: NewHoldingTarget[] = [];

    holdings.forEach((holding) => {
      const pending = pendingEdits.get(holding.symbol);
      const saved = getSavedTarget(holding.symbol);
      const displayPercent = getDisplayPercent(holding.symbol);
      const isLocked = getIsLocked(holding.symbol);

      // Save if:
      // 1. User explicitly set a value, or
      // 2. It's locked (to preserve lock state), or
      // 3. Auto-distributed value is different from saved
      const savedPercent = getSavedPercent(holding.symbol);
      if (
        pending?.userSet ||
        pending?.isLocked ||
        (displayPercent > 0 && displayPercent !== savedPercent)
      ) {
        targetsToSave.push({
          id: saved?.id,
          allocationId,
          assetId: holding.id, // Use holding ID which contains the asset reference
          targetPercent: Math.round(displayPercent * 100), // Convert to basis points
          isLocked,
        });
      }
    });

    if (targetsToSave.length > 0) {
      await batchSaveHoldingTargetsMutation.mutateAsync(targetsToSave);
    }

    setPendingEdits(new Map());
    setHasUnsavedChanges(false);
  }, [
    allocationId,
    holdings,
    pendingEdits,
    getSavedTarget,
    getSavedPercent,
    getDisplayPercent,
    getIsLocked,
    batchSaveHoldingTargetsMutation,
  ]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setPendingEdits(new Map());
    setHasUnsavedChanges(false);
  }, []);

  // Handle delete
  const handleDelete = useCallback(
    (symbol: string) => {
      const saved = getSavedTarget(symbol);
      if (saved) {
        deleteHoldingTargetMutation.mutate(saved.id);
      }
      // Also remove from pending edits
      setPendingEdits((prev) => {
        const next = new Map(prev);
        next.delete(symbol);
        return next;
      });
    },
    [getSavedTarget, deleteHoldingTargetMutation],
  );

  // Handle navigate to holding
  const handleNavigateToHolding = useCallback(
    (holdingId: string) => {
      navigate(`/holdings/${holdingId}`);
    },
    [navigate],
  );

  // Toggle group collapsed state
  const toggleGroup = useCallback((type: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const isLoading = holdingsLoading || targetsLoading;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {categoryColor && (
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: categoryColor }} />
            )}
            <span>{categoryName || "Category"} Allocation</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Allocation Target Section (Read-only) */}
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-medium">Allocation Target</h3>
            <div className="space-y-2">
              {/* Target bar */}
              <div className="flex items-center gap-2">
                <div
                  className="relative h-6 flex-1 overflow-hidden rounded"
                  style={{ backgroundColor: `${categoryColor}20` }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded opacity-50 dark:opacity-70"
                    style={{
                      width: `${Math.min(categoryPercent, 100)}%`,
                      backgroundColor: categoryColor,
                    }}
                  />
                  <span className="relative z-10 flex h-full items-center px-2 text-xs font-medium">
                    Target
                  </span>
                </div>
                <span className="w-16 text-right text-sm font-semibold">
                  {categoryPercent.toFixed(1)}%
                </span>
              </div>

              {/* Actual bar */}
              <div className="flex items-center gap-2">
                <div
                  className="relative h-6 flex-1 overflow-hidden rounded"
                  style={{ backgroundColor: `${categoryColor}20` }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${Math.min(actualPercent, 100)}%`,
                      backgroundColor: categoryColor,
                    }}
                  />
                  <span className="relative z-10 flex h-full items-center px-2 text-xs font-medium">
                    Actual
                  </span>
                </div>
                <span className="w-16 text-right text-sm font-semibold">
                  {actualPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Validation warnings and Save/Cancel buttons */}
          {hasUnsavedChanges && (
            <div className="space-y-2">
              {/* Validation message */}
              {totalPercent !== 100 && (
                <div
                  className={`rounded-md p-3 text-sm ${
                    totalPercent > 100
                      ? "bg-destructive/10 text-destructive border-destructive/20 border"
                      : "bg-warning/10 text-warning border-warning/20 border"
                  }`}
                >
                  {totalPercent > 100
                    ? `Over-allocated by ${(totalPercent - 100).toFixed(2)}%. Total must not exceed 100%.`
                    : `Under-allocated by ${(100 - totalPercent).toFixed(2)}%. Remaining will be unallocated.`}
                </div>
              )}

              {/* Save/Cancel buttons */}
              <div className="flex gap-2">
                <Button onClick={handleCancel} variant="outline" className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isLoading || totalPercent > 100}
                  className="flex-1"
                >
                  <Icons.Check className="mr-2 h-4 w-4" />
                  Save All Targets
                </Button>
              </div>
            </div>
          )}

          {/* Holdings by Type */}
          {!allocationId ? (
            <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-md p-4 text-sm">
              <p className="font-medium">No allocation target set</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Please set a target percentage for this category in the main view first, then you
                can allocate to individual holdings.
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : holdings.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <Icons.PieChart className="mb-4 h-12 w-12 opacity-50" />
              <p>No holdings in this category</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Holdings by Type</h3>

              {groupedHoldings.map((group) => (
                <Collapsible
                  key={group.type}
                  open={!collapsedGroups.has(group.type)}
                  onOpenChange={() => toggleGroup(group.type)}
                >
                  <div className="space-y-2">
                    {/* Group header */}
                    <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between rounded-md p-2">
                      <div className="flex items-center gap-2">
                        <Icons.ChevronRight
                          className={`h-4 w-4 transition-transform ${
                            !collapsedGroups.has(group.type) ? "rotate-90" : ""
                          }`}
                        />
                        <span className="font-medium capitalize">{group.type}</span>
                      </div>
                      <span className="text-muted-foreground text-sm">
                        {baseCurrency} {group.totalValue.toFixed(2)}
                      </span>
                    </CollapsibleTrigger>

                    {/* Progress bar for group showing % of category */}
                    <div className="space-y-1">
                      <div
                        className="h-2 w-full rounded"
                        style={{ backgroundColor: `${categoryColor}20` }}
                      >
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${Math.min(group.percentOfCategory, 100)}%`,
                            backgroundColor: categoryColor,
                          }}
                        />
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {group.percentOfCategory.toFixed(1)}% of {categoryName}
                      </div>
                    </div>

                    <CollapsibleContent className="space-y-4">
                      {group.holdings.map((holding) => (
                        <HoldingTargetRow
                          key={holding.symbol}
                          holding={holding}
                          targetPercent={getDisplayPercent(holding.symbol)}
                          isLocked={getIsLocked(holding.symbol)}
                          isAutoDistributed={isAutoBalanced(holding.symbol)}
                          categoryColor={categoryColor}
                          categoryPercent={categoryPercent}
                          baseCurrency={baseCurrency}
                          totalValue={totalValue}
                          onEditChange={handleEditChange}
                          onToggleLock={handleToggleLock}
                          onDelete={handleDelete}
                          onNavigate={handleNavigateToHolding}
                          getCascadedPercent={getCascadedPercent}
                        />
                      ))}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
