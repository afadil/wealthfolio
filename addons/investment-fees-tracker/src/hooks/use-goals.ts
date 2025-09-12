import { useQuery } from "@tanstack/react-query";
import { type AddonContext, type Goal } from "@wealthfolio/addon-sdk";

interface UseGoalsOptions {
  ctx: AddonContext;
  enabled?: boolean;
}

export function useGoals({ ctx, enabled = true }: UseGoalsOptions) {
  return useQuery<Goal[]>({
    queryKey: ["goals"],
    queryFn: async () => {
      if (!ctx.api) {
        throw new Error("API context is required");
      }

      const data = await ctx.api.goals.getAll();
      return data || [];
    },
    enabled: enabled && !!ctx.api,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
