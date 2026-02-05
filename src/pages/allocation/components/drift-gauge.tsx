import { cn } from "@/lib/utils";

interface DriftGaugeProps {
  assetClass: string;
  targetPercent: number;
  actualPercent: number;
}

export function DriftGauge({ assetClass, targetPercent, actualPercent }: DriftGaugeProps) {
  const drift = actualPercent - targetPercent;
  const driftPercent = ((drift / targetPercent) * 100).toFixed(1);

  // Determine status: on-target (±2%), warning (±5%), rebalance (>5%)
  const absoluteDrift = Math.abs(drift);
  let status: "on-target" | "warning" | "rebalance";
  let statusColor: string;
  let barColor: string;

  if (absoluteDrift <= 2) {
    status = "on-target";
    statusColor = "text-success";
    barColor = "bg-green-500 dark:bg-green-600";
  } else if (absoluteDrift <= 5) {
    status = "warning";
    statusColor = "text-yellow-600 dark:text-yellow-400";
    barColor = "bg-yellow-500 dark:bg-yellow-600";
  } else {
    status = "rebalance";
    statusColor = "text-red-600 dark:text-red-400";
    barColor = "bg-red-500 dark:bg-red-600";
  }

  // Clamp for visual representation (0–100%)
  const targetWidth = Math.min(Math.max(targetPercent, 0), 100);
  const actualWidth = Math.min(Math.max(actualPercent, 0), 100);

  // Status label
  const statusLabel = (() => {
    if (status === "on-target") return "✓ On Target";
    if (drift > 0) return "⚠ Overweight";
    return "⚠ Underweight";
  })();

  return (
    <div className="space-y-2">
      {/* Header with percentages */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{assetClass}</span>
        <div className="text-muted-foreground flex gap-4 text-xs">
          <span>Target: {targetPercent.toFixed(1)}%</span>
          <span>Actual: {actualPercent.toFixed(1)}%</span>
        </div>
      </div>

      {/* Dual bar visualization */}
      <div className="space-y-1">
        {/* Target bar (lighter) */}
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div
            className="bg-muted-foreground/30 h-full rounded-full transition-all"
            style={{ width: `${targetWidth}%` }}
          />
        </div>

        {/* Actual bar (colored by status) */}
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${actualWidth}%` }}
          />
        </div>
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between text-xs">
        <span className={cn("font-semibold", statusColor)}>{statusLabel}</span>
        <span className="text-muted-foreground">
          {drift > 0 ? "+" : ""}
          {drift.toFixed(1)}% ({driftPercent}%)
        </span>
      </div>
    </div>
  );
}
