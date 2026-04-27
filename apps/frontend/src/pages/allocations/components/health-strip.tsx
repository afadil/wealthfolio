import { useMemo } from "react";
import { cn } from "@wealthfolio/ui/lib/utils";
import { formatAmount } from "@wealthfolio/ui";
import type { AllocationDeviation } from "@/lib/types";

interface HealthStripProps {
  deviations: AllocationDeviation[];
  currency: string;
  totalValue: number;
  rebalanceMode?: "buy_only" | "buy_and_sell";
}

const BAND_THRESHOLD = 5;

export function HealthStrip({ deviations, currency, totalValue, rebalanceMode }: HealthStripProps) {
  const { inBand, withTargets, buyPriority, takeProfits, toDeployAmount } = useMemo(() => {
    const withTargets = deviations.filter((d) => d.targetPercent > 0);
    const inBand = withTargets.filter((d) => Math.abs(d.deviationPercent) < BAND_THRESHOLD);

    // Most underweight (buy first)
    const buyPriority = withTargets.reduce<AllocationDeviation | null>((worst, d) => {
      if (d.deviationPercent >= 0) return worst;
      if (!worst || d.deviationPercent < worst.deviationPercent) return d;
      return worst;
    }, null);

    // Most overweight
    const takeProfits = withTargets.reduce<AllocationDeviation | null>((best, d) => {
      if (d.deviationPercent <= 0) return best;
      if (!best || d.deviationPercent > best.deviationPercent) return d;
      return best;
    }, null);

    const toDeployAmount = withTargets.reduce((sum, d) => {
      return d.valueDelta < 0 ? sum + Math.abs(d.valueDelta) : sum;
    }, 0);

    return { inBand, withTargets, buyPriority, takeProfits, toDeployAmount };
  }, [deviations]);

  const hasTargets = withTargets.length > 0;
  const total = deviations.length; // all items, with or without targets

  const healthColor = !hasTargets
    ? "text-muted-foreground"
    : inBand.length === withTargets.length && withTargets.length === total
      ? "text-green-600 dark:text-green-400"
      : inBand.length >= total / 2
        ? "text-yellow-600 dark:text-yellow-500"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="mb-4 grid grid-cols-[1fr_1fr_2fr_1fr] divide-x rounded-lg border">
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
              <span className="text-muted-foreground text-sm">/ {total}</span>
            </div>
            <div className="mt-2 flex gap-1">
              {deviations.map((d) => {
                const hasTarget = d.targetPercent > 0;
                const ok = hasTarget && Math.abs(d.deviationPercent) < BAND_THRESHOLD;
                return (
                  <div
                    key={d.categoryId}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      ok ? "" : hasTarget ? "bg-muted" : "border-muted border bg-transparent",
                    )}
                    style={ok ? { backgroundColor: d.color } : undefined}
                    title={
                      hasTarget
                        ? `${d.categoryName}: ${d.deviationPercent > 0 ? "+" : ""}${d.deviationPercent.toFixed(1)}%`
                        : `${d.categoryName}: no target`
                    }
                  />
                );
              })}
            </div>
            {deviations.some((d) => d.targetPercent === 0) && (
              <p className="text-muted-foreground mt-1 text-xs">
                +{deviations.filter((d) => d.targetPercent === 0).length} without target
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-2xl font-bold">N/A</p>
            <p className="text-muted-foreground mt-1 text-xs">set targets to track</p>
          </>
        )}
      </div>

      {/* Slot 3 — Drift (bi-directional) */}
      <div className="px-4 py-3">
        <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
          Drift
        </p>
        {hasTargets && (buyPriority || takeProfits) ? (
          <div className="flex gap-3">
            {/* Buy first — most underweight */}
            <div className="min-w-0 flex-1">
              {buyPriority ? (
                <>
                  <p
                    className={cn(
                      "text-xl font-bold tabular-nums",
                      Math.abs(buyPriority.deviationPercent) < BAND_THRESHOLD
                        ? "text-green-600 dark:text-green-400"
                        : Math.abs(buyPriority.deviationPercent) < 10
                          ? "text-yellow-600 dark:text-yellow-500"
                          : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {buyPriority.deviationPercent.toFixed(1)}%
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: buyPriority.color }}
                    />
                    <span className="text-muted-foreground truncate text-xs">
                      {buyPriority.categoryName}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">✓</p>
                  <p className="text-muted-foreground text-xs">on target</p>
                </>
              )}
            </div>

            {/* Take profits — most overweight above threshold */}
            {takeProfits && (
              <>
                <div className="bg-border w-px shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
                    +{takeProfits.deviationPercent.toFixed(1)}%
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: takeProfits.color }}
                    />
                    <span className="text-muted-foreground truncate text-xs">
                      {takeProfits.categoryName}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : hasTargets ? (
          <>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">✓</p>
            <p className="text-muted-foreground mt-1 text-xs">all on target</p>
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
            <p className="text-muted-foreground mt-1 text-xs">
              {rebalanceMode === "buy_and_sell"
                ? "new cash needed after sells"
                : "to reach underweight targets"}
            </p>
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
