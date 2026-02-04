/**
 * Calculate drift status based on absolute difference between actual and target
 * Drift = ABS(Actual% - Target%)
 *
 * 8 color bands for fine-grained visual feedback:
 * Drift ≤ 2%   → Green-500 (on-target)      ✓
 * Drift ≤ 5%   → Green-400 (on-target)      ✓
 * Drift ≤ 10%  → Green-300 (minor)          ✓
 * Drift ≤ 15%  → Orange-200 (caution)       ⚠
 * Drift ≤ 20%  → Orange-300 (caution)       ⚠
 * Drift ≤ 25%  → Orange-400 (rebalance)     ⚠⚠
 * Drift ≤ 35%  → Orange-500 (rebalance)     ⚠⚠
 * Drift > 35%  → Orange-600 (critical)      ⚠⚠⚠
 */
export function getDriftStatus(actualPercent: number, targetPercent: number) {
  const drift = Math.abs(actualPercent - targetPercent);

  if (drift <= 2) {
    return {
      label: "On Target",
      icon: "✓",
      barColor: "bg-green-500 dark:bg-green-500",
      statusColor: "text-green-700 dark:text-green-300",
      statusBgColor: "bg-green-100 dark:bg-green-900/40",
    };
  }

  if (drift <= 5) {
    return {
      label: "On Target",
      icon: "✓",
      barColor: "bg-green-400 dark:bg-green-400",
      statusColor: "text-green-700 dark:text-green-300",
      statusBgColor: "bg-green-100/80 dark:bg-green-900/30",
    };
  }

  if (drift <= 10) {
    return {
      label: "Minor Drift",
      icon: "◐",
      barColor: "bg-green-300 dark:bg-green-300",
      statusColor: "text-green-700 dark:text-green-400",
      statusBgColor: "bg-green-100/60 dark:bg-green-900/20",
    };
  }

  if (drift <= 15) {
    return {
      label: "Caution",
      icon: "⚠",
      barColor: "bg-orange-200 dark:bg-orange-300",
      statusColor: "text-orange-800 dark:text-orange-300",
      statusBgColor: "bg-orange-100/60 dark:bg-orange-900/20",
    };
  }

  if (drift <= 20) {
    return {
      label: "Caution",
      icon: "⚠",
      barColor: "bg-orange-300 dark:bg-orange-400",
      statusColor: "text-orange-800 dark:text-orange-300",
      statusBgColor: "bg-orange-100/70 dark:bg-orange-900/25",
    };
  }

  if (drift <= 25) {
    return {
      label: "Rebalance",
      icon: "⚠⚠",
      barColor: "bg-orange-400 dark:bg-orange-500",
      statusColor: "text-orange-800 dark:text-orange-200",
      statusBgColor: "bg-orange-100/80 dark:bg-orange-900/30",
    };
  }

  if (drift <= 35) {
    return {
      label: "Rebalance",
      icon: "⚠⚠",
      barColor: "bg-orange-500 dark:bg-orange-600",
      statusColor: "text-orange-900 dark:text-orange-200",
      statusBgColor: "bg-orange-100 dark:bg-orange-900/40",
    };
  }

  // Drift > 35%
  return {
    label: "Critical",
    icon: "⚠⚠⚠",
    barColor: "bg-orange-600 dark:bg-orange-700",
    statusColor: "text-orange-900 dark:text-orange-100",
    statusBgColor: "bg-orange-200/80 dark:bg-orange-900/50",
  };
}
