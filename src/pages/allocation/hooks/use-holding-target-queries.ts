import { getHoldingTargets } from "@/commands/rebalancing";
import { QueryKeys } from "@/lib/query-keys";
import type { HoldingTarget } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

// ============================================================================
// Holding Target Queries
// ============================================================================

/**
 * Get holding targets for a specific asset class
 * Returns holdings with their target percentages and lock status
 */
export function useHoldingTargets(assetClassId: string | null) {
  return useQuery({
    queryKey: [QueryKeys.HOLDING_TARGETS, assetClassId],
    queryFn: async () => {
      if (!assetClassId) {
        return [];
      }
      return getHoldingTargets(assetClassId);
    },
    enabled: !!assetClassId,
  });
}

/**
 * Calculate cascading percentages for holdings
 * Formula: holding% of asset class × asset class% of portfolio = portfolio%
 *
 * Example: VTI 50% of Equity × 60% Equity = 30% of portfolio
 */
export function useCascadingPercentages(
  holdingTargets: HoldingTarget[],
  assetClassPercent: number,
) {
  return holdingTargets.map((target) => ({
    ...target,
    portfolioPercent: (target.targetPercentOfClass * assetClassPercent) / 100,
  }));
}
