import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { PerformanceMetrics } from '@/lib/types';
import { calculatePerformanceSummary } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';

// Define the parameters the hook accepts
interface UsePerformanceSummaryParams {
  itemId: string; // The Account ID
  startDate?: Date | null; // Optional start date (YYYY-MM-DD)
  endDate?: Date | null; // Optional end date (YYYY-MM-DD)
}


/**
 * Custom hook to fetch performance summary data for a given account using TanStack Query.
 *
 * @param {UsePerformanceSummaryParams} params - Hook parameters.
 * @param {string} params.itemId - The ID of the account.
 * @param {string | null} [params.startDate] - Optional start date (YYYY-MM-DD).
 * @param {string | null} [params.endDate] - Optional end date (YYYY-MM-DD).
 * @param {boolean} [params.enabled=true] - Whether the query should be enabled.
 * @returns The result object from TanStack Query's useQuery hook.
 */
export const usePerformanceSummary = ({
  itemId,
  startDate,
  endDate,
}: UsePerformanceSummaryParams) => {
  return useQuery<PerformanceMetrics, Error>({
    // Unique query key based on the function and its parameters
    queryKey: [QueryKeys.PERFORMANCE_SUMMARY, itemId, { startDate, endDate }],

    // The function that will fetch the data
    queryFn: () =>
      calculatePerformanceSummary({
        itemId,
        itemType: 'account',
        startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
        endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
      }),

    // Control whether the query should automatically run
    // Disable if 'enabled' prop is false or if itemId is missing
    enabled:  !!itemId,

    // Optional: Configuration for caching behavior
    // staleTime: 5 * 60 * 1000, // Data considered fresh for 5 minutes
    // cacheTime: 10 * 60 * 1000, // Data kept in cache for 10 minutes after unmount
  });
};
