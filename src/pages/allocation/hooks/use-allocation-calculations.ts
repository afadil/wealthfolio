import type { AssetClassTarget } from "@/lib/types";

export interface AssetClassComposition {
  assetClass: string;
  targetPercent: number;
  actualPercent: number;
  actualValue: number;
  drift: number;
  status: "on-target" | "underweight" | "overweight";
}

/**
 * Calculate Tier 1: Strategic allocation (targets vs actuals)
 * Per AGENTS.md: keep business rules in hooks, not UI layers.
 */
export function calculateAssetClassComposition(
  targets: AssetClassTarget[],
  holdings: any[],
  totalValue: number
): AssetClassComposition[] {
  if (totalValue === 0) return [];

  const holdingsByClass = new Map<string, any[]>();
  holdings.forEach((h) => {
    const cls = h.instrument?.assetClass || "Unclassified";
    if (!holdingsByClass.has(cls)) {
      holdingsByClass.set(cls, []);
    }
    holdingsByClass.get(cls)!.push(h);
  });

  return targets.map((target) => {
    const classHoldings = holdingsByClass.get(target.assetClass) || [];
    const actualValue = classHoldings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    const actualPercent = (actualValue / totalValue) * 100;
    const drift = actualPercent - target.targetPercent;

    let status: "on-target" | "underweight" | "overweight" = "on-target";
    if (Math.abs(drift) > 5) {
      status = drift > 0 ? "overweight" : "underweight";
    }

    return {
      assetClass: target.assetClass,
      targetPercent: target.targetPercent,
      actualPercent: Math.round(actualPercent * 10) / 10,
      actualValue,
      drift: Math.round(drift * 10) / 10,
      status,
    };
  });
}
