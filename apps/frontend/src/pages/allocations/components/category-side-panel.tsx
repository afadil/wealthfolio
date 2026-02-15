import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { Skeleton } from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getHoldingsByAllocation, getHoldingTargets } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { HoldingSummary, HoldingTarget, NewHoldingTarget } from "@/lib/types";
import { useTargetMutations } from "../use-target-mutations";

interface CategorySidePanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  allocationId?: string; // The TargetAllocation.id for this category
  categoryName?: string;
  categoryColor?: string;
  categoryPercent?: number; // The target % for this category (from parent)
  accountId: string;
  taxonomyId: string;
  baseCurrency: string;
}

interface PendingHoldingEdit {
  targetPercent: number;
  isLocked: boolean;
  userSet?: boolean; // True if user explicitly set this value
}

export function CategorySidePanel({
  isOpen,
  onOpenChange,
  allocationId,
  categoryName,
  categoryColor,
  categoryPercent = 0,
  accountId,
  taxonomyId,
  baseCurrency,
}: CategorySidePanelProps) {
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingHoldingEdit>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { batchSaveHoldingTargetsMutation } = useTargetMutations();

  // Fetch actual holdings for this category
  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({
    queryKey: [QueryKeys.HOLDINGS_BY_ALLOCATION, accountId, taxonomyId, allocationId],
    queryFn: () => getHoldingsByAllocation(accountId, taxonomyId, allocationId ?? ""),
    enabled: !!allocationId && isOpen,
    staleTime: 30000,
  });

  // Fetch saved holding targets for this allocation
  const { data: savedTargets = [], isLoading: targetsLoading } = useQuery({
    queryKey: [QueryKeys.HOLDING_TARGETS, allocationId],
    queryFn: () => getHoldingTargets(allocationId ?? ""),
    enabled: !!allocationId && isOpen,
    staleTime: 30000,
  });

  const holdings = holdingsData?.holdings ?? [];

  // Helper: get saved target for a holding
  const getSavedTarget = useCallback(
    (assetId: string): HoldingTarget | undefined => {
      return savedTargets.find((t) => t.assetId === assetId);
    },
    [savedTargets],
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
            return sum + saved.targetPercent;
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
            const saved = getSavedTarget(h.symbol);
            return sum + (saved?.targetPercent ?? 0);
          }, 0);

          if (eligibleTotal > 0) {
            // Distribute proportionally based on current values
            const saved = getSavedTarget(assetId);
            const currentValue = saved?.targetPercent ?? 0;
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
      const saved = getSavedTarget(assetId);
      if (saved) return saved.targetPercent;
      return 0;
    },
    [pendingEdits, holdings, getSavedTarget],
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

  // Handle edit change
  const handleEditChange = useCallback((assetId: string, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    if (isNaN(numValue)) return;

    const clamped = Math.max(0, Math.min(100, numValue));
    const rounded = Math.round(clamped * 100) / 100;

    setPendingEdits((prev) => {
      const next = new Map(prev);
      const existing = prev.get(assetId);
      next.set(assetId, {
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
    (assetId: string) => {
      setPendingEdits((prev) => {
        const next = new Map(prev);
        const existing = prev.get(assetId) ?? {
          targetPercent: getDisplayPercent(assetId),
          isLocked: getIsLocked(assetId),
          userSet: false,
        };
        next.set(assetId, {
          ...existing,
          isLocked: !existing.isLocked,
          userSet: true,
        });
        return next;
      });
      setHasUnsavedChanges(true);
    },
    [getDisplayPercent, getIsLocked],
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!allocationId) return;

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
      if (
        pending?.userSet ||
        pending?.isLocked ||
        (displayPercent > 0 && displayPercent !== saved?.targetPercent)
      ) {
        targetsToSave.push({
          id: saved?.id,
          allocationId,
          assetId: holding.symbol, // Using symbol as assetId for now
          targetPercent: displayPercent,
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
    getDisplayPercent,
    getIsLocked,
    batchSaveHoldingTargetsMutation,
  ]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setPendingEdits(new Map());
    setHasUnsavedChanges(false);
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
            <span>{categoryName || "Category"} Holdings</span>
            <span className="text-muted-foreground text-sm font-normal">
              ({categoryPercent.toFixed(2)}% of portfolio)
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : holdings.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <Icons.pieChart className="mb-4 h-12 w-12 opacity-50" />
              <p>No holdings in this category</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {holdings.map((holding) => (
                  <div
                    key={holding.symbol}
                    className="bg-card hover:bg-accent/50 space-y-3 rounded-lg border p-4 transition-colors"
                  >
                    {/* Holding header */}
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{holding.symbol}</div>
                        <div className="text-muted-foreground truncate text-sm">{holding.name}</div>
                      </div>
                      <div className="ml-4 text-right">
                        <div className="text-sm font-medium">
                          {baseCurrency} {holding.marketValue?.toFixed(2) ?? "0.00"}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {holding.performance?.totalGainPercent?.toFixed(2) ?? "0.00"}%
                        </div>
                      </div>
                    </div>

                    {/* Target input and lock */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={getDisplayPercent(holding.symbol).toFixed(2)}
                            onChange={(e) => handleEditChange(holding.symbol, e.target.value)}
                            disabled={getIsLocked(holding.symbol)}
                            className="w-24 rounded border px-2 py-1 text-right text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <span className="text-muted-foreground text-sm">%</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleLock(holding.symbol)}
                            className="h-8 w-8 p-0"
                          >
                            {getIsLocked(holding.symbol) ? (
                              <Icons.lock className="h-4 w-4" />
                            ) : (
                              <Icons.unlock className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          Cascaded:{" "}
                          {getCascadedPercent(getDisplayPercent(holding.symbol)).toFixed(2)}% of
                          total portfolio
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total display */}
              <div className="border-primary/20 bg-muted/30 flex items-center justify-between rounded-lg border-t-2 p-4">
                <span className="font-semibold">Total</span>
                <span
                  className={`font-semibold ${totalPercent > 100 ? "text-destructive" : totalPercent < 100 ? "text-warning" : "text-success"}`}
                >
                  {totalPercent.toFixed(2)}%
                </span>
              </div>

              {totalPercent !== 100 && (
                <div className="text-muted-foreground text-center text-sm">
                  {totalPercent > 100
                    ? `Over-allocated by ${(totalPercent - 100).toFixed(2)}%`
                    : `Under-allocated by ${(100 - totalPercent).toFixed(2)}%`}
                </div>
              )}
            </>
          )}
        </div>

        <SheetFooter className="mt-6">
          <SheetClose asChild>
            <Button variant="outline" onClick={handleCancel} disabled={!hasUnsavedChanges}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={handleSave} disabled={!hasUnsavedChanges || isLoading}>
            <Icons.check className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
