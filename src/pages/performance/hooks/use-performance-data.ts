import { useQueries } from '@tanstack/react-query';
import { calculateCumulativeReturns } from '@/commands/portfolio';

type ComparisonItem = {
  id: string;
  type: 'account' | 'symbol';
  name: string;
};

/**
 * Hook to calculate cumulative returns for a list of comparison items.
 * 
 * @param selectedItems List of comparison items to calculate cumulative returns for.
 * @param startDate Start date for the calculation period.
 * @param endDate End date for the calculation period.
 * 
 * @returns An object containing the calculated cumulative returns data, 
 *          a boolean indicating whether the data is loading, 
 *          a boolean indicating whether there are any errors, 
 *          an array of error messages, and 
 *          an array of query objects.
 */
export function useCalculateCumulativeReturns({
  selectedItems,
  startDate,
  endDate,
}: {
  selectedItems: ComparisonItem[];
  startDate: string;
  endDate: string;
}) {
  const performanceQueries = useQueries({
    queries: selectedItems.map((item) => ({
      queryKey: ['calculate_cumulative_returns', item.type, item.id, startDate, endDate],
      queryFn: () => calculateCumulativeReturns(item.type, item.id, startDate, endDate),
      enabled: !!item.id && !!startDate && !!endDate,
      staleTime: 30 * 1000,
      retry: false, // Don't retry on error
    })),
  });

  const isLoading = performanceQueries.some((query) => query.isLoading);
  const hasErrors = performanceQueries.some((query) => query.isError);
  const errorMessages = performanceQueries
    .filter((query) => query.isError)
    .map((query) => query.error)
    .filter(Boolean)
    .map((error) => (error instanceof Error ? error.message : String(error)));

  // Format chart data directly from query results
  const chartData = performanceQueries
    .map((query, index) => {
      if (query.isError || !query.data) return null;

      const item = selectedItems[index];
      return {
        ...query.data,
        id: item.id,
        type: item.type,
        name: item.type === 'symbol' ? `${item.name} (${item.id})` : item.name,
      };
    })
    .filter(Boolean);

  return {
    data: chartData,
    isLoading,
    hasErrors,
    errorMessages,
    queries: performanceQueries,
  };
}
