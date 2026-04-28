import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@wealthfolio/ui/lib/utils";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { useTargetAllocations } from "@/hooks/use-portfolio-targets";
import type { AllocationDeviation, NewTargetAllocation, RebalanceMode } from "@/lib/types";

interface TargetListProps {
  deviations: AllocationDeviation[];
  targetId: string | undefined;
  rebalanceMode?: RebalanceMode;
  onSave: (allocations: NewTargetAllocation[]) => void;
  onDeleteAllocation: (allocationId: string) => void;
  onToggleLock: (allocation: NewTargetAllocation) => void;
  isSaving: boolean;
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
  onCategoryClick?: (
    categoryId: string,
    categoryName: string,
    categoryColor: string,
    categoryPercent: number,
    actualPercent: number,
    allocationId?: string,
  ) => void;
}

interface PendingEdit {
  percent: number;
  isLocked: boolean;
  userSet?: boolean; // True if user explicitly set this value (not auto-distributed)
}

export function TargetList({
  deviations,
  targetId,
  rebalanceMode,
  onSave,
  onDeleteAllocation,
  onToggleLock,
  isSaving,
  hoveredId = null,
  onHover,
  onCategoryClick,
}: TargetListProps) {
  const navigate = useNavigate();
  const { allocations } = useTargetAllocations(targetId);

  // Track pending edits (not yet saved)
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
  // Track which field is being edited
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const hasPendingEdits = pendingEdits.size > 0;

  // Reset pending edits when target changes
  useEffect(() => {
    setPendingEdits(new Map());
    setEditingCategoryId(null);
  }, [targetId]);

  const getSavedAllocation = useCallback(
    (categoryId: string) => allocations.find((a) => a.categoryId === categoryId),
    [allocations],
  );

  const getDisplayPercent = useCallback(
    (categoryId: string): number => {
      const pending = pendingEdits.get(categoryId);
      if (pending) return pending.percent;

      const saved = getSavedAllocation(categoryId);

      // If no pending edits, just show saved value (no auto-distribution)
      if (pendingEdits.size === 0) {
        return saved ? saved.targetPercent / 100 : 0;
      }

      // If this category is locked, always show saved value (never auto-distribute)
      if (saved?.isLocked) {
        return saved.targetPercent / 100;
      }

      // Auto-distribution mode: user is actively editing
      // Calculate what this category should get based on user-set pending edits + locked allocations
      const totalUserSet = deviations.reduce((sum, d) => {
        const pending = pendingEdits.get(d.categoryId);
        // Count user-set pending edits
        if (pending?.userSet) {
          return sum + pending.percent;
        }
        // Count locked allocations as "user-set"
        const savedAlloc = getSavedAllocation(d.categoryId);
        if (savedAlloc?.isLocked) {
          return sum + savedAlloc.targetPercent / 100;
        }
        return sum;
      }, 0);

      const remainder = 100 - totalUserSet;

      if (remainder > 0) {
        // Find all categories eligible for auto-distribution
        // Eligible = no user-set pending edit AND not locked
        const eligibleCategories = deviations.filter((d) => {
          const pending = pendingEdits.get(d.categoryId);
          if (pending?.userSet) return false;
          const savedAlloc = getSavedAllocation(d.categoryId);
          return !savedAlloc?.isLocked;
        });

        if (eligibleCategories.length > 0) {
          // Calculate total of saved targets for eligible categories
          const totalEligibleTargets = eligibleCategories.reduce((sum, d) => {
            const savedAlloc = getSavedAllocation(d.categoryId);
            return sum + (savedAlloc ? savedAlloc.targetPercent / 100 : 0);
          }, 0);

          const currentCategory = deviations.find((d) => d.categoryId === categoryId);

          if (currentCategory && totalEligibleTargets > 0 && saved) {
            // Distribute remainder proportionally based on saved targets
            const savedPercent = saved.targetPercent / 100;
            return (savedPercent / totalEligibleTargets) * remainder;
          } else if (currentCategory && totalEligibleTargets === 0) {
            // If no eligible categories have saved targets, distribute equally
            return remainder / eligibleCategories.length;
          }
        }
      }

      // Fallback: return saved value
      return saved ? saved.targetPercent / 100 : 0;
    },
    [pendingEdits, getSavedAllocation, deviations],
  );

  const getIsLocked = useCallback(
    (categoryId: string): boolean => {
      const pending = pendingEdits.get(categoryId);
      if (pending) return pending.isLocked;
      const saved = getSavedAllocation(categoryId);
      return saved?.isLocked ?? false;
    },
    [pendingEdits, getSavedAllocation],
  );

  const isAutoBalanced = useCallback(
    (categoryId: string): boolean => {
      // A value is auto-balanced (italic) if:
      // 1. User has at least one pending edit (they're actively editing)
      // 2. This category doesn't have a user-set pending edit
      // 3. This category isn't locked
      // The display value comes from auto-distribution, not user input

      // Only show auto-balanced style when user is actively editing
      if (pendingEdits.size === 0) return false;

      // If this category has a user-set pending edit, it's not auto-balanced
      const pending = pendingEdits.get(categoryId);
      if (pending?.userSet) return false;

      // If locked, it's user-set (not auto-balanced)
      const saved = getSavedAllocation(categoryId);
      if (saved?.isLocked) return false;

      // If we got here: user is editing other categories, this one is not user-set,
      // and this one is not locked → it's auto-balanced
      return true;
    },
    [pendingEdits, getSavedAllocation],
  );

  const handleStartEdit = useCallback(
    (categoryId: string) => {
      if (getIsLocked(categoryId)) return;
      setEditingCategoryId(categoryId);
      setEditValue(getDisplayPercent(categoryId).toFixed(2));
    },
    [getIsLocked, getDisplayPercent],
  );

  const handleEditChange = useCallback((value: string) => {
    // Allow empty string for clearing
    if (value === "") {
      setEditValue("");
      return;
    }

    // Allow only numbers and one decimal point
    const sanitized = value.replace(/[^0-9.]/g, "");

    // Limit to 2 decimal places
    const parts = sanitized.split(".");
    let result = sanitized;

    if (parts.length > 2) {
      // Multiple decimal points, keep only first one
      result = parts[0] + "." + parts.slice(1).join("");
    } else if (parts[1] && parts[1].length > 2) {
      // More than 2 decimals, truncate to 2
      result = parts[0] + "." + parts[1].substring(0, 2);
    }

    // Remove leading zeros (except for "0." case)
    const cleaned = result.replace(/^0+(?=\d)/, "");
    setEditValue(cleaned);
  }, []);

  const handleEditCommit = useCallback(
    (categoryId: string) => {
      // If empty, treat as 0
      const numValue = editValue === "" ? 0 : parseFloat(editValue);
      const clamped = Math.max(0, Math.min(100, numValue));
      // Round to 2 decimals
      const rounded = Math.round(clamped * 100) / 100;

      setPendingEdits((prev) => {
        const next = new Map(prev);
        next.set(categoryId, {
          percent: rounded,
          isLocked: getIsLocked(categoryId),
          userSet: true, // Mark as explicitly set by user
        });

        // Clean up pending edits that were NOT explicitly set by user
        // Keep: 1) user-set edits, 2) locked categories
        const toKeep = new Map<string, PendingEdit>();
        for (const [catId, edit] of next.entries()) {
          const saved = getSavedAllocation(catId);
          if (edit.userSet || saved?.isLocked) {
            toKeep.set(catId, edit);
          }
        }
        return toKeep;
      });
      setEditingCategoryId(null);
    },
    [editValue, getIsLocked, getSavedAllocation],
  );

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent, categoryId: string) => {
      if (e.key === "Enter") handleEditCommit(categoryId);
      if (e.key === "Escape") setEditingCategoryId(null);
    },
    [handleEditCommit],
  );

  const handleToggleLock = useCallback(
    (categoryId: string) => {
      const pending = pendingEdits.get(categoryId);
      const saved = getSavedAllocation(categoryId);
      const currentLocked = getIsLocked(categoryId);
      const displayPercent = getDisplayPercent(categoryId);

      // If there's a pending edit (user has modified this), toggle lock in pending
      if (pending?.userSet) {
        setPendingEdits((prev) => {
          const next = new Map(prev);
          next.set(categoryId, {
            ...pending,
            isLocked: !currentLocked,
          });
          return next;
        });
        return;
      }

      // If user is actively editing (auto-distribution is active)
      // Create a pending edit to lock the auto-distributed value
      if (pendingEdits.size > 0 && displayPercent > 0) {
        setPendingEdits((prev) => {
          const next = new Map(prev);
          next.set(categoryId, {
            percent: displayPercent,
            isLocked: !currentLocked,
            userSet: true,
          });
          return next;
        });
        return;
      }

      // If there's a saved allocation and no active editing, toggle lock via API
      if (saved) {
        onToggleLock({
          id: saved.id,
          targetId: saved.targetId,
          categoryId: saved.categoryId,
          targetPercent: saved.targetPercent,
          isLocked: !saved.isLocked,
        });
        return;
      }
    },
    [pendingEdits, getSavedAllocation, getIsLocked, getDisplayPercent, onToggleLock],
  );

  const handleDelete = useCallback(
    (categoryId: string) => {
      const saved = getSavedAllocation(categoryId);
      if (saved) {
        onDeleteAllocation(saved.id);
      }
      setPendingEdits((prev) => {
        const next = new Map(prev);
        next.delete(categoryId);
        return next;
      });
    },
    [getSavedAllocation, onDeleteAllocation],
  );

  const handleClearAll = useCallback(() => {
    // Delete all saved allocations
    for (const allocation of allocations) {
      onDeleteAllocation(allocation.id);
    }
    // Clear all pending edits
    setPendingEdits(new Map());
  }, [allocations, onDeleteAllocation]);

  // Calculate actual total from display values (includes auto-distribution)
  const actualTotalTarget = deviations.reduce((sum, d) => {
    return sum + getDisplayPercent(d.categoryId);
  }, 0);
  const actualRemainingValue = 100 - actualTotalTarget;

  // Our own validation based on actual user inputs
  const isValid = actualTotalTarget <= 100 && actualTotalTarget >= 0;
  const error = isValid
    ? null
    : `Total must equal 100%. Current total: ${actualTotalTarget.toFixed(1)}%`;

  const handleSaveAll = useCallback(() => {
    if (!isValid) {
      // Don't save if validation fails
      return;
    }

    const allAllocations: NewTargetAllocation[] = [];
    for (const d of deviations) {
      const pending = pendingEdits.get(d.categoryId);
      const saved = getSavedAllocation(d.categoryId);
      const displayPercent = getDisplayPercent(d.categoryId);

      if (pending !== undefined) {
        // Save pending edits (even if 0%)
        allAllocations.push({
          id: saved?.id,
          targetId: targetId ?? "", // Will be replaced by parent if auto-creating
          categoryId: d.categoryId,
          targetPercent: Math.round(pending.percent * 100),
          isLocked: pending.isLocked,
        });
      } else if (displayPercent > 0) {
        // Save preview values (auto-distributed values that user accepted)
        // Only save if there's no pending edit and displayPercent > 0
        allAllocations.push({
          id: saved?.id,
          targetId: targetId ?? "", // Will be replaced by parent if auto-creating
          categoryId: d.categoryId,
          targetPercent: Math.round(displayPercent * 100),
          isLocked: getIsLocked(d.categoryId),
        });
      } else if (saved && saved.targetPercent > 0) {
        // Keep existing saved allocations
        allAllocations.push({
          id: saved.id,
          targetId: targetId ?? "",
          categoryId: d.categoryId,
          targetPercent: saved.targetPercent,
          isLocked: saved.isLocked,
        });
      }
    }

    if (allAllocations.length > 0) {
      onSave(allAllocations);
      setPendingEdits(new Map());
    }
  }, [
    deviations,
    pendingEdits,
    getSavedAllocation,
    getDisplayPercent,
    getIsLocked,
    onSave,
    targetId,
    isValid,
  ]);

  if (deviations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-muted-foreground text-center text-sm">
            No asset classes found. Add holdings to see allocations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider">
            Allocation Targets
          </CardTitle>
          <div className="flex items-center gap-2">
            {rebalanceMode && (
              <button
                onClick={() => navigate("/settings/allocation-strategy")}
                className="text-muted-foreground bg-muted hover:text-foreground rounded-full px-2.5 py-0.5 text-xs transition-colors"
                title="Rebalancing strategy — click to change"
              >
                {rebalanceMode === "buy_only" ? "Buy only" : "Buy & Sell"}
              </button>
            )}
            {(allocations.length > 0 || hasPendingEdits) && (
              <Button variant="ghost" size="sm" onClick={handleClearAll} className="h-7 text-xs">
                <Icons.Trash className="mr-1.5 h-3 w-3" />
                Clear All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4 pl-6 pr-4">
        {/* Column headers */}
        <div className="mb-1 grid grid-cols-[150px_1fr_64px_48px_52px] gap-3 px-0">
          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
            Class
          </p>
          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
            Actual · notch = target
          </p>
          <p className="text-muted-foreground text-right text-[10px] font-semibold uppercase tracking-wider">
            Weight
          </p>
          <p className="text-muted-foreground text-right text-[10px] font-semibold uppercase tracking-wider">
            Drift
          </p>
          <div />
        </div>

        {/* Rows */}
        {deviations.map((d) => {
          const displayPercent = getDisplayPercent(d.categoryId);
          const isLocked = getIsLocked(d.categoryId);
          const isEditing = editingCategoryId === d.categoryId;
          const drift = d.currentPercent - displayPercent;
          const absDrift = Math.abs(drift);
          const isRowHovered = hoveredId === d.categoryId;
          const isOtherHovered = hoveredId !== null && !isRowHovered;

          const driftColor =
            absDrift < 1
              ? "text-green-600 dark:text-green-400"
              : absDrift < 5
                ? "text-yellow-600 dark:text-yellow-500"
                : "text-red-600 dark:text-red-400";

          const driftBg =
            absDrift < 1
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"
              : absDrift < 5
                ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900"
                : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900";

          const driftLabel = absDrift < 1 ? "✓" : `${drift > 0 ? "+" : ""}${drift.toFixed(1)}%`;

          return (
            <div
              key={d.categoryId}
              className={cn(
                "group grid grid-cols-[150px_1fr_64px_48px_52px] items-center gap-3 border-t py-5 transition-all",
                isOtherHovered && "opacity-40",
                isRowHovered && "bg-black/[.03] dark:bg-white/[.03]",
              )}
              onMouseEnter={() => onHover?.(d.categoryId)}
              onMouseLeave={() => onHover?.(null)}
            >
              {/* Col 1 — Class label */}
              <div className="flex min-w-0 items-center gap-2 pl-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: d.color }}
                />
                <div className="min-w-0">
                  <button
                    className={cn(
                      "block truncate text-left text-sm font-semibold leading-tight",
                      onCategoryClick &&
                        d.categoryId !== "CASH" &&
                        d.categoryId !== "CASH_BANK_DEPOSITS" &&
                        "hover:text-primary cursor-pointer",
                    )}
                    onClick={() => {
                      if (
                        onCategoryClick &&
                        d.categoryId !== "CASH" &&
                        d.categoryId !== "CASH_BANK_DEPOSITS"
                      ) {
                        const savedAllocation = getSavedAllocation(d.categoryId);
                        onCategoryClick(
                          d.categoryId,
                          d.categoryName,
                          d.color,
                          displayPercent,
                          d.currentPercent,
                          savedAllocation?.id,
                        );
                      }
                    }}
                    title={
                      onCategoryClick &&
                      d.categoryId !== "CASH" &&
                      d.categoryId !== "CASH_BANK_DEPOSITS"
                        ? "View holdings"
                        : undefined
                    }
                  >
                    {d.categoryName}
                  </button>
                </div>
              </div>

              {/* Col 2 — Bullet bar */}
              <button
                className={cn(
                  "relative h-9 w-full",
                  onCategoryClick &&
                    d.categoryId !== "CASH" &&
                    d.categoryId !== "CASH_BANK_DEPOSITS" &&
                    "cursor-pointer",
                )}
                onClick={() => {
                  if (
                    onCategoryClick &&
                    d.categoryId !== "CASH" &&
                    d.categoryId !== "CASH_BANK_DEPOSITS"
                  ) {
                    const savedAllocation = getSavedAllocation(d.categoryId);
                    onCategoryClick(
                      d.categoryId,
                      d.categoryName,
                      d.color,
                      displayPercent,
                      d.currentPercent,
                      savedAllocation?.id,
                    );
                  }
                }}
                title={
                  onCategoryClick &&
                  d.categoryId !== "CASH" &&
                  d.categoryId !== "CASH_BANK_DEPOSITS"
                    ? "View holdings"
                    : undefined
                }
              >
                {/* Track + fill + notch — clipped by container */}
                <div className="bg-muted absolute inset-y-0 left-0 right-0 my-auto h-4 overflow-hidden rounded">
                  {/* Actual fill */}
                  <div
                    className="absolute left-0 top-0 h-full transition-all"
                    style={{
                      width: `${Math.min(d.currentPercent, 100)}%`,
                      backgroundColor: d.color,
                    }}
                  />
                  {/* Target notch */}
                  {displayPercent > 0 && (
                    <div
                      className="bg-foreground absolute top-0 h-full w-0.5"
                      style={{ left: `${Math.min(displayPercent, 100)}%` }}
                    />
                  )}
                </div>
              </button>

              {/* Col 3 — Weight */}
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums">{d.currentPercent.toFixed(1)}%</p>
                {/* Target — click to edit */}
                {isEditing ? (
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editValue}
                    onChange={(e) => handleEditChange(e.target.value)}
                    onBlur={() => handleEditCommit(d.categoryId)}
                    onKeyDown={(e) => handleEditKeyDown(e, d.categoryId)}
                    autoFocus
                    className="border-primary bg-background text-foreground mt-0.5 h-5 w-full rounded border px-1 text-right text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                ) : (
                  <button
                    onClick={() => handleStartEdit(d.categoryId)}
                    disabled={isLocked}
                    className={cn(
                      "text-muted-foreground mt-0.5 block w-full text-right text-xs tabular-nums transition-colors",
                      isLocked
                        ? "cursor-not-allowed opacity-40"
                        : isAutoBalanced(d.categoryId)
                          ? "cursor-pointer italic"
                          : "hover:text-foreground cursor-pointer",
                    )}
                    title={isLocked ? "Locked" : "Click to set target"}
                  >
                    {displayPercent > 0 ? `/ ${displayPercent.toFixed(1)}%` : "set target"}
                  </button>
                )}
              </div>

              {/* Col 4 — Drift badge */}
              <div className="flex justify-end">
                <span
                  className={cn(
                    "inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                    driftColor,
                    driftBg,
                  )}
                >
                  {driftLabel}
                </span>
              </div>

              {/* Col 5 — Lock + Delete (visible on hover, lock always shown when locked) */}
              <div className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  onClick={() => handleToggleLock(d.categoryId)}
                  className={cn(
                    "h-6 w-6 items-center justify-center rounded transition-colors",
                    isLocked
                      ? "text-foreground flex"
                      : "text-muted-foreground hover:text-foreground hidden group-hover:flex",
                  )}
                  title={isLocked ? "Unlock" : "Lock"}
                >
                  {isLocked ? (
                    <Icons.Lock className="h-3 w-3" />
                  ) : (
                    <Icons.LockOpen className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(d.categoryId)}
                  className="text-muted-foreground hidden h-6 w-6 items-center justify-center rounded transition-colors hover:text-red-500 group-hover:flex"
                  title="Remove target"
                >
                  <Icons.Trash className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-muted-foreground text-xs tabular-nums",
                actualTotalTarget > 100 && "text-red-600 dark:text-red-400",
              )}
            >
              {actualTotalTarget.toFixed(1)}% allocated
            </span>
            {actualRemainingValue !== 0 && (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  actualRemainingValue < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground",
                )}
              >
                {actualRemainingValue > 0 ? "+" : ""}
                {actualRemainingValue.toFixed(1)}% remaining
              </span>
            )}
          </div>
          {hasPendingEdits && (
            <Button size="sm" onClick={handleSaveAll} disabled={isSaving || !isValid}>
              <Icons.Check className="mr-1.5 h-3.5 w-3.5" />
              {isSaving ? "Saving..." : "Save Targets"}
            </Button>
          )}
        </div>

        {!isValid && error && (
          <p className="mt-2 text-center text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
