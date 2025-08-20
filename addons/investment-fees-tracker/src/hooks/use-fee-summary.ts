import { useQuery } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { useActivities } from './use-activities';
import { useCurrencyConversion } from './use-currency-conversion';
import { calculateFeeSummary, type FeeSummary } from '../lib/fee-calculation.service';

interface UseFeeSummaryOptions {
  ctx: AddonContext;
  enabled?: boolean;
}

export function useFeeSummary({ ctx, enabled = true }: UseFeeSummaryOptions) {
  const { data: activities, isLoading: activitiesLoading, error: activitiesError } = useActivities({ ctx, enabled });
  const { baseCurrency, convertToBaseCurrency, isLoading: currencyLoading, error: currencyError } = useCurrencyConversion({ ctx, enabled });

  return useQuery({
    queryKey: ['fee-summary', activities?.length, baseCurrency],
    queryFn: (): FeeSummary[] => {
      if (!activities) {
        throw new Error('Activities not available');
      }

      // Calculate summaries for different periods
      const periods: Array<'TOTAL' | 'YTD' | 'LAST_YEAR'> = ['TOTAL', 'YTD', 'LAST_YEAR'];
      
      return periods.map(period => 
        calculateFeeSummary({ 
          activities, 
          period, 
          baseCurrency,
          convertToBaseCurrency
        })
      );
    },
    enabled: enabled && !!activities && !activitiesLoading && !activitiesError && !currencyLoading && !currencyError,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
