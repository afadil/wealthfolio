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
  isSaving: boolean;
}

interface PendingEdit {
  percent: number;
  isLocked: boolean;
}

export function TargetList({
  deviations,
  targetId,
  onSave,
  onDeleteAllocation,
  isSaving,
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
      if (saved) return saved.targetPercent / 100; // basis points to display %
      return 0;
    },
    [pendingEdits, getSavedAllocation],
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

  const handleStartEdit = useCallback(
    (categoryId: string) => {
      if (getIsLocked(categoryId)) return;
      setEditingCategoryId(categoryId);
      setEditValue(getDisplayPercent(categoryId).toFixed(1));
    },
    [getIsLocked, getDisplayPercent],
  );

  const handleEditChange = useCallback((value: string) => {
    // Allow only numbers and one decimal point
    const sanitized = value.replace(/[^0-9.]/g, "");
    const cleaned = sanitized.replace(/^0+(?=\d)/, "");
    setEditValue(cleaned || "0");
  }, []);

  const handleEditCommit = useCallback(
    (categoryId: string) => {
      const numValue = parseFloat(editValue) || 0;
      const clamped = Math.max(0, Math.min(100, numValue));
      setPendingEdits((prev) => {
        const next = new Map(prev);
        next.set(categoryId, {
          percent: clamped,
          isLocked: getIsLocked(categoryId),
        });
        return next;
      });
      setEditingCategoryId(null);
    },
    [editValue, getIsLocked],
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
      const currentLocked = getIsLocked(categoryId);
      const currentPercent = getDisplayPercent(categoryId);
      setPendingEdits((prev) => {
        const next = new Map(prev);
        next.set(categoryId, {
          percent: currentPercent,
          isLocked: !currentLocked,
        });
        return next;
      });
    },
    [getIsLocked, getDisplayPercent],
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

  const handleSaveAll = useCallback(() => {
    const allAllocations: NewTargetAllocation[] = [];
    for (const d of deviations) {
      const pending = pendingEdits.get(d.categoryId);
      const saved = getSavedAllocation(d.categoryId);

      if (pending && Math.round(pending.percent * 100) > 0) {
        allAllocations.push({
          id: saved?.id,
          targetId: targetId ?? "", // Will be replaced by parent if auto-creating
          categoryId: d.categoryId,
          targetPercent: Math.round(pending.percent * 100),
          isLocked: pending.isLocked,
        });
      } else if (saved && saved.targetPercent > 0) {
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
  }, [deviations, pendingEdits, getSavedAllocation, onSave, targetId]);

  // Calculate effective total target (saved + pending)
  const effectiveTotalTarget = deviations.reduce(
    (sum, d) => sum + getDisplayPercent(d.categoryId),
    0,
  );
  const remaining = 100 - effectiveTotalTarget;

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
                  effectiveTotalTarget > 100 && "text-red-600 dark:text-red-400",
                )}
              >
                {effectiveTotalTarget.toFixed(1)}%
              </p>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground text-xs">Remaining</span>
              <p
                className={cn(
                  "text-2xl font-bold",
                  remaining < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400",
                )}
              >
                {remaining.toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Target vs Actual card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wider">
            Target vs Actual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {deviations.map((d) => {
            const displayPercent = getDisplayPercent(d.categoryId);
            const isLocked = getIsLocked(d.categoryId);
            const drift = d.currentPercent - displayPercent;
            const isEditing = editingCategoryId === d.categoryId;

            return (
              <div key={d.categoryId} className="rounded-lg border p-4">
                {/* Header: name + delete */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="font-medium">{d.categoryName}</span>
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
                <div className="mb-3 grid grid-cols-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Target</span>
                    <p className="font-semibold">{displayPercent.toFixed(0)}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Actual</span>
                    <p className="font-semibold">{d.currentPercent.toFixed(0)}%</p>
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
                        className="absolute inset-y-0 left-0 rounded opacity-60"
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
                        type="text"
                        value={editValue}
                        onChange={(e) => handleEditChange(e.target.value)}
                        onBlur={() => handleEditCommit(d.categoryId)}
                        onKeyDown={(e) => handleEditKeyDown(e, d.categoryId)}
                        autoFocus
                        className="border-primary bg-background text-foreground h-7 w-16 rounded border px-2 text-right text-sm font-semibold"
                      />
                    ) : (
                      <span
                        onClick={() => handleStartEdit(d.categoryId)}
                        className={cn(
                          "w-16 text-right text-sm font-semibold transition-colors",
                          isLocked
                            ? "cursor-not-allowed opacity-50"
                            : "hover:text-primary cursor-pointer",
                        )}
                      >
                        {displayPercent.toFixed(1)}%
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
                    <span className="w-16 text-right text-sm">{d.currentPercent.toFixed(0)}%</span>
                    {/* Spacer to align with lock button */}
                    <div className="w-7 shrink-0" />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Save button */}
          {hasPendingEdits && (
            <Button className="w-full" onClick={handleSaveAll} disabled={isSaving}>
              <Icons.Check className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save All Targets"}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
