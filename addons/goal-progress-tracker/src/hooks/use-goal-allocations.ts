import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { type AddonContext, QueryKeys } from "@wealthfolio/addon-sdk";

interface UseGoalAllocationsOptions {
  ctx: AddonContext;
  goalId?: string;
  goalIds?: string[];
  enabled?: boolean;
}

export function useGoalAllocations({
  ctx,
  goalId,
  goalIds,
  enabled = true,
}: UseGoalAllocationsOptions) {
  const resolvedGoalIds = useMemo(() => goalIds ?? (goalId ? [goalId] : []), [goalId, goalIds]);

  const queries = useQueries({
    queries: resolvedGoalIds.map((id) => ({
      queryKey: [QueryKeys.GOALS_ALLOCATIONS, id],
      queryFn: async () => {
        if (!ctx.api) {
          return [];
        }
        return ctx.api.goals.getFunding(id);
      },
      enabled: enabled && !!ctx.api,
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 3,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    })),
  });

  return {
    data: queries.flatMap((query) => query.data ?? []),
    isLoading: queries.some((query) => query.isLoading),
    error: queries.find((query) => query.error)?.error ?? null,
  };
}
