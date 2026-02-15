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
import type { HoldingSummary, HoldingTarget } from "@/lib/types";

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

  // Helper: get display percent (pending > saved > 0)
  const getDisplayPercent = useCallback(
    (assetId: string): number => {
      const pending = pendingEdits.get(assetId);
      if (pending) return pending.targetPercent;

      const saved = getSavedTarget(assetId);
      if (saved) return saved.targetPercent;

      return 0;
    },
    [pendingEdits, getSavedTarget],
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
  const handleEditChange = useCallback(
    (assetId: string, value: string) => {
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
    },
    [],
  );

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
    console.log("Saving holding targets:", pendingEdits);
    // TODO: Implement batch save mutation
    setPendingEdits(new Map());
    setHasUnsavedChanges(false);
  }, [pendingEdits]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setPendingEdits(new Map());
    setHasUnsavedChanges(false);
  }, []);

  const isLoading = holdingsLoading || targetsLoading;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {categoryColor && (
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: categoryColor }} />
            )}
            <span>{categoryName || "Category"} Holdings</span>
            <span className="text-sm font-normal text-muted-foreground">
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
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Icons.pieChart className="h-12 w-12 mb-4 opacity-50" />
              <p>No holdings in this category</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {holdings.map((holding) => (
                  <div
                    key={holding.symbol}
                    className="border rounded-lg p-4 space-y-3 bg-card hover:bg-accent/50 transition-colors"
                  >
                    {/* Holding header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{holding.symbol}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {holding.name}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm font-medium">
                          {baseCurrency} {holding.marketValue?.toFixed(2) ?? "0.00"}
                        </div>
                        <div className="text-xs text-muted-foreground">
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
                            className="w-24 px-2 py-1 text-sm border rounded text-right disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
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
                        <div className="text-xs text-muted-foreground mt-1">
                          Cascaded: {getCascadedPercent(getDisplayPercent(holding.symbol)).toFixed(2)}% of total portfolio
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total display */}
              <div className="flex items-center justify-between p-4 border-t-2 border-primary/20 bg-muted/30 rounded-lg">
                <span className="font-semibold">Total</span>
                <span
                  className={`font-semibold ${totalPercent > 100 ? "text-destructive" : totalPercent < 100 ? "text-warning" : "text-success"}`}
                >
                  {totalPercent.toFixed(2)}%
                </span>
              </div>

              {totalPercent !== 100 && (
                <div className="text-sm text-muted-foreground text-center">
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
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={!hasUnsavedChanges}
            >
              Cancel
            </Button>
          </SheetClose>
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isLoading}
          >
            <Icons.check className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
