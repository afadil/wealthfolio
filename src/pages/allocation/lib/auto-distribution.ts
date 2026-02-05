import type { Holding, HoldingTarget } from "@/lib/types";

export interface HoldingWithTarget {
  assetId: string;
  symbol: string;
  displayName: string;
  currentValue: number;
  currentPercent: number;
  targetPercent?: number;
  isLocked?: boolean;
  isUserSet: boolean; // Whether the user manually set this target
}

export interface AutoDistributionResult {
  holdings: HoldingWithTarget[];
  totalAllocated: number;
  hasAutoDistributed: boolean;
}

/**
 * Calculate auto-distribution for holdings in an asset class.
 *
 * Algorithm:
 * 1. Start with user-set targets (including locked)
 * 2. Calculate remaining % to allocate
 * 3. Distribute remainder proportionally by market value among:
 *    - Holdings without targets
 *    - Holdings with unlocked targets (override their current value)
 * 4. Locked targets are never modified
 *
 * @param holdings - All holdings in the asset class
 * @param holdingTargets - Existing holding targets
 * @param pendingEdits - Map of assetId -> pending target % (not yet saved)
 * @param assetClassValue - Total value of the asset class
 */
export function calculateAutoDistribution(
  holdings: Holding[],
  holdingTargets: HoldingTarget[],
  pendingEdits: Map<string, number>,
  assetClassValue: number,
): AutoDistributionResult {
  // Build map of holdings with their current state
  const holdingMap = new Map<string, HoldingWithTarget>();

  holdings.forEach((holding) => {
    const assetId = holding.instrument?.id;
    if (!assetId) return;

    const existingTarget = holdingTargets.find((t) => t.assetId === assetId);
    const pendingValue = pendingEdits.get(assetId);
    const currentPercent =
      assetClassValue > 0 ? ((holding.marketValue?.base || 0) / assetClassValue) * 100 : 0;

    const isLocked = existingTarget?.isLocked ?? false;

    // Determine if this is user-set:
    // - If NO pending edits exist at all → all saved targets are "user-set" (not previews)
    // - If pending edits DO exist → only pending OR locked are "user-set"
    const hasPendingEdits = pendingEdits.size > 0;
    const isUserSet = hasPendingEdits
      ? pendingValue !== undefined || isLocked // Active editing session
      : existingTarget !== undefined; // No editing - all saved are user-set

    holdingMap.set(assetId, {
      assetId,
      symbol: holding.instrument?.symbol || "",
      displayName: holding.instrument?.name || holding.instrument?.symbol || "Unknown",
      currentValue: holding.marketValue?.base || 0,
      currentPercent,
      targetPercent: pendingValue ?? existingTarget?.targetPercentOfClass,
      isLocked,
      isUserSet,
    });
  });

  // Calculate total allocated by user-set targets
  let totalUserSet = 0;
  const userSetHoldings: HoldingWithTarget[] = [];
  const autoDistributeHoldings: HoldingWithTarget[] = [];

  holdingMap.forEach((h) => {
    if (h.isUserSet && h.targetPercent !== undefined) {
      totalUserSet += h.targetPercent;
      userSetHoldings.push(h);
    } else {
      autoDistributeHoldings.push(h);
    }
  });

  // Calculate remainder to distribute
  const remainder = 100 - totalUserSet;

  // If remainder > 0 and we have holdings to distribute to
  if (remainder > 0.001 && autoDistributeHoldings.length > 0) {
    // Calculate total value of holdings eligible for auto-distribution
    const totalAutoValue = autoDistributeHoldings.reduce((sum, h) => sum + h.currentValue, 0);

    if (totalAutoValue > 0) {
      // Distribute proportionally by market value
      autoDistributeHoldings.forEach((h) => {
        const ratio = h.currentValue / totalAutoValue;
        h.targetPercent = remainder * ratio;
        h.isUserSet = false; // Mark as auto-calculated
      });
    } else {
      // No value to distribute by - distribute equally
      const equalShare = remainder / autoDistributeHoldings.length;
      autoDistributeHoldings.forEach((h) => {
        h.targetPercent = equalShare;
        h.isUserSet = false;
      });
    }
  } else if (remainder < -0.001) {
    // Over-allocated - don't auto-distribute, show the error state
    autoDistributeHoldings.forEach((h) => {
      h.targetPercent = 0;
      h.isUserSet = false;
    });
  } else {
    // Exactly 100% or no remainder - set rest to 0
    autoDistributeHoldings.forEach((h) => {
      h.targetPercent = 0;
      h.isUserSet = false;
    });
  }

  const allHoldings = [...userSetHoldings, ...autoDistributeHoldings].sort(
    (a, b) => b.currentValue - a.currentValue,
  );

  const totalAllocated = allHoldings.reduce((sum, h) => sum + (h.targetPercent || 0), 0);
  const hasAutoDistributed = autoDistributeHoldings.some((h) => (h.targetPercent || 0) > 0);

  return {
    holdings: allHoldings,
    totalAllocated,
    hasAutoDistributed,
  };
}
