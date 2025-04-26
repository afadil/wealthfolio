import { useState, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AccountValuation } from '@/lib/types'; 
import { getHistoricalValuations } from '@/commands/portfolio'; 
import { QueryKeys } from '@/lib/query-keys';
import { format, subDays, subWeeks, subMonths, subYears } from 'date-fns';
import { PORTFOLIO_ACCOUNT_ID } from '@/lib/constants';

type Interval = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export function useValuationHistory(
  initialInterval: Interval = '3M',
  accountId: string = PORTFOLIO_ACCOUNT_ID, 
) {
  const [interval, setInterval] = useState<Interval>(initialInterval);

  const dynamicDateRange = useMemo(() => {
    const to = new Date();
    let from: Date | undefined;

    switch (interval) {
      case '1D':
        from = subDays(to, 1);
        break;
      case '1W':
        from = subWeeks(to, 1);
        break;
      case '1M':
        from = subMonths(to, 1);
        break;
      case '3M':
        from = subMonths(to, 3);
        break;
      case '1Y':
        from = subYears(to, 1);
        break;
      case 'ALL':
        from = undefined;
        break;
      default:
        from = subMonths(to, 3); // Default to 3M
    }

    return from ? { from, to } : undefined;
  }, [interval]);

  const { data: valuationHistory, isLoading, isFetching } = useQuery<
    AccountValuation[], 
    Error
  >({
    queryKey: [
      QueryKeys.valuationHistory(accountId), 
      interval,
      dynamicDateRange?.from ? format(dynamicDateRange.from, 'yyyy-MM-dd') : null,
      dynamicDateRange?.to ? format(dynamicDateRange.to, 'yyyy-MM-dd') : null,
    ],
    queryFn: () => {
      const fetchValuations = (id: string, start?: string, end?: string) => 
        getHistoricalValuations(id, start, end);

      if (interval === 'ALL') {
        return fetchValuations(accountId, undefined, undefined);
      }

      if (!dynamicDateRange) {
        return Promise.resolve([]);
      }
      return fetchValuations(
        accountId,
        format(dynamicDateRange.from, 'yyyy-MM-dd'),
        format(dynamicDateRange.to, 'yyyy-MM-dd'),
      );
    },
    enabled: interval === 'ALL' || !!dynamicDateRange,
    placeholderData: keepPreviousData,
  });


  return {
    valuationHistory,
    isLoading: isLoading || isFetching,
    interval,
    setInterval,
    dynamicDateRange,
  };
} 