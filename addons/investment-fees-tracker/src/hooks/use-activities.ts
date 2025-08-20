import { useQuery } from '@tanstack/react-query';
import type { AddonContext, ActivityDetails } from '@wealthfolio/addon-sdk';

interface UseActivitiesOptions {
  ctx: AddonContext;
  enabled?: boolean;
}

export function useActivities({ ctx, enabled = true }: UseActivitiesOptions) {
  return useQuery({
    queryKey: ['activities'],
    queryFn: async (): Promise<ActivityDetails[]> => {
      if (!ctx?.api) {
        throw new Error('Addon context not available');
      }

      const response = await ctx.api.activities.getAll();
      return response;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
