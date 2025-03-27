import { useQueries } from '@tanstack/react-query';
import { calculatePerformance } from '@/commands/portfolio';
import { useRef } from 'react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

type ComparisonItem = {
  id: string;
  type: 'account' | 'symbol';
  name: string;
};

/**
 * Hook to calculate cumulative returns for a list of comparison items.
 * Automatically determines the effective start date based on the first available data point
 * from the first selected account.
 * 
 * @param selectedItems List of comparison items to calculate cumulative returns for.
 * @param dateRange The date range for the calculation period.
 * 
 * @returns An object containing the calculated cumulative returns data, 
 *          a boolean indicating whether the data is loading, 
 *          a boolean indicating whether there are any errors, 
 *          an array of error messages,
 *          the effective start date used for calculations,
 *          and a formatted display date range string.
 */
export function useCalculatePerformance({
  selectedItems,
  dateRange,
}: {
  selectedItems: ComparisonItem[];
  dateRange: DateRange | undefined;
}) {
  // Use a ref to track the effective start date without causing re-renders
  const effectiveStartDateRef = useRef<string | null>(null);
  
  // Use a ref to track if we've already processed the data for the current selection
  const processedRef = useRef<{
    selectedItemIds: string[];
    dateFrom: string | null;
    effectiveStartDate: string | null;
  }>({
    selectedItemIds: [],
    dateFrom: null,
    effectiveStartDate: null
  });

  // Get the formatted date range for API calls
  const formattedStartDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
  const formattedEndDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';

  // Check if we need to update our tracking refs
  const currentSelectionKey = selectedItems.map(item => item.id).join(',');
  const hasSelectionChanged = currentSelectionKey !== processedRef.current.selectedItemIds.join(',');
  const hasDateChanged = formattedStartDate !== processedRef.current.dateFrom;
  
  // If selection or date changed, reset the processed state
  if (hasSelectionChanged || hasDateChanged) {
    processedRef.current = {
      selectedItemIds: selectedItems.map(item => item.id),
      dateFrom: formattedStartDate,
      effectiveStartDate: null
    };
    effectiveStartDateRef.current = null;
  }

  // Use the effective start date if available, otherwise use the formatted start date
  const startDateToUse = effectiveStartDateRef.current || formattedStartDate;

  const performanceQueries = useQueries({
    queries: selectedItems.map((item) => ({
      queryKey: ['calculate_cumulative_returns', item.type, item.id, startDateToUse, formattedEndDate],
      queryFn: () => calculatePerformance(item.type, item.id, startDateToUse, formattedEndDate),
      enabled: !!item.id && !!startDateToUse && !!formattedEndDate,
      staleTime: 30 * 1000,
      retry: false, 
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

  // Process performance data to determine effective start date (only once per data set)
  if (chartData?.length && 
      formattedStartDate && 
      !effectiveStartDateRef.current && 
      !processedRef.current.effectiveStartDate) {
    
    // Find the first account in the selected items
    const firstAccountItem = selectedItems.find(item => item.type === 'account');
    
    if (firstAccountItem) {
      // Find the performance data for the first account
      const firstAccountData = chartData.find(data => data?.id === firstAccountItem.id);
      
      if (firstAccountData?.returns?.length) {
        // Get the first date string from the returns data
        const firstDataDateStr = firstAccountData.returns[0].date;
        
        // Compare date strings directly (YYYY-MM-DD format strings can be compared lexicographically)
        const effectiveStartDate = firstDataDateStr > formattedStartDate ? firstDataDateStr : formattedStartDate;
        
        effectiveStartDateRef.current = effectiveStartDate;
        processedRef.current.effectiveStartDate = effectiveStartDate;
      }
    }
  }

  // Format the effective date for display
  const displayStartDate = effectiveStartDateRef.current
    ? format(new Date(effectiveStartDateRef.current), 'MMM d, yyyy')
    : dateRange?.from 
      ? format(dateRange.from, 'MMM d, yyyy') 
      : '';

  const displayEndDate = dateRange?.to 
    ? format(dateRange.to, 'MMM d, yyyy') 
    : '';

  const displayDateRange = (displayStartDate && displayEndDate) 
    ? `${displayStartDate} - ${displayEndDate}`
    : 'Compare account performance over time';

  return {
    data: chartData,
    isLoading,
    hasErrors,
    errorMessages,
    queries: performanceQueries,
    effectiveStartDate: effectiveStartDateRef.current,
    formattedStartDate,
    formattedEndDate,
    displayDateRange,
    isCustomRange: effectiveStartDateRef.current !== null && effectiveStartDateRef.current !== formattedStartDate
  };
}
