import { useQuery } from '@tanstack/react-query';
import { type AddonContext, type AccountValuation } from '@wealthfolio/addon-sdk';

interface UseLatestValuationsOptions {
  accountIds: string[];
  ctx: AddonContext;
  enabled?: boolean;
}

export function useLatestValuations({ accountIds, ctx, enabled = true }: UseLatestValuationsOptions) {
  return useQuery<AccountValuation[]>({
    queryKey: ['latest_valuations', accountIds],
    queryFn: async () => {
      if (!ctx.api || !accountIds.length) {
        return [];
      }
      
      const data = await ctx.api.portfolio.getLatestValuations(accountIds);
      return data || [];
    },
    enabled: enabled && !!ctx.api && accountIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
