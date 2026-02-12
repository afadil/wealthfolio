import { useCallback, useEffect, useState } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { cn } from "@wealthfolio/ui/lib/utils";
import { formatAmount } from "@wealthfolio/ui";

import { useTargetAllocations } from "@/hooks/use-portfolio-targets";
import { useSettingsContext } from "@/lib/settings-provider";
import type { AllocationDeviation, NewTargetAllocation } from "@/lib/types";

interface CategorySidePanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  targetId: string;
  deviation: AllocationDeviation | null;
  onSave: (allocations: NewTargetAllocation[]) => void;
  isSaving: boolean;
}

export function CategorySidePanel({
  isOpen,
  onOpenChange,
  targetId,
  deviation,
  onSave,
  isSaving,
}: CategorySidePanelProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const { allocations } = useTargetAllocations(targetId);

  // Local editing state: percent as display value (0-100) and lock toggle
  const [editPercent, setEditPercent] = useState<number>(0);
  const [editLocked, setEditLocked] = useState<boolean>(false);

  // Sync local state when category changes or allocations load
  useEffect(() => {
    if (!deviation) return;
    const existing = allocations.find((a) => a.categoryId === deviation.categoryId);
    if (existing) {
      // Convert from basis points to display percentage
      setEditPercent(existing.targetPercent / 100);
      setEditLocked(existing.isLocked);
    } else {
      setEditPercent(0);
      setEditLocked(false);
    }
  }, [deviation?.categoryId, allocations, deviation]);

  const handleSave = useCallback(() => {
    if (!deviation) return;
    const allocation: NewTargetAllocation = {
      targetId,
      categoryId: deviation.categoryId,
      // Convert display percentage to basis points
      targetPercent: Math.round(editPercent * 100),
      isLocked: editLocked,
    };
    onSave([allocation]);
  }, [deviation, targetId, editPercent, editLocked, onSave]);

  if (!deviation) return null;

  const currentPct = deviation.currentPercent;
  const maxPct = Math.max(editPercent, currentPct, 1);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col overflow-hidden sm:max-w-md"
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 1.5rem)",
        }}
      >
        <SheetHeader className="mt-4">
          <SheetTitle className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: deviation.color }}
            />
            {deviation.categoryName}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto py-4">
          {/* Target percentage input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Target %</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className="h-8 w-24 text-right"
                  value={editPercent || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setEditPercent(Math.max(0, Math.min(100, val)));
                  }}
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
            </div>

            {/* Lock toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Lock allocation</label>
              <Switch
                checked={editLocked}
                onCheckedChange={setEditLocked}
              />
            </div>
          </div>

          {/* Visual comparison */}
          <div className="space-y-3">
            <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Target vs Current
            </h4>

            {/* Target bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Target</span>
                <span>{editPercent.toFixed(1)}%</span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full opacity-60"
                  style={{
                    width: `${(editPercent / maxPct) * 100}%`,
                    backgroundColor: deviation.color,
                  }}
                />
              </div>
            </div>

            {/* Current bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Current</span>
                <span>{currentPct.toFixed(1)}%</span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(currentPct / maxPct) * 100}%`,
                    backgroundColor: deviation.color,
                  }}
                />
              </div>
            </div>

            {/* Deviation summary */}
            <div className="bg-muted/50 rounded-md p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Deviation</span>
                <span
                  className={cn(
                    "font-medium",
                    deviation.deviationPercent > 0 && "text-green-600 dark:text-green-400",
                    deviation.deviationPercent < 0 && "text-red-600 dark:text-red-400",
                  )}
                >
                  {deviation.deviationPercent > 0 ? "+" : ""}
                  {deviation.deviationPercent.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Value delta</span>
                <span
                  className={cn(
                    "font-medium",
                    deviation.valueDelta > 0 && "text-green-600 dark:text-green-400",
                    deviation.valueDelta < 0 && "text-red-600 dark:text-red-400",
                  )}
                >
                  {deviation.valueDelta >= 0 ? "+" : ""}
                  {formatAmount(deviation.valueDelta, baseCurrency)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current value</span>
                <span>{formatAmount(deviation.currentValue, baseCurrency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Target value</span>
                <span>{formatAmount(deviation.targetValue, baseCurrency)}</span>
              </div>
            </div>
          </div>

          {/* Placeholder for Section 2: per-holding targets */}
          <div className="space-y-2">
            <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Holdings
            </h4>
            <p className="text-muted-foreground text-xs">
              Per-holding targets coming in a future update.
            </p>
          </div>
        </div>

        <SheetFooter className="border-t pt-4">
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Icons.Check className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
