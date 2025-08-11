import { useQuery } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { useActivities } from './use-activities';
import { calculateFeeSummary, type FeeSummary } from '../lib/fee-calculation.service';

interface UseFeeSummaryOptions {
  ctx: AddonContext;
  enabled?: boolean;
}

export function useFeeSummary({ ctx, enabled = true }: UseFeeSummaryOptions) {
  const { data: activities, isLoading: activitiesLoading, error: activitiesError } = useActivities({ ctx, enabled });

  return useQuery({
    queryKey: ['fee-summary', activities?.length],
    queryFn: (): FeeSummary[] => {
      if (!activities) {
        throw new Error('Activities not available');
      }
      
      // Get base currency from settings (fallback to USD)
      const baseCurrency = 'USD'; // This should come from settings

      // Calculate summaries for different periods
      const periods: Array<'TOTAL' | 'YTD' | 'LAST_YEAR'> = ['TOTAL', 'YTD', 'LAST_YEAR'];
      
      return periods.map(period => 
        calculateFeeSummary({ activities, period, baseCurrency })
      );
    },
    enabled: enabled && !!activities && !activitiesLoading && !activitiesError,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
