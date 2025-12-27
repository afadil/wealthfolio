import type React from "react";
import { PrivacyAmount } from "../financial/privacy-amount";
import { cn } from "../../lib/utils";

interface BudgetProgressRingProps {
  value: number;
  max: number;
  currency: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  varianceTolerance?: number;
}

/**
 * Get the progress color based on budget usage and variance tolerance.
 *
 * Color scheme:
 * - Green (success): Under budget - below (100% - variance)
 * - Blue (primary): On track - within variance of 100%
 * - Yellow (warning): Over tolerance - between variance and 120%
 * - Red (destructive): Danger - 120%+
 */
const getProgressColor = (percentUsed: number, varianceTolerance: number = 10): string => {
  const underBudgetThreshold = 100 - varianceTolerance;
  const onTrackUpperBound = 100 + varianceTolerance;

  if (percentUsed >= 120) return "var(--destructive)";      // Red: 120%+
  if (percentUsed > onTrackUpperBound) return "var(--warning)"; // Yellow: over tolerance to 120%
  if (percentUsed >= underBudgetThreshold) return "var(--primary)"; // Blue: on track
  return "var(--success)";                                   // Green: under budget
};

export const BudgetProgressRing: React.FC<BudgetProgressRingProps> = ({
  value,
  max,
  currency,
  size = 100,
  strokeWidth = 8,
  className,
  varianceTolerance = 10,
}) => {
  const percentUsed = max > 0 ? (value / max) * 100 : 0;
  const displayPercent = Math.min(percentUsed, 100);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (displayPercent / 100) * circumference;
  const progressColor = getProgressColor(percentUsed, varianceTolerance);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300"
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-bold leading-tight" style={{ fontSize: size * 0.14 }}>
          <PrivacyAmount value={value} currency={currency} />
        </span>
        <span className="text-muted-foreground leading-tight" style={{ fontSize: size * 0.1 }}>
          / <PrivacyAmount value={max} currency={currency} />
        </span>
      </div>
    </div>
  );
};

interface BudgetGaugeCardProps {
  categoryName: string;
  categoryColor?: string;
  actual: number;
  budgeted: number;
  percentUsed: number;
  currency: string;
  subcategories?: { name: string; amount: number }[];
  onClick?: () => void;
  varianceTolerance?: number;
}

/**
 * Get status color class based on budget usage and variance tolerance.
 * Matches the color logic in getProgressColor.
 */
const getStatusColorClass = (percentUsed: number, varianceTolerance: number): string => {
  const underBudgetThreshold = 100 - varianceTolerance;
  const onTrackUpperBound = 100 + varianceTolerance;

  if (percentUsed >= 120) return "text-destructive";     // Red: danger
  if (percentUsed > onTrackUpperBound) return "text-warning"; // Yellow: over tolerance
  if (percentUsed >= underBudgetThreshold) return "text-primary"; // Blue: on track
  return "text-success";                                  // Green: under budget
};

/**
 * Get status text based on budget usage and variance tolerance.
 */
const getStatusText = (percentUsed: number, varianceTolerance: number): string => {
  const underBudgetThreshold = 100 - varianceTolerance;
  const onTrackUpperBound = 100 + varianceTolerance;

  if (percentUsed >= 120) {
    return `${Math.round(percentUsed - 100)}% over budget`;
  }
  if (percentUsed > onTrackUpperBound) {
    return `${Math.round(percentUsed - 100)}% over budget`;
  }
  if (percentUsed >= underBudgetThreshold) {
    return "On track";
  }
  return `${Math.round(percentUsed)}% used`;
};

export const BudgetGaugeCard: React.FC<BudgetGaugeCardProps> = ({
  categoryName,
  categoryColor,
  actual,
  budgeted,
  percentUsed,
  currency,
  subcategories = [],
  onClick,
  varianceTolerance = 10,
}) => {
  const statusColor = getStatusColorClass(percentUsed, varianceTolerance);
  const statusText = getStatusText(percentUsed, varianceTolerance);

  return (
    <div
      className={cn(
        "bg-card hover:bg-muted/50 rounded-lg border p-4 transition-colors",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      <div className="mb-3 flex items-center gap-2">
        <div
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: categoryColor || "#888" }}
        />
        <span className="truncate font-medium">{categoryName}</span>
      </div>

      <div className="flex items-center justify-center py-3">
        <BudgetProgressRing
          value={actual}
          max={budgeted}
          currency={currency}
          size={140}
          strokeWidth={12}
          varianceTolerance={varianceTolerance}
        />
      </div>

      <div className={cn("text-center text-xs font-medium", statusColor)}>
        {statusText}
      </div>

      {subcategories.length > 0 && (
        <div className="mt-3 space-y-1 border-t pt-2">
          {subcategories.slice(0, 3).map((sub, idx) => (
            <div
              key={idx}
              className="text-muted-foreground flex items-center justify-between text-xs"
            >
              <span className="truncate pr-2">{sub.name}</span>
              <span className="shrink-0">
                <PrivacyAmount value={sub.amount} currency={currency} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Also export the old BudgetGauge name for backwards compatibility if needed
export const BudgetGauge = BudgetProgressRing;
