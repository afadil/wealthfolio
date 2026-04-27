import { Button } from "@wealthfolio/ui/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@wealthfolio/ui/components/ui/sheet";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getHoldingsByAllocation, getHoldingTargets } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { HoldingTarget, NewHoldingTarget } from "@/lib/types";
import { useTargetMutations } from "../use-target-mutations";
import { HoldingTargetRow } from "./holding-target-row";

interface CategorySidePanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  allocationId?: string;
  categoryName?: string;
  categoryColor?: string;
  categoryPercent?: number;
  accountId: string;
  taxonomyId: string;
  baseCurrency: string;
  actualPercent?: number;
  isInline?: boolean;
  hoveredHoldingId?: string | null;
  onHoverHolding?: (id: string | null) => void;
  onFilterChange?: (filter: string | null) => void;
}

interface PendingHoldingEdit {
  targetPercent: number;
  isLocked: boolean;
  userSet?: boolean;
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
  isInline = false,
  hoveredHoldingId,
  onHoverHolding,
  onFilterChange,
}: CategorySidePanelProps) {
  const navigate = useNavigate();
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingHoldingEdit>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { batchSaveHoldingTargetsMutation, deleteHoldingTargetMutation } = useTargetMutations();

  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({
    queryKey: [QueryKeys.HOLDINGS_BY_ALLOCATION, accountId, taxonomyId, categoryId],
    queryFn: () => getHoldingsByAllocation(accountId, taxonomyId, categoryId),
    enabled: !!categoryId && (isOpen || isInline),
    staleTime: 30000,
  });

  const { data: savedTargets = [], isLoading: targetsLoading } = useQuery({
    queryKey: [QueryKeys.HOLDING_TARGETS, allocationId],
    queryFn: () => getHoldingTargets(allocationId ?? ""),
    enabled: !!allocationId && (isOpen || isInline),
    staleTime: 30000,
  });

  const holdings = useMemo(() => holdingsData?.holdings ?? [], [holdingsData?.holdings]);
  const totalValue = holdingsData?.totalValue ?? 0;

  useEffect(() => {
    if (!isInline && !isOpen) {
      setPendingEdits(new Map());
      setHasUnsavedChanges(false);
    }
  }, [isOpen, isInline]);

  const getSavedTarget = useCallback(
    (symbol: string): HoldingTarget | undefined => {
      return savedTargets.find((t) => {
        const matchingHolding = holdings.find((h) => h.symbol === symbol);
        return matchingHolding?.id === t.assetId;
      });
    },
    [savedTargets, holdings],
  );

  const getSavedPercent = useCallback(
    (assetId: string): number => {
      const saved = getSavedTarget(assetId);
      return saved ? saved.targetPercent / 100 : 0;
    },
    [getSavedTarget],
  );

  const getDisplayPercent = useCallback(
    (assetId: string): number => {
      const pending = pendingEdits.get(assetId);

      if (pendingEdits.size > 0) {
        if (pending?.userSet || pending?.isLocked) {
          return pending.targetPercent;
        }

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

        const eligibleHoldings = holdings.filter((h) => {
          const edit = pendingEdits.get(h.symbol);
          if (edit?.userSet || edit?.isLocked) return false;
          const saved = getSavedTarget(h.symbol);
          if (saved?.isLocked) return false;
          return true;
        });

        if (eligibleHoldings.length > 0) {
          const remaining = Math.max(0, 100 - lockedTotal);
          const eligibleTotal = eligibleHoldings.reduce((sum, h) => {
            return sum + getSavedPercent(h.symbol);
          }, 0);

          if (eligibleTotal > 0) {
            const currentValue = getSavedPercent(assetId);
            return (currentValue / eligibleTotal) * remaining;
          } else {
            return remaining / eligibleHoldings.length;
          }
        }

        return 0;
      }

      if (pending) return pending.targetPercent;
      return getSavedPercent(assetId);
    },
    [pendingEdits, holdings, getSavedTarget, getSavedPercent],
  );

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

  const isAutoBalanced = useCallback(
    (assetId: string): boolean => {
      const pending = pendingEdits.get(assetId);
      if (pending?.userSet || pending?.isLocked) return false;
      const saved = getSavedTarget(assetId);
      if (saved?.isLocked) return false;
      if (pendingEdits.size > 0 && !pending?.userSet) return true;
      return false;
    },
    [pendingEdits, getSavedTarget],
  );

  const totalPercent = useMemo(() => {
    if (pendingEdits.size === 0) {
      return holdings.reduce((sum, h) => sum + getSavedPercent(h.symbol), 0);
    }

    const lockedTotal = holdings.reduce((sum, h) => {
      const edit = pendingEdits.get(h.symbol);
      if (edit?.userSet || edit?.isLocked) return sum + edit.targetPercent;
      const saved = getSavedTarget(h.symbol);
      if (saved?.isLocked) return sum + getSavedPercent(h.symbol);
      return sum;
    }, 0);

    const hasEligible = holdings.some((h) => {
      const edit = pendingEdits.get(h.symbol);
      if (edit?.userSet || edit?.isLocked) return false;
      const saved = getSavedTarget(h.symbol);
      return !saved?.isLocked;
    });

    const remaining = Math.max(0, 100 - lockedTotal);
    return lockedTotal + (hasEligible ? remaining : 0);
  }, [holdings, pendingEdits, getSavedTarget, getSavedPercent]);

  const getCascadedPercent = useCallback(
    (holdingPercent: number): number => {
      return (categoryPercent * holdingPercent) / 100;
    },
    [categoryPercent],
  );

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

  const handleToggleLock = useCallback(
    async (symbol: string) => {
      const pending = pendingEdits.get(symbol);
      const saved = getSavedTarget(symbol);
      const currentLocked = getIsLocked(symbol);
      const displayPercent = getDisplayPercent(symbol);

      if (pending?.userSet) {
        setPendingEdits((prev) => {
          const next = new Map(prev);
          next.set(symbol, { ...pending, isLocked: !currentLocked });
          return next;
        });
        setHasUnsavedChanges(true);
        return;
      }

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

      if (saved && allocationId) {
        const holding = holdings.find((h) => h.symbol === symbol);
        if (!holding) return;

        const updatedTarget: NewHoldingTarget = {
          id: saved.id,
          allocationId,
          assetId: holding.id,
          targetPercent: saved.targetPercent,
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

  const handleSave = useCallback(async () => {
    if (!allocationId) return;

    const targetsToSave: NewHoldingTarget[] = [];

    holdings.forEach((holding) => {
      const pending = pendingEdits.get(holding.symbol);
      const saved = getSavedTarget(holding.symbol);
      const displayPercent = getDisplayPercent(holding.symbol);
      const isLocked = getIsLocked(holding.symbol);
      const savedPercent = getSavedPercent(holding.symbol);

      if (
        pending?.userSet ||
        pending?.isLocked ||
        (displayPercent > 0 && displayPercent !== savedPercent)
      ) {
        targetsToSave.push({
          id: saved?.id,
          allocationId,
          assetId: holding.id,
          targetPercent: Math.round(displayPercent * 100),
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

  const handleCancel = useCallback(() => {
    setPendingEdits(new Map());
    setHasUnsavedChanges(false);
  }, []);

  const handleDelete = useCallback(
    (symbol: string) => {
      const saved = getSavedTarget(symbol);
      if (saved) {
        deleteHoldingTargetMutation.mutate(saved.id);
      }
      setPendingEdits((prev) => {
        const next = new Map(prev);
        next.delete(symbol);
        return next;
      });
    },
    [getSavedTarget, deleteHoldingTargetMutation],
  );

  const handleNavigateToHolding = useCallback(
    (holdingId: string) => {
      navigate(`/holdings/${holdingId}`);
    },
    [navigate],
  );

  const isLoading = holdingsLoading || targetsLoading;

  const ALPHAS = ["FF", "CC", "99", "77", "55", "44"];

  const sortedHoldings = useMemo(
    () => [...holdings].sort((a, b) => b.marketValue - a.marketValue),
    [holdings],
  );

  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const uniqueTypes = useMemo(() => {
    const types = new Set(
      holdings.map((h) => h.instrumentTypeCategory || h.holdingType || "Other"),
    );
    return [...types];
  }, [holdings]);

  const filteredHoldings = useMemo(
    () =>
      activeFilter
        ? sortedHoldings.filter(
            (h) => (h.instrumentTypeCategory || h.holdingType || "Other") === activeFilter,
          )
        : sortedHoldings,
    [sortedHoldings, activeFilter],
  );

  const stickyHeader = (
    <div className="shrink-0 space-y-3 pb-3">
      {/* Allocation Target bar */}
      <div className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {categoryName ? `${categoryName} Target` : "Allocation Target"}
          </h3>
          <div className="text-muted-foreground flex items-center gap-3 text-xs tabular-nums">
            <span>{actualPercent.toFixed(1)}% actual</span>
            <span>/ {categoryPercent.toFixed(1)}% target</span>
          </div>
        </div>
        <div
          className="relative h-4 overflow-hidden rounded"
          style={{ backgroundColor: `${categoryColor}20` }}
        >
          <div
            className="absolute left-0 top-0 h-full transition-all"
            style={{
              width: `${Math.min(actualPercent, 100)}%`,
              backgroundColor: categoryColor,
            }}
          />
          {categoryPercent > 0 && (
            <div
              className="bg-foreground absolute top-0 h-full w-0.5"
              style={{ left: `${Math.min(categoryPercent, 100)}%` }}
            />
          )}
        </div>
      </div>

      {/* Validation warnings and Save/Cancel */}
      {hasUnsavedChanges && (
        <div className="space-y-2">
          {Math.abs(totalPercent - 100) > 0.005 && (
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

      {/* Type filter chips */}
      {allocationId && !isLoading && uniqueTypes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setActiveFilter(null);
              onFilterChange?.(null);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeFilter === null
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {uniqueTypes.map((type) => (
            <button
              key={type}
              onClick={() => {
                const next = activeFilter === type ? null : type;
                setActiveFilter(next);
                onFilterChange?.(next);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                activeFilter === type
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const holdingsList = !allocationId ? (
    <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-md p-4 text-sm">
      <p className="font-medium">No allocation target set</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Please set a target percentage for this category in the main view first, then you can
        allocate to individual holdings.
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
    <div className="space-y-1">
      {filteredHoldings.map((holding, i) => (
        <HoldingTargetRow
          key={holding.symbol}
          holding={holding}
          typeBadge={holding.instrumentTypeCategory || holding.holdingType}
          targetPercent={getDisplayPercent(holding.symbol)}
          isLocked={getIsLocked(holding.symbol)}
          isAutoDistributed={isAutoBalanced(holding.symbol)}
          categoryColor={`${categoryColor}${ALPHAS[Math.min(i, ALPHAS.length - 1)]}`}
          categoryPercent={categoryPercent}
          baseCurrency={baseCurrency}
          totalValue={totalValue}
          onEditChange={handleEditChange}
          onToggleLock={handleToggleLock}
          onDelete={handleDelete}
          onNavigate={handleNavigateToHolding}
          getCascadedPercent={getCascadedPercent}
          hoveredId={hoveredHoldingId}
          onHover={onHoverHolding}
        />
      ))}
    </div>
  );

  if (isInline) {
    return (
      <div className="flex h-full flex-col">
        {stickyHeader}
        <div className="min-h-0 flex-1 overflow-y-auto">{holdingsList}</div>
      </div>
    );
  }

  const content = (
    <div className="space-y-4">
      {stickyHeader}
      {holdingsList}
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {categoryColor && (
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: categoryColor }} />
            )}
            <span>{categoryName || "Category"} Allocation</span>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
