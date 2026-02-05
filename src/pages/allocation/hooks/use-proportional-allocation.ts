import type { AssetClassTarget } from "@/lib/types";

/**
 * useProportionalAllocation
 *
 * Hook for calculating proportionally adjusted targets when one target changes.
 * Supports BIDIRECTIONAL adjustment:
 * - Drag UP: shrink others proportionally
 * - Drag DOWN: grow others proportionally (respects locked targets)
 *
 * Example:
 *   User has: Equities 60%, Fixed Income 30%, Cash 10% (total: 100%)
 *   User changes Equities slider to 70% (wants +10%)
 *   Hook calculates: maintain 3:1 ratio for FI and Cash
 *   Result: Equities 70%, Fixed Income 25%, Cash 5% (total: 100%)
 *
 *   User changes Equities slider down to 50% (wants -10%)
 *   Hook calculates: scale FI and Cash up proportionally
 *   Result: Equities 50%, Fixed Income 33.3%, Cash 16.7% (total: 100%)
 *
 * Logic:
 *   1. Calculate total of unchanged targets
 *   2. Calculate space change (increase or decrease)
 *   3. Scale other targets proportionally to fill/shrink space
 *   4. Clamp results to [0, 100]
 */
export function useProportionalAllocation() {
  /**
   * Calculate adjusted targets when one target changes (BIDIRECTIONAL)
   *
   * @param targets - All current targets
   * @param changedAssetClass - The asset class being changed
   * @param newPercent - The new percentage for that asset class
   * @param lockedAssets - Optional set of asset classes that should not be scaled
   * @returns Updated targets array with proportional adjustments
   */
  const calculateProportionalTargets = (
    targets: AssetClassTarget[],
    changedAssetClass: string,
    newPercent: number,
    lockedAssets?: Set<string>,
  ): AssetClassTarget[] => {
    // Clamp to [0, 100]
    const clampedNewPercent = Math.max(0, Math.min(100, newPercent));

    // Find the changed target
    const changedTarget = targets.find((t) => t.assetClass === changedAssetClass);
    if (!changedTarget) return targets;

    // Get unlockable and locked targets
    const unlockableTargets = targets.filter(
      (t) =>
        t.assetClass !== changedAssetClass && (!lockedAssets || !lockedAssets.has(t.assetClass)),
    );
    const lockedTargets = targets.filter(
      (t) => t.assetClass !== changedAssetClass && lockedAssets && lockedAssets.has(t.assetClass),
    );

    const unlockableTotal = unlockableTargets.reduce((sum, t) => sum + t.targetPercent, 0);
    const lockedTotal = lockedTargets.reduce((sum, t) => sum + t.targetPercent, 0);

    // Space available for unlockable targets after change
    const spaceAvailable = 100 - clampedNewPercent - lockedTotal;

    // Scale unlockable targets proportionally to fit the available space
    // This works for both dragging UP (space shrinks) and DOWN (space grows)
    if (unlockableTotal > 0 && spaceAvailable >= 0) {
      const scaleFactor = spaceAvailable / unlockableTotal;

      return [
        {
          ...changedTarget,
          targetPercent: clampedNewPercent,
        },
        ...unlockableTargets.map((t) => ({
          ...t,
          targetPercent: Math.max(0, t.targetPercent * scaleFactor),
        })),
        ...lockedTargets, // Keep locked targets unchanged
      ];
    }

    // If space is negative (over-allocated), scale proportionally to fit
    if (unlockableTotal > 0 && spaceAvailable < 0) {
      // This would only happen if locked targets alone exceed the limit
      // Just return the changed target with whatever space is left
      return [
        {
          ...changedTarget,
          targetPercent: clampedNewPercent,
        },
        ...unlockableTargets.map((t) => ({
          ...t,
          targetPercent: 0, // Clear unlockable targets if locked ones take all space
        })),
        ...lockedTargets,
      ];
    }

    // Fallback: no unlockable targets, just return the changed target
    return [
      {
        ...changedTarget,
        targetPercent: clampedNewPercent,
      },
      ...lockedTargets,
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

export type UseProportionalAllocationReturn = ReturnType<typeof useProportionalAllocation>;
