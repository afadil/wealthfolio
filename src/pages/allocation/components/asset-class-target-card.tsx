import { Button } from "@wealthfolio/ui";
import { ChevronDown, Lock, LockOpen } from "lucide-react";
import { useRef, useState } from "react";
import { AssetClassComposition } from "../hooks/use-current-allocation";
import { getDriftStatus } from "../hooks/use-drift-status";

interface AssetClassTargetCardProps {
  composition: AssetClassComposition;
  onEdit: () => void;
  onDelete: () => void;
  onQuickAdjust?: (percent: number) => void;
  isLoading?: boolean;
  totalAllocated?: number;
}

export function AssetClassTargetCard({
  composition,
  onEdit,
  onDelete,
  onQuickAdjust,
  isLoading = false,
  totalAllocated = 0,
}: AssetClassTargetCardProps) {
  const { assetClass, targetPercent, actualPercent } = composition;
  const [isTargetHovered, setIsTargetHovered] = useState(false);
  const [isTargetLocked, setIsTargetLocked] = useState(false);
  const [quickAdjustPercent, setQuickAdjustPercent] = useState(targetPercent);
  const [isEditingPercent, setIsEditingPercent] = useState(false);
  const [editValue, setEditValue] = useState(targetPercent.toFixed(1));
  const [isExpanded, setIsExpanded] = useState(true);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const driftStatus = getDriftStatus(actualPercent, targetPercent);
  const isOverAllocated = totalAllocated > 100;

  const handleQuickAdjust = (value: number) => {
    if (isTargetLocked) return;

    // Update UI immediately (smooth slider feedback)
    setQuickAdjustPercent(value);

    // Debounce API call (don't fire on every pixel drag)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onQuickAdjust?.(value);
    }, 300); // Wait 300ms after user stops dragging
  };

  const handleEditPercent = (value: string) => {
    const numValue = parseFloat(value) || 0;
    const clamped = Math.min(100, Math.max(0, numValue));
    setEditValue(clamped.toFixed(1));
    handleQuickAdjust(clamped);
    setIsEditingPercent(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card transition-all">
      {/* Header (Always Visible) - Clickable to Expand/Collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-1">
          {/* Chevron Icon */}
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform ${
              isExpanded ? "rotate-0" : "-rotate-90"
            }`}
          />

          {/* Class Name + Status Badge */}
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-foreground">{assetClass}</h3>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${driftStatus.statusBgColor}`}
            >
              <span className={driftStatus.statusColor}>{driftStatus.icon}</span>
              <span className={driftStatus.statusColor}>{driftStatus.label}</span>
            </div>
          </div>
        </div>

        {/* Always-Visible Percentages (Right Side) */}
        <div className={`flex items-center gap-6 text-sm transition-colors ${isOverAllocated ? 'text-orange-700 dark:text-orange-400' : 'text-foreground'}`}>
          <div>
            <span className="text-muted-foreground">Target: </span>
            {isEditingPercent ? (
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleEditPercent(editValue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditPercent(editValue);
                  if (e.key === "Escape") {
                    setEditValue(quickAdjustPercent.toFixed(1));
                    setIsEditingPercent(false);
                  }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()} // Prevent card collapse on input click
                disabled={isLoading || isTargetLocked}
                className="w-14 rounded-md border border-primary bg-background px-1 py-0.5 text-sm font-semibold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent card collapse on click
                  if (!isTargetLocked && !isLoading) {
                    setEditValue(quickAdjustPercent.toFixed(1));
                    setIsEditingPercent(true);
                  }
                }}
                disabled={isLoading || isTargetLocked}
                className="font-semibold tabular-nums rounded px-1 py-0.5 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Click to edit target %"
              >
                {quickAdjustPercent.toFixed(1)}%
              </button>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Actual: </span>
            <span className="font-semibold tabular-nums">{actualPercent.toFixed(1)}%</span>
          </div>
        </div>
      </button>

      {/* Expandable Content (Hidden when collapsed) */}
      {isExpanded && (
        <div className="space-y-4 p-4 border-t border-border">
          {/* Alert: Over-allocated warning */}
          {isOverAllocated && (
            <div className="rounded-md bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 p-2">
              <p className="text-xs font-semibold text-orange-800 dark:text-orange-300">
                ⚠ Over-allocated: {totalAllocated.toFixed(1)}% (max 100%)
              </p>
            </div>
          )}

          {/* Target Bar with Overlaid Slider */}
          <div
            className="space-y-2"
            onMouseEnter={() => setIsTargetHovered(true)}
            onMouseLeave={() => setIsTargetHovered(false)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground font-medium">Target</div>

              {/* Lock/Unlock Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTargetLocked(!isTargetLocked);
                }}
                disabled={isLoading}
                className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
                title={isTargetLocked ? "Unlock target" : "Lock target"}
              >
                {isTargetLocked ? (
                  <Lock className="h-4 w-4 text-orange-500" />
                ) : (
                  <LockOpen className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Target Progress Bar Container with Overlay Slider */}
            <div
              className="relative h-8 bg-muted rounded-lg overflow-visible group"
              onMouseEnter={() => setIsTargetHovered(true)}
              onMouseLeave={() => setIsTargetHovered(false)}
            >
              {/* Background bar (static) */}
              <div
                className="absolute h-8 bg-gray-400 dark:bg-gray-600 rounded-lg transition-all"
                style={{ width: `${targetPercent}%` }}
              />

              {/* Overlay Slider (appears on hover, only if unlocked) */}
              {isTargetHovered && !isTargetLocked && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={quickAdjustPercent}
                  onChange={(e) => handleQuickAdjust(parseFloat(e.target.value))}
                  disabled={isLoading}
                  className="absolute inset-0 w-full h-full cursor-pointer opacity-0 z-10 disabled:cursor-not-allowed"
                  style={{
                    WebkitAppearance: "none",
                    appearance: "none",
                    width: "100%",
                    height: "100%",
                    background: "transparent",
                    padding: "0",
                  }}
                  title="Drag to adjust target allocation"
                />
              )}

              {/* Label overlay (always visible) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs font-semibold text-foreground">
                  {quickAdjustPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Lock Status Indicator */}
            {isTargetLocked && (
              <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                🔒 Target locked — click unlock icon to adjust
              </div>
            )}
          </div>

          {/* Actual Bar with Drift Color */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium">Actual</div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${driftStatus.barColor}`}
                style={{ width: `${actualPercent}%` }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end pt-2 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              disabled={isLoading || isTargetLocked}
              className="text-xs"
              title="Edit allocation target in dialog"
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={isLoading}
              className="text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50"
              title="Delete allocation target"
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
