import { useQuery } from '@tanstack/react-query';
import { type AddonContext, type Holding } from '@wealthfolio/addon-sdk';

interface UseHoldingsOptions {
  accountId: string;
  ctx: AddonContext;
  enabled?: boolean;
}

export function useHoldings({ accountId, ctx, enabled = true }: UseHoldingsOptions) {
  return useQuery({
    queryKey: ['holdings', accountId],
    queryFn: async (): Promise<Holding[]> => {
      if (!accountId || !ctx.api) {
        throw new Error('Account ID and API context are required');
      }
      
      // The API supports "TOTAL" accountId to get aggregated holdings from all accounts
      const data = await ctx.api.portfolio.getHoldings(accountId);
      console.log(`📊 Holdings loaded for ${accountId}: ${data?.length || 0} holdings`);
      return data || [];
    },
    enabled: enabled && !!accountId && !!ctx.api,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
