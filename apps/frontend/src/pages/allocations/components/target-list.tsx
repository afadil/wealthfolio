import { useCallback, useEffect, useState } from "react";
import { cn } from "@wealthfolio/ui/lib/utils";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { useTargetAllocations } from "@/hooks/use-portfolio-targets";
import type { AllocationDeviation, NewTargetAllocation } from "@/lib/types";

interface TargetListProps {
  deviations: AllocationDeviation[];
  targetId: string | undefined;
  onSave: (allocations: NewTargetAllocation[]) => void;
  onDeleteAllocation: (allocationId: string) => void;
  onToggleLock: (allocation: NewTargetAllocation) => void;
  isSaving: boolean;
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
  onSave,
  onDeleteAllocation,
  onToggleLock,
  isSaving,
  onCategoryClick,
}: TargetListProps) {
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
    <>
      {/* Target Status card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wider">
            Target Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-muted-foreground text-xs">Allocated</span>
              <p
                className={cn(
                  "text-2xl font-bold",
                  actualTotalTarget > 100 && "text-red-600 dark:text-red-400",
                )}
              >
                {actualTotalTarget.toFixed(1)}%
              </p>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground text-xs">Remaining</span>
              <p
                className={cn(
                  "text-2xl font-bold",
                  actualRemainingValue < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400",
                )}
              >
                {actualRemainingValue.toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Target vs Actual card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium uppercase tracking-wider">
              Target vs Actual
            </CardTitle>
            {(allocations.length > 0 || hasPendingEdits) && (
              <Button variant="ghost" size="sm" onClick={handleClearAll} className="h-7 text-xs">
                <Icons.Trash className="mr-1.5 h-3 w-3" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {deviations.map((d) => {
            const displayPercent = getDisplayPercent(d.categoryId);
            const isLocked = getIsLocked(d.categoryId);
            const drift = d.currentPercent - displayPercent;
            const isEditing = editingCategoryId === d.categoryId;

            return (
              <div key={d.categoryId} className="space-y-3 py-3">
                {/* Header: name + holdings button + delete */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="font-medium">{d.categoryName}</span>
                    {onCategoryClick &&
                      d.categoryId !== "CASH" &&
                      d.categoryId !== "CASH_BANK_DEPOSITS" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            const savedAllocation = getSavedAllocation(d.categoryId);
                            onCategoryClick(
                              d.categoryId,
                              d.categoryName,
                              d.color,
                              displayPercent,
                              d.currentPercent,
                              savedAllocation?.id,
                            );
                          }}
                          title="View and edit holdings"
                        >
                          <Icons.ChevronRight className="h-3 w-3" />
                          Holdings
                        </Button>
                      )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleDelete(d.categoryId)}
                    title="Remove target"
                  >
                    <Icons.Trash className="h-3 w-3" />
                  </Button>
                </div>

                {/* Stats: Target, Actual, Drift */}
                <div className="grid grid-cols-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Target</span>
                    <p className="font-semibold">{displayPercent.toFixed(2)}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Actual</span>
                    <p className="font-semibold">{d.currentPercent.toFixed(2)}%</p>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground text-xs">Drift</span>
                    <p
                      className={cn(
                        "font-semibold",
                        drift > 0.5 && "text-green-600 dark:text-green-400",
                        drift < -0.5 && "text-red-600 dark:text-red-400",
                      )}
                    >
                      {drift > 0 ? "+" : ""}
                      {drift.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Target bar with click-to-edit + lock */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="bg-muted relative h-7 flex-1 overflow-hidden rounded">
                      <div
                        className="absolute inset-y-0 left-0 rounded opacity-50 dark:opacity-70"
                        style={{
                          width: `${Math.min(displayPercent, 100)}%`,
                          backgroundColor: d.color,
                        }}
                      />
                      <span className="relative z-10 flex h-full items-center px-2 text-xs font-medium">
                        Target
                      </span>
                    </div>
                    {/* Click-to-edit target value */}
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
                        className="border-primary bg-background text-foreground h-7 w-16 rounded border px-2 text-right text-sm font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    ) : (
                      <span
                        onClick={() => handleStartEdit(d.categoryId)}
                        className={cn(
                          "w-16 text-right text-sm font-semibold transition-colors",
                          isLocked
                            ? "cursor-not-allowed opacity-50"
                            : "hover:text-primary cursor-pointer",
                          isAutoBalanced(d.categoryId) &&
                            "text-muted-foreground font-normal italic",
                        )}
                      >
                        {displayPercent.toFixed(2)}%
                      </span>
                    )}
                    {/* Lock toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleLock(d.categoryId)}
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors",
                        isLocked
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title={isLocked ? "Unlock" : "Lock"}
                    >
                      {isLocked ? (
                        <Icons.Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Icons.LockOpen className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Actual bar (read-only, partial fill) */}
                  <div className="flex items-center gap-2">
                    <div className="bg-muted relative h-7 flex-1 overflow-hidden rounded">
                      <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: `${Math.min(d.currentPercent, 100)}%`,
                          backgroundColor: d.color,
                        }}
                      />
                      <span className="relative z-10 flex h-full items-center px-2 text-xs font-medium">
                        Actual
                      </span>
                    </div>
                    <span className="w-16 text-right text-sm">{d.currentPercent.toFixed(2)}%</span>
                    {/* Spacer to align with lock button */}
                    <div className="w-7 shrink-0" />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Save button */}
          {hasPendingEdits && (
            <Button className="w-full" onClick={handleSaveAll} disabled={isSaving || !isValid}>
              <Icons.Check className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save All Targets"}
            </Button>
          )}
          {/* Validation error message */}
          {!isValid && error && (
            <p className="mt-2 text-center text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
