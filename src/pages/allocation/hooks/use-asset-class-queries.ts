import { logger } from "@/adapters";
import { getHoldings } from "@/commands/portfolio";
import {
    deleteAssetClassTarget,
    getAssetClassTargets,
    getRebalancingStrategies,
    saveAssetClassTarget,
} from "@/commands/rebalancing";
import { QueryKeys } from "@/lib/query-keys";
import type { AssetClassTarget, NewAssetClassTarget } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ============================================================================
// Get Rebalancing Strategy for Account
// ============================================================================
// Flow: accountId → find strategy with matching accountId → fetch targets
export function useRebalancingStrategy(accountId: string | null) {
  return useQuery({
    queryKey: [QueryKeys.REBALANCING_STRATEGIES, accountId],
    queryFn: async () => {
      if (!accountId) {
        console.log("useRebalancingStrategy: no accountId");
        return null;
      }
      const strategies = await getRebalancingStrategies();
      console.log("useRebalancingStrategy - all strategies:", strategies);
      console.log("useRebalancingStrategy - looking for accountId:", accountId);

      // For "TOTAL" (all portfolio), use strategy with accountId === null
      // For specific accounts, match accountId directly
      const strategy =
        accountId === "TOTAL"
          ? strategies.find((s) => s.accountId === null) || null
          : strategies.find((s) => s.accountId === accountId) || null;

      console.log("useRebalancingStrategy - found strategy:", strategy);
      return strategy;
    },
    enabled: !!accountId,
  });
}

// ============================================================================
// Asset Class Target Queries
// ============================================================================
// Depends on: useRebalancingStrategy (to get strategyId)
export function useAssetClassTargets(accountId: string | null) {
  const { data: strategy } = useRebalancingStrategy(accountId);

  return useQuery<AssetClassTarget[], Error>({
    queryKey: [QueryKeys.ASSET_CLASS_TARGETS, accountId, strategy?.id],
    queryFn: () => getAssetClassTargets(strategy!.id),
    enabled: !!strategy?.id,
  });
}

export function useHoldingsForAllocation(accountId: string | null) {
  return useQuery<any[], Error>({
    queryKey: [QueryKeys.HOLDINGS, accountId],
    queryFn: () => getHoldings(accountId!),
    enabled: !!accountId,
  });
}

// ============================================================================
// Asset Class Target Mutations
// ============================================================================

export const useAssetClassMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string, invalidateKeys: [string, unknown][]) => {
    invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    toast.success(message);
  };

  const handleError = (action: string) => {
    logger.error(`Error ${action}.`);
    toast.error("Uh oh! Something went wrong.", {
      description: `There was a problem ${action}.`,
    });
  };

  const saveTargetMutation = useMutation({
    mutationFn: (target: NewAssetClassTarget | AssetClassTarget) =>
      saveAssetClassTarget(target),
    onSuccess: (data) => {
      const isNew = !("id" in data);
      handleSuccess(
        isNew ? "Asset class target added." : "Asset class target updated.",
        [[QueryKeys.ASSET_CLASS_TARGETS, data.strategyId]]
      );
    },
    onError: (_error) => handleError("saving asset class target"),
  });

  const deleteTargetMutation = useMutation({
    mutationFn: deleteAssetClassTarget,
    onSuccess: () => {
      // Invalidate all targets since we don't have strategyId in onSuccess
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_CLASS_TARGETS] });
      toast.success("Asset class target deleted.");
    },
    onError: (_error) => handleError("deleting asset class target"),
  });

  return {
    saveTargetMutation,
    deleteTargetMutation,
  };
};
