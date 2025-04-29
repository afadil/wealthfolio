import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AccountValuation, DateRange } from '@/lib/types';
import { getHistoricalValuations } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';
import { format } from 'date-fns';
import { PORTFOLIO_ACCOUNT_ID } from '@/lib/constants';

export function useValuationHistory(
  dateRange: DateRange | undefined,
  accountId: string = PORTFOLIO_ACCOUNT_ID,
) {
  const { data: valuationHistory, isLoading, isFetching } = useQuery<
    AccountValuation[],
    Error
  >({
    queryKey: [
      QueryKeys.valuationHistory(accountId),
      dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : null,
      dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : null,
    ],
    queryFn: () => {
      const fetchValuations = (id: string, start?: string, end?: string) =>
        getHistoricalValuations(id, start, end);

      if (dateRange === undefined) {
        return fetchValuations(accountId, undefined, undefined);
      }

      if (!dateRange?.from || !dateRange?.to) {
        console.error("Invalid date range provided to useValuationHistory", dateRange);
        return Promise.resolve([]);
      }

      return fetchValuations(
        accountId,
        format(dateRange.from, 'yyyy-MM-dd'),
        format(dateRange.to, 'yyyy-MM-dd'),
      );
    },
    enabled: dateRange === undefined || (!!dateRange?.from && !!dateRange?.to),
    placeholderData: keepPreviousData,
  });

  return {
    valuationHistory,
    isLoading: isLoading || isFetching,
  };
} 