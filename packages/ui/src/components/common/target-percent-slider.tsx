import { useState } from "react";
import { Icons } from "../ui/icons";

interface TargetPercentSliderProps {
  /**
   * Current target percentage value (0-100)
   */
  value: number;

  /**
   * Callback fired while dragging (for real-time updates)
   */
  onChange: (newValue: number) => void;

  /**
   * Callback fired on drag end (for mutations/persistence)
   */
  onChangeEnd: (newValue: number) => void;

  /**
   * Display label (e.g., "Target" or "Equities")
   */
  label?: string;

  /**
   * Whether slider is disabled (e.g., during mutation)
   */
  disabled?: boolean;

  /**
   * Show percentage value on top of slider
   */
  showValue?: boolean;

  /**
   * Lock icon toggle (Phase 2 feature structure)
   */
  isLocked?: boolean;
  onToggleLock?: () => void;

  /**
   * Remaining allocation to suggest to user
   */
  remainingAllocation?: number;

  /**
   * Overlay mode: renders slider on top of a bar (invisible but interactive)
   * When true, only renders the interactive slider layer and lock button
   * Parent handles the visual bar rendering
   */
  overlay?: boolean;

  /**
   * Bar color for overlay mode (CSS class)
   */
  barColor?: string;
}

/**
 * TargetPercentSlider
 *
 * Reusable component for adjusting target allocation percentages with:
 * - Native range input (0-100, step 0.1)
 * - Real-time visual feedback
 * - Lock toggle structure (Phase 2)
 * - Percentage display option
 * - Remaining allocation hint
 * - Overlay mode: invisible slider on top of visual bar
 *
 * Parent is responsible for proportional adjustment logic via onChange callback.
 */
export const TargetPercentSlider: React.FC<TargetPercentSliderProps> = ({
  value,
  onChange,
  onChangeEnd,
  label = "Target",
  disabled = false,
  showValue = true,
  isLocked = false,
  onToggleLock,
  remainingAllocation,
  overlay = false,
  barColor = "bg-chart-2",
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => {
    setIsDragging(false);
    onChangeEnd(value);
  };

  // Overlay mode: render slider on top of a bar
  if (overlay) {
    return (
      <>
        <div className="relative flex-1 group">
          {/* Visual Bar Layer */}
          <div className="bg-secondary relative h-6 overflow-hidden rounded flex items-center justify-between">
            <div
              className={`${barColor} absolute top-0 left-0 h-full rounded transition-all`}
              style={{ width: `${Math.min(value, 100)}%` }}
            />
            {/* Label on left (inside colored portion) */}
            <div className="text-background absolute top-0 left-0 flex h-full items-center px-2 text-xs font-medium z-10">
              <span className="whitespace-nowrap">{label}</span>
            </div>
            {/* Percentage on right (inside bar, at end of colored portion) */}
            <div className="text-foreground absolute top-0 right-0 flex h-full items-center px-2 text-xs font-medium z-10">
              <span className="whitespace-nowrap">{value.toFixed(1)}%</span>
            </div>
          </div>

          {/* Invisible Slider Overlay */}
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchEnd={handleMouseUp}
            disabled={disabled}
            className="absolute top-0 left-0 w-full h-6 opacity-0 cursor-pointer disabled:cursor-not-allowed z-10 rounded"
          />
        </div>

        {/* Lock Icon - Right Side Outside Bar */}
        {onToggleLock && (
          <button
            type="button"
            onClick={onToggleLock}
            className={`h-6 w-6 flex items-center justify-center flex-shrink-0 rounded transition-all disabled:opacity-30 ${
              isLocked
                ? "bg-secondary text-gray-700"
                : "opacity-70 text-muted-foreground hover:text-foreground hover:opacity-100 hover:bg-muted"
            }`}
            title={isLocked ? "Unlock target" : "Lock target"}
          >
            {isLocked ? (
              <Icons.Lock className="h-4 w-4" />
            ) : (
              <Icons.LockOpen className="h-4 w-4" />
            )}
          </button>
        )}
      </>
    );
  }

  // Standard mode: full slider with label and controls
  return (
    <div className="space-y-2">
      {/* Header: Label + Lock + Value */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {onToggleLock && (
            <button
              type="button"
              onClick={onToggleLock}
              className={`h-4 w-4 flex items-center justify-center rounded px-1 transition-colors ${
                isLocked ? "bg-secondary text-gray-700" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={isLocked ? "Unlock target" : "Lock target"}
            >
              {isLocked ? (
                <Icons.Lock className="h-3 w-3" />
              ) : (
                <Icons.LockOpen className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
        {showValue && (
          <span className="text-sm font-semibold">
            {value.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Slider Track */}
      <input
        type="range"
        min="0"
        max="100"
        step="0.1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        disabled={disabled || isLocked}
        className="w-full h-3 bg-muted rounded appearance-none cursor-pointer slider-thumb opacity-75 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
      />

      {/* Footer: Min/Max + Hint */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>0%</span>
        {remainingAllocation !== undefined && (
          <span className="text-center flex-1">
            {remainingAllocation > 0 ? (
              <span className="text-green-600 dark:text-green-400">
                {remainingAllocation.toFixed(1)}% remaining
              </span>
            ) : remainingAllocation < 0 ? (
              <span className="text-red-600 dark:text-red-400">
                {Math.abs(remainingAllocation).toFixed(1)}% over
              </span>
            ) : (
              <span>Fully allocated</span>
            )}
          </span>
        )}
        <span>100%</span>
      </div>

      {/* Dragging Indicator */}
      {isDragging && (
        <p className="text-xs text-muted-foreground italic">Adjusting...</p>
      )}
    </div>
  );
};

export default TargetPercentSlider;
