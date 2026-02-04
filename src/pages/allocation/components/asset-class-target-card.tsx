import type { AssetClassTarget } from "@/lib/types";
import { Button, Card, TargetPercentSlider } from "@wealthfolio/ui";
import { useState } from "react";
import { useProportionalAllocation } from "../hooks";
import type { AssetClassComposition } from "../hooks/use-current-allocation";

interface AssetClassTargetCardProps {
  composition: AssetClassComposition;
  targetPercent: number;
  allTargets?: AssetClassTarget[];
  onEdit: () => void;
  onDelete: () => void;
  onTargetChange: (newPercent: number) => Promise<void>;
  onProportionalChange?: (targets: AssetClassTarget[]) => Promise<void>;
  isLoading?: boolean;
  accountId?: string;
}

export function AssetClassTargetCard({
  composition,
  targetPercent,
  allTargets = [],
  onEdit,
  onDelete,
  onTargetChange,
  onProportionalChange,
  isLoading = false,
  accountId = '',
}: AssetClassTargetCardProps) {
  const { assetClass, actualPercent } = composition;
  const [localTarget, setLocalTarget] = useState(targetPercent);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [editValue, setEditValue] = useState(localTarget.toFixed(1));
  const [isLocked, setIsLocked] = useState(false);
  const { calculateProportionalTargets } = useProportionalAllocation();

  const handleSliderChange = async (newValue: number) => {
    setLocalTarget(newValue);
    setEditValue(newValue.toFixed(1));

    // If proportional adjustment enabled and we have all targets
    if (onProportionalChange && allTargets.length > 0) {
      const proportionalTargets = calculateProportionalTargets(
        allTargets,
        assetClass,
        newValue
      );

      setIsSaving(true);
      try {
        await onProportionalChange(proportionalTargets);
      } catch (err) {
        console.error("Failed to update targets proportionally:", err);
        setLocalTarget(targetPercent);
        setEditValue(targetPercent.toFixed(1));
      } finally {
        setIsSaving(false);
      }
    } else {
      // Fallback: simple update without proportional adjustment
      setIsSaving(true);
      try {
        await onTargetChange(newValue);
      } catch (err) {
        console.error("Failed to update target:", err);
        setLocalTarget(targetPercent);
        setEditValue(targetPercent.toFixed(1));
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleTargetInputChange = (value: string) => {
    // Allow only numbers and one decimal point
    const sanitized = value.replace(/[^0-9.]/g, '');
    // Prevent leading zeros (e.g., "020" → "20")
    const cleaned = sanitized.replace(/^0+(?=\d)/, '');
    setEditValue(cleaned || '0');
  };

  const handleTargetInputBlur = async () => {
    const numValue = parseFloat(editValue) || 0;
    const clamped = Math.max(0, Math.min(100, numValue)); // Clamp 0-100
    setLocalTarget(clamped);
    setEditValue(clamped.toFixed(1));
    setIsEditingTarget(false);
    setIsSaving(true);
    try {
      await onTargetChange(clamped);
    } catch (err) {
      console.error("Failed to update target:", err);
      setLocalTarget(targetPercent);
      setEditValue(targetPercent.toFixed(1));
    } finally {
      setIsSaving(false);
    }
  };

  const drift = actualPercent - localTarget;
  const driftColor = Math.abs(drift) < 2 ? "text-green-600 dark:text-green-400" : drift > 0 ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400";

  return (
    <Card className="p-6 space-y-4 hover:shadow-md transition-shadow">
      {/* Header: Name + Actions */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-base">{assetClass}</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={isLoading || isSaving}
            className="h-7 w-7 p-0"
          >
            ✎
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isLoading || isSaving}
            className="h-7 w-7 p-0"
          >
            ✕
          </Button>
        </div>
      </div>

      {/* Target vs Actual - EDITABLE TARGET */}
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Target</p>
          {isEditingTarget ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => handleTargetInputChange(e.target.value)}
              onBlur={handleTargetInputBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTargetInputBlur();
                if (e.key === 'Escape') {
                  setIsEditingTarget(false);
                  setEditValue(localTarget.toFixed(1));
                }
              }}
              autoFocus
              className="w-16 px-2 py-1 border border-primary rounded bg-background text-foreground font-semibold"
              placeholder="0"
            />
          ) : (
            <p
              onClick={() => setIsEditingTarget(true)}
              className="font-semibold cursor-pointer hover:text-primary transition-colors"
            >
              {localTarget.toFixed(1)}%
            </p>
          )}
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Actual</p>
          <p className="font-semibold">{actualPercent.toFixed(1)}%</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Drift</p>
          <p className={`font-semibold ${driftColor}`}>
            {drift > 0 ? '+' : ''}{drift.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Two Bars: Target + Actual (Sector Allocation Style) */}
      <div className="space-y-3">
        {/* Target Bar - Overlay Slider */}
        <div className="flex items-center gap-2">
          <TargetPercentSlider
            value={localTarget}
            onChange={(val) => setLocalTarget(val)}
            onChangeEnd={(val) => handleSliderChange(val)}
            label="Target"
            disabled={isLoading || isSaving}
            showValue={false}
            isLocked={isLocked}
            onToggleLock={() => setIsLocked(!isLocked)}
            overlay={true}
            barColor="bg-chart-2"
          />
        </div>

        {/* Actual Bar */}
        <div className="flex items-center gap-2">
          <div className="bg-secondary relative h-6 flex-1 overflow-hidden rounded flex items-center justify-between">
            <div
              className="bg-green-600 dark:bg-green-500 absolute top-0 left-0 h-full rounded transition-all"
              style={{ width: `${Math.min(actualPercent, 100)}%` }}
            />
            {/* Label on left (inside colored portion) */}
            <div className="text-background absolute top-0 left-0 flex h-full items-center px-2 text-xs font-medium z-10">
              <span className="whitespace-nowrap">Actual</span>
            </div>
            {/* Percentage on right (inside bar, at end of colored portion) */}
            <div className="text-foreground absolute top-0 right-0 flex h-full items-center px-2 text-xs font-medium z-10">
              <span className="whitespace-nowrap">{actualPercent.toFixed(1)}%</span>
            </div>
          </div>
          {/* Placeholder for lock icon to align bars */}
          <div className="h-6 w-6 flex-shrink-0" />
        </div>
      </div>
    </Card>
  );
}
