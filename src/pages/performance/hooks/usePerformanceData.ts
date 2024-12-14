import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { calculateAccountCumulativeReturns } from '@/commands/portfolio';
import { CumulativeReturns } from '@/lib/types';
import { useAccounts } from '@/pages/account/useAccounts';

export type ReturnMethod = 'TWR' | 'MWR';

interface UsePerformanceDataProps {
  selectedAccounts: string[];
  dateRange: DateRange | undefined;
  returnMethod: ReturnMethod;
}

export function usePerformanceData({
  selectedAccounts,
  dateRange,
  returnMethod,
}: UsePerformanceDataProps) {
  const { data: accounts } = useAccounts();

  return useQuery({
    queryKey: ['performance', selectedAccounts, dateRange, returnMethod],
    queryFn: async () => {
      if (!selectedAccounts.length || !dateRange?.from || !dateRange?.to) return [];

      const results = await Promise.all(
        selectedAccounts.map(async (accountId) => {
          const data = await calculateAccountCumulativeReturns(
            accountId,
            format(dateRange.from!, 'yyyy-MM-dd'),
            format(dateRange.to!, 'yyyy-MM-dd'),
            returnMethod,
          );
          return {
            ...data,
            name: accounts?.find((a) => a.id === accountId)?.name || accountId,
          };
        }),
      );
      return results;
    },
    enabled: selectedAccounts.length > 0 && !!dateRange?.from && !!dateRange?.to,
  });
}
