import { Icons } from "@/components/ui/icons";
import { useSettingsContext } from "@/lib/settings-provider";
import type { AssetClassTarget } from "@/lib/types";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, Button, Card, CardContent, CardHeader, CardTitle, TargetPercentSlider } from "@wealthfolio/ui";
import { useState } from "react";
import { useProportionalAllocation } from "../hooks";
import type { CurrentAllocation } from "../hooks/use-current-allocation";
import { DonutChartFull } from "./donut-chart-full";

interface AllocationPieChartViewProps {
  currentAllocation: CurrentAllocation;
  targets: AssetClassTarget[];
  onSliceClick: (assetClass: string) => void;
  onUpdateTarget?: (assetClass: string, newPercent: number) => Promise<void>;
  onAddTarget?: () => void;
  onDeleteTarget?: (assetClass: string) => Promise<void>;
  accountId?: string;
}

export function AllocationPieChartView({
  currentAllocation,
  targets,
  onSliceClick,
  onUpdateTarget,
  onAddTarget,
  onDeleteTarget,
  accountId = '',
}: AllocationPieChartViewProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency || "USD";
  const [isSaving, setIsSaving] = useState(false);
  const [lockedAssets, setLockedAssets] = useState<Set<string>>(new Set());
  const [draggingValues, setDraggingValues] = useState<Record<string, number>>({});
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [deletingAsset, setDeletingAsset] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lockedDeleteDialogOpen, setLockedDeleteDialogOpen] = useState(false);
  const [lockedDeleteAsset, setLockedDeleteAsset] = useState<string | null>(null);
  const [lockRefresh, setLockRefresh] = useState(0); // Force re-render when lock changes
  const { calculateProportionalTargets } = useProportionalAllocation();

  // Use integer arithmetic to avoid floating point precision issues
  const allocatedPercentageInt = Math.round(targets.reduce((sum, t) => sum + t.targetPercent, 0) * 100);
  const allocatedPercentage = allocatedPercentageInt / 100;
  const remaining = (10000 - allocatedPercentageInt) / 100;

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: baseCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Sort targets by actual % descending
  const sortedTargets = [...targets].sort((a, b) => {
    const actualA = currentAllocation.assetClasses.find((ac) => ac.assetClass === a.assetClass)?.actualPercent || 0;
    const actualB = currentAllocation.assetClasses.find((ac) => ac.assetClass === b.assetClass)?.actualPercent || 0;
    return actualB - actualA;
  });

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* LEFT: 60% (3 columns) */}
      <div className="col-span-3 space-y-6">
        {/* Current Allocation Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Current Allocation</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              {formatCurrency(currentAllocation.totalValue)}
            </p>
          </CardHeader>
          <CardContent>
            {/* CHANGED: minHeight from 700px → use h-screen or fixed height */}
            <div style={{ minHeight: "600px" }}>
              <DonutChartFull
                currentAllocation={currentAllocation}
                targets={targets}
                onSliceClick={onSliceClick}
                baseCurrency={baseCurrency}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT: 40% (2 columns) */}
      <div className="col-span-2 space-y-6">
        {/* Target Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Target Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Allocated</p>
              <p className="text-3xl font-bold">{allocatedPercentage.toFixed(2)}%</p>
            </div>

            <div className="w-px bg-border" />

            <div>
              <p className="text-xs text-muted-foreground mb-1">Remaining</p>
              <p
                className={`text-3xl font-bold ${
                  remaining < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400"
                }`}
              >
                {remaining.toFixed(2)}%
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Target vs Actual Card (Scrollable) */}
        <Card className="flex flex-col flex-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">Target vs Actual</CardTitle>
              {onAddTarget && (
                <Button
                  onClick={onAddTarget}
                  disabled={isSaving || isDeleting}
                  size="sm"
                  className="text-xs"
                >
                  + Add Target
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            <div className="space-y-2">
              {sortedTargets.map((target) => {
                const actual = currentAllocation.assetClasses.find(
                  (ac) => ac.assetClass === target.assetClass
                );
                const drift = (actual?.actualPercent || 0) - target.targetPercent;
                const driftColor =
                  Math.abs(drift) < 2
                    ? "text-green-600 dark:text-green-400"
                    : drift > 0
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-orange-600 dark:text-orange-400";

                return (
                  <div key={target.assetClass} className="rounded-lg bg-muted/30 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{target.assetClass}</span>
                      {onDeleteTarget && (
                        <div className="flex gap-1 items-center">
                          {deletingAsset === target.assetClass ? (
                            <div className="flex gap-2 text-xs">
                              <button
                                onClick={async () => {
                                  setIsDeleting(true);
                                  try {
                                    await onDeleteTarget(target.assetClass);
                                    setDeletingAsset(null);
                                  } catch (err) {
                                    console.error("Failed to delete target:", err);
                                  } finally {
                                    setIsDeleting(false);
                                  }
                                }}
                                disabled={isDeleting}
                                className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeletingAsset(null)}
                                disabled={isDeleting}
                                className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  if (lockedAssets.has(target.assetClass)) {
                                    setLockedDeleteAsset(target.assetClass);
                                    setLockedDeleteDialogOpen(true);
                                    return;
                                  }
                                  setDeletingAsset(target.assetClass);
                                }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Delete target"
                              >
                                <Icons.Trash className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-8 text-xs">
                      <div>
                        <p className="text-muted-foreground">Target</p>
                        {editingAsset === target.assetClass ? (
                          <input
                            type="text"
                            value={editValues[target.assetClass] ?? target.targetPercent.toFixed(0)}
                            onChange={(e) => {
                              const sanitized = e.target.value.replace(/[^0-9.]/g, '');
                              const cleaned = sanitized.replace(/^0+(?=\d)/, '');
                              setEditValues((prev) => ({
                                ...prev,
                                [target.assetClass]: cleaned || '0',
                              }));
                            }}
                            onBlur={async () => {
                              const numValue = parseFloat(editValues[target.assetClass] ?? target.targetPercent.toFixed(0)) || 0;
                              const clamped = Math.max(0, Math.min(100, numValue));
                              setEditingAsset(null);
                              setEditValues((prev) => {
                                const newValues = { ...prev };
                                delete newValues[target.assetClass];
                                return newValues;
                              });
                              if (onUpdateTarget && clamped !== target.targetPercent) {
                                setIsSaving(true);
                                try {
                                  // Calculate proportional adjustment
                                  const proportionalTargets = calculateProportionalTargets(
                                    targets,
                                    target.assetClass,
                                    clamped
                                  );
                                  // Update all targets at once
                                  for (const t of proportionalTargets) {
                                    await onUpdateTarget(t.assetClass, t.targetPercent);
                                  }
                                } catch (err) {
                                  console.error("Failed to update target:", err);
                                } finally {
                                  setIsSaving(false);
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                              if (e.key === 'Escape') {
                                setEditingAsset(null);
                                setEditValues((prev) => {
                                  const newValues = { ...prev };
                                  delete newValues[target.assetClass];
                                  return newValues;
                                });
                              }
                            }}
                            autoFocus
                            className="w-12 px-1 py-0.5 border border-primary rounded bg-background text-foreground font-semibold text-xs"
                            placeholder="0"
                          />
                        ) : (
                          <p
                            onClick={() => {
                              setEditingAsset(target.assetClass);
                              setEditValues((prev) => ({
                                ...prev,
                                [target.assetClass]: target.targetPercent.toFixed(0),
                              }));
                            }}
                            className="font-semibold cursor-pointer hover:text-primary transition-colors"
                          >
                            {target.targetPercent.toFixed(0)}%
                          </p>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground">Actual</p>
                        <p className="font-semibold">{(actual?.actualPercent || 0).toFixed(0)}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground">Drift</p>
                        <p className={`font-semibold ${driftColor}`}>
                          {drift > 0 ? "+" : ""}{drift.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    {/* Stacked Progress Bars - Target + Actual with Overlay Slider */}
                    <div className="space-y-2 pt-2">
                      {/* Target Bar - Overlay Slider */}
                      <div className="flex items-center gap-2">
                        <TargetPercentSlider
                          value={draggingValues[target.assetClass] ?? target.targetPercent}
                          onChange={(val) => {
                            setDraggingValues((prev) => ({
                              ...prev,
                              [target.assetClass]: val,
                            }));
                          }}
                          onChangeEnd={async (val) => {
                            if (!onUpdateTarget) return;

                            setDraggingValues((prev) => {
                              const newValues = { ...prev };
                              delete newValues[target.assetClass];
                              return newValues;
                            });

                            setIsSaving(true);
                            try {
                              // Calculate proportional adjustment
                              const proportionalTargets = calculateProportionalTargets(
                                targets,
                                target.assetClass,
                                val
                              );

                              // Update all targets at once
                              for (const t of proportionalTargets) {
                                await onUpdateTarget(t.assetClass, t.targetPercent);
                              }
                            } catch (error) {
                              console.error("Failed to update targets:", error);
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                          label="Target"
                          disabled={isSaving || lockedAssets.has(target.assetClass)}
                          showValue={false}
                          isLocked={lockedAssets.has(target.assetClass)}
                          onToggleLock={() => {
                            const newLocked = new Set(lockedAssets);
                            if (newLocked.has(target.assetClass)) {
                              newLocked.delete(target.assetClass);
                            } else {
                              newLocked.add(target.assetClass);
                            }
                            setLockedAssets(newLocked);
                          }}
                          overlay={true}
                          barColor="bg-chart-2"
                        />
                      </div>
                      {/* Actual Bar */}
                      <div className="flex items-center gap-2">
                        <div className="bg-secondary relative h-6 flex-1 overflow-hidden rounded flex items-center justify-between">
                          <div
                            className="bg-green-600 dark:bg-green-500 absolute top-0 left-0 h-full rounded transition-all"
                            style={{ width: `${Math.min(actual?.actualPercent || 0, 100)}%` }}
                          />
                          {/* Label on left (inside colored portion) */}
                          <div className="text-background absolute top-0 left-0 flex h-full items-center px-2 text-xs font-medium z-10">
                            <span className="whitespace-nowrap">Actual</span>
                          </div>
                          {/* Percentage on right (inside bar, at end of colored portion) */}
                          <div className="text-foreground absolute top-0 right-0 flex h-full items-center px-2 text-xs font-medium z-10">
                            <span className="whitespace-nowrap">{(actual?.actualPercent || 0).toFixed(0)}%</span>
                          </div>
                        </div>
                        {/* Placeholder for lock icon to align bars */}
                        <div className="h-6 w-6 flex-shrink-0" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Locked Delete Dialog */}
      <AlertDialog open={lockedDeleteDialogOpen} onOpenChange={setLockedDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Cannot Delete Locked Target</AlertDialogTitle>
          <AlertDialogDescription>
            The <strong>{lockedDeleteAsset}</strong> allocation target is locked. Please unlock it first before deleting.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogAction onClick={() => setLockedDeleteDialogOpen(false)}>
              Got it
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
