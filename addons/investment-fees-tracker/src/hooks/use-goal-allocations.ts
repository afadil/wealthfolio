import { useQuery } from "@tanstack/react-query";
import { type AddonContext, type GoalAllocation } from "@wealthfolio/addon-sdk";

interface UseGoalAllocationsOptions {
  ctx: AddonContext;
  enabled?: boolean;
}

export function useGoalAllocations({ ctx, enabled = true }: UseGoalAllocationsOptions) {
  return useQuery<GoalAllocation[]>({
    queryKey: ["goal_allocations"],
    queryFn: async () => {
      if (!ctx.api) {
        throw new Error("API context is required");
      }

      const data = await ctx.api.goals.getAllocations();
      return data || [];
    },
    enabled: enabled && !!ctx.api,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
