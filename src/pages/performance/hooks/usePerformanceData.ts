import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import {
  calculateAccountCumulativeReturns,
  calculateSymbolCumulativeReturns,
} from '@/commands/portfolio';

export type ReturnMethod = 'TWR' | 'MWR';

interface UsePerformanceDataProps {
  selectedItems: Array<{
    id: string;
    type: 'account' | 'symbol';
    name: string;
  }>;
  dateRange: DateRange | undefined;
  returnMethod: ReturnMethod;
}

export function usePerformanceData({
  selectedItems,
  dateRange,
  returnMethod,
}: UsePerformanceDataProps) {
  return useQuery({
    queryKey: ['performance', selectedItems, dateRange, returnMethod],
    queryFn: async () => {
      if (!selectedItems.length || !dateRange?.from || !dateRange?.to) return [];

      const results = await Promise.allSettled(
        selectedItems.map(async (item) => {
          try {
            if (item.type === 'account') {
              const data = await calculateAccountCumulativeReturns(
                item.id,
                format(dateRange.from!, 'yyyy-MM-dd'),
                format(dateRange.to!, 'yyyy-MM-dd'),
                returnMethod,
              );
              return { ...data, name: item.name };
            } else {
              const data = await calculateSymbolCumulativeReturns(
                item.id,
                format(dateRange.from!, 'yyyy-MM-dd'),
                format(dateRange.to!, 'yyyy-MM-dd'),
              );
              return { ...data, name: `${item.name} (${item.id})` };
            }
          } catch (error) {
            console.error(`Failed to calculate returns for ${item.name}:`, error);
            throw error;
          }
        }),
      );

      // Filter out failed calculations and return successful ones
      return results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map((result) => result.value);
    },
    enabled: selectedItems.length > 0 && !!dateRange?.from && !!dateRange?.to,
  });
}
