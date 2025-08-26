import { useQuery } from '@tanstack/react-query';
import { type AddonContext, type Holding } from '@wealthfolio/addon-sdk';

interface UseAllHoldingsOptions {
  ctx: AddonContext;
  accountIds: string[];
  enabled?: boolean;
}

export function useAllHoldings({ ctx, accountIds, enabled = true }: UseAllHoldingsOptions) {
  return useQuery({
    queryKey: ['all-holdings', accountIds],
    queryFn: async (): Promise<Holding[]> => {
      if (!ctx.api || accountIds.length === 0) {
        return [];
      }
      
      // Get holdings for all accounts
      const holdingsPromises = accountIds.map(accountId => 
        ctx.api.portfolio.getHoldings(accountId)
      );
      
      const holdingsArrays = await Promise.all(holdingsPromises);
      
      // Flatten the arrays and return all holdings
      return holdingsArrays.flat();
    },
    enabled: enabled && !!ctx.api && accountIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
