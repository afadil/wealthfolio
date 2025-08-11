import { useQuery } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { useActivities } from './use-activities';
import { calculateFeeAnalytics, type FeeAnalytics } from '../lib/fee-calculation.service';

interface UseFeeAnalyticsOptions {
  ctx: AddonContext;
  enabled?: boolean;
}

export function useFeeAnalytics({ ctx, enabled = true }: UseFeeAnalyticsOptions) {
  const { data: activities, isLoading: activitiesLoading, error: activitiesError } = useActivities({ ctx, enabled });

  return useQuery({
    queryKey: ['fee-analytics', activities?.length],
    queryFn: async (): Promise<FeeAnalytics> => {
      if (!ctx?.api) {
        throw new Error('Addon context not available');
      }

      if (!activities) {
        throw new Error('Activities not available');
      }

      // Get portfolio data
      const holdings = await ctx.api.portfolio.getHoldings('TOTAL');
      
      // Calculate total portfolio value using base currency values
      const portfolioValue = holdings.reduce((sum, holding) => {
        const marketValue = holding.marketValue?.base || 0;
        return sum + marketValue;
      }, 0);

      return calculateFeeAnalytics({ activities, portfolioValue });
    },
    enabled: enabled && !!activities && !activitiesLoading && !activitiesError,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
