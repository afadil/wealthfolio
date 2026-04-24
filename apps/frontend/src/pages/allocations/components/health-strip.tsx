import { useMemo } from "react";
import { cn } from "@wealthfolio/ui/lib/utils";
import { formatAmount } from "@wealthfolio/ui";
import type { AllocationDeviation } from "@/lib/types";

interface HealthStripProps {
  deviations: AllocationDeviation[];
  currency: string;
  totalValue: number;
}

const BAND_THRESHOLD = 5;

export function HealthStrip({ deviations, currency, totalValue }: HealthStripProps) {
  const { inBand, withTargets, priority, toDeployAmount } = useMemo(() => {
    const withTargets = deviations.filter((d) => d.targetPercent > 0);
    const inBand = withTargets.filter((d) => Math.abs(d.deviationPercent) < BAND_THRESHOLD);

    const priority = withTargets.reduce<AllocationDeviation | null>((worst, d) => {
      if (!worst) return d;
      return Math.abs(d.deviationPercent) > Math.abs(worst.deviationPercent) ? d : worst;
    }, null);

    const toDeployAmount = withTargets.reduce((sum, d) => {
      return d.valueDelta < 0 ? sum + Math.abs(d.valueDelta) : sum;
    }, 0);

    return { inBand, withTargets, priority, toDeployAmount };
  }, [deviations]);

  const hasTargets = withTargets.length > 0;

  const healthColor = !hasTargets
    ? "text-muted-foreground"
    : inBand.length === withTargets.length
      ? "text-green-600 dark:text-green-400"
      : inBand.length >= withTargets.length / 2
        ? "text-yellow-600 dark:text-yellow-500"
        : "text-red-600 dark:text-red-400";

  const priorityDrift = priority ? priority.deviationPercent : 0;
  const priorityColor =
    Math.abs(priorityDrift) < BAND_THRESHOLD
      ? "text-green-600 dark:text-green-400"
      : Math.abs(priorityDrift) < 10
        ? "text-yellow-600 dark:text-yellow-500"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="mb-4 grid grid-cols-4 divide-x rounded-lg border">
      {/* Slot 1 — Portfolio Value (always available) */}
      <div className="px-4 py-3">
        <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
          Portfolio Value
        </p>
        <p className="text-2xl font-bold tabular-nums">{formatAmount(totalValue, currency)}</p>
        <p className="text-muted-foreground mt-1 text-xs">total</p>
      </div>

      {/* Slot 2 — Classes on target */}
      <div className="px-4 py-3">
        <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
          On Target
        </p>
        {hasTargets ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-2xl font-bold tabular-nums", healthColor)}>
                {inBand.length}
              </span>
              <span className="text-muted-foreground text-sm">/ {withTargets.length}</span>
            </div>
            <div className="mt-2 flex gap-1">
              {withTargets.map((d) => {
                const ok = Math.abs(d.deviationPercent) < BAND_THRESHOLD;
                return (
                  <div
                    key={d.categoryId}
                    className="h-1.5 flex-1 rounded-full"
                    style={{ backgroundColor: ok ? d.color : `${d.color}40` }}
                    title={`${d.categoryName}: ${d.deviationPercent > 0 ? "+" : ""}${d.deviationPercent.toFixed(1)}%`}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-2xl font-bold">N/A</p>
            <p className="text-muted-foreground mt-1 text-xs">set targets to track</p>
          </>
        )}
      </div>

      {/* Slot 3 — Priority */}
      <div className="px-4 py-3">
        <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
          Priority
        </p>
        {hasTargets && priority ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-2xl font-bold tabular-nums", priorityColor)}>
                {priorityDrift > 0 ? "+" : ""}
                {priorityDrift.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: priority.color }} />
              <span className="text-muted-foreground text-xs">{priority.categoryName}</span>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-2xl font-bold">N/A</p>
            <p className="text-muted-foreground mt-1 text-xs">set targets to track</p>
          </>
        )}
      </div>

      {/* Slot 4 — To Deploy */}
      <div className="px-4 py-3">
        <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
          To Deploy
        </p>
        {hasTargets ? (
          <>
            <p className="text-2xl font-bold tabular-nums">
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency,
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(toDeployAmount)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">to reach underweight targets</p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-2xl font-bold">N/A</p>
            <p className="text-muted-foreground mt-1 text-xs">set targets to track</p>
          </>
        )}
      </div>
    </div>
  );
}
