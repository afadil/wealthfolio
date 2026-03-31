import { useQuery } from "@tanstack/react-query";
import { type AddonContext, type GoalAllocation, QueryKeys } from "@wealthfolio/addon-sdk";

interface UseGoalAllocationsOptions {
  ctx: AddonContext;
  goalId?: string;
  enabled?: boolean;
}

export function useGoalAllocations({ ctx, goalId, enabled = true }: UseGoalAllocationsOptions) {
  return useQuery<GoalAllocation[]>({
    queryKey: [QueryKeys.GOALS_ALLOCATIONS, goalId],
    queryFn: async () => {
      if (!ctx.api || !goalId) {
        return [];
      }
      return ctx.api.goals.getFunding(goalId);
    },
    enabled: enabled && !!ctx.api && !!goalId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
