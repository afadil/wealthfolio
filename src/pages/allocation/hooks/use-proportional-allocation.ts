import type { AssetClassTarget } from "@/lib/types";

/**
 * useProportionalAllocation
 *
 * Hook for calculating proportionally adjusted targets when one target changes.
 *
 * Example:
 *   User has: Equities 60%, Fixed Income 30%, Cash 10% (total: 100%)
 *   User changes Equities slider to 70% (wants +10%)
 *   Hook calculates: maintain 3:1 ratio for FI and Cash
 *   Result: Equities 70%, Fixed Income 25%, Cash 5% (total: 100%)
 *
 * Logic:
 *   1. Calculate total of unchanged targets
 *   2. Calculate how much space is available for adjustment
 *   3. Scale other targets proportionally to fill/shrink space
 *   4. Clamp results to [0, 100]
 */
export function useProportionalAllocation() {
  /**
   * Calculate adjusted targets when one target changes
   *
   * @param targets - All current targets
   * @param changedAssetClass - The asset class being changed
   * @param newPercent - The new percentage for that asset class
   * @returns Updated targets array with proportional adjustments
   */
  const calculateProportionalTargets = (
    targets: AssetClassTarget[],
    changedAssetClass: string,
    newPercent: number
  ): AssetClassTarget[] => {
    // Clamp to [0, 100]
    const clampedNewPercent = Math.max(0, Math.min(100, newPercent));

    // Find the changed target
    const changedTarget = targets.find((t) => t.assetClass === changedAssetClass);
    if (!changedTarget) return targets;

    // Get unchanged targets
    const unchangedTargets = targets.filter((t) => t.assetClass !== changedAssetClass);
    const unchangedTotal = unchangedTargets.reduce((sum, t) => sum + t.targetPercent, 0);

    // Space available for unchanged targets after change
    const spaceAvailable = 100 - clampedNewPercent;

    // If unchanged targets don't fit, scale them proportionally
    if (unchangedTotal > spaceAvailable && unchangedTotal > 0) {
      const scaleFactor = spaceAvailable / unchangedTotal;

      return [
        {
          ...changedTarget,
          targetPercent: clampedNewPercent,
        },
        ...unchangedTargets.map((t) => ({
          ...t,
          targetPercent: Math.max(0, t.targetPercent * scaleFactor),
        })),
      ];
    }

    // If unchanged targets fit, no adjustment needed
    return [
      {
        ...changedTarget,
        targetPercent: clampedNewPercent,
      },
      ...unchangedTargets,
    ];
  };

  /**
   * Calculate remaining allocation (space left to allocate)
   *
   * @param targets - All current targets
   * @returns Remaining percentage (positive = room to allocate, negative = over-allocated)
   */
  const calculateRemaining = (targets: AssetClassTarget[]): number => {
    const total = targets.reduce((sum, t) => sum + t.targetPercent, 0);
    return 100 - total;
  };

  /**
   * Validate if targets sum to ≤ 100%
   *
   * @param targets - All current targets
   * @returns true if valid (sum ≤ 100%), false otherwise
   */
  const isValidAllocation = (targets: AssetClassTarget[]): boolean => {
    const total = targets.reduce((sum, t) => sum + t.targetPercent, 0);
    return total <= 100;
  };

  return {
    calculateProportionalTargets,
    calculateRemaining,
    isValidAllocation,
  };
}

export type UseProportionalAllocationReturn = ReturnType<
  typeof useProportionalAllocation
>;
