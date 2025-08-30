import { useQuery } from '@tanstack/react-query';
import { type AddonContext, type Holding } from '@wealthfolio/addon-sdk';

interface UseHoldingsOptions {
  ctx: AddonContext;
  enabled?: boolean;
}


const TOTAL_PORTFOLIO_ACCOUNT_ID = 'TOTAL';

export function useHoldings({ctx, enabled = true }: UseHoldingsOptions) {
  return useQuery({
    queryKey: ['holdings'],
    queryFn: async (): Promise<Holding[]> => {
      if (!ctx.api) {
        throw new Error('API context are required');
      }
      
      // The API supports "TOTAL" accountId to get aggregated holdings from all accounts
      const data = await ctx.api.portfolio.getHoldings(TOTAL_PORTFOLIO_ACCOUNT_ID);
      return data || [];
    },
    enabled: enabled && !!ctx.api,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
