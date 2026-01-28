import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { calculatePerformanceHistory } from "@/adapters";
import { useRef } from "react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { QueryKeys } from "@/lib/query-keys";
import { TrackedItem } from "@/lib/types";

/**
 * Hook to calculate cumulative returns for a list of comparison items.
 * Automatically determines the effective start date based on the first available data point
 * from the first selected account.
 *
 * @param selectedItems List of comparison items to calculate cumulative returns for.
 * @param dateRange The date range for the calculation period.
 * @param trackingMode Optional tracking mode for accounts ("HOLDINGS" or "TRANSACTIONS").
 *                     Used for SOTA performance calculations in HOLDINGS mode.
 *
 * @returns An object containing the calculated cumulative returns data,
 *          a boolean indicating whether the data is loading,
 *          a boolean indicating whether there are any errors,
 *          an array of error messages,
 *          the effective start date used for calculations,
 *          and a formatted display date range string.
 */
export function useCalculatePerformanceHistory({
  selectedItems,
  dateRange,
  trackingMode,
}: {
  selectedItems: TrackedItem[];
  dateRange: DateRange | undefined;
  trackingMode?: "HOLDINGS" | "TRANSACTIONS";
}) {
  // Filter out invalid items (defensive: handles stale localStorage data)
  const validItems = selectedItems.filter(
    (item) => item && typeof item.id === "string" && item.id && typeof item.type === "string" && item.type,
  );

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
    effectiveStartDate: null,
  });

  // Get the formatted date range for API calls, keep as undefined if not present
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  // Check if we need to update our tracking refs
  const currentSelectionKey = validItems.map((item) => item.id).join(",");
  const hasSelectionChanged =
    currentSelectionKey !== processedRef.current.selectedItemIds.join(",");
  const hasDateChanged = startDate !== processedRef.current.dateFrom;

  // If selection or date changed, reset the processed state
  if (hasSelectionChanged || hasDateChanged) {
    processedRef.current = {
      selectedItemIds: validItems.map((item) => item.id),
      dateFrom: startDate || null, // Store startDate or null in ref
      effectiveStartDate: null,
    };
    effectiveStartDateRef.current = null;
  }

  // Use the effective start date if available, otherwise use the original start date (potentially undefined)
  const startDateToUse = effectiveStartDateRef.current || startDate;

  const performanceQueries = useQueries({
    queries: validItems.map((item) => ({
      queryKey: [QueryKeys.PERFORMANCE_HISTORY, item.type, item.id, startDateToUse, endDate, trackingMode],
      queryFn: () =>
        calculatePerformanceHistory(
          item.type,
          item.id,
          startDateToUse!,
          endDate!,
          // Only pass trackingMode for accounts, not for symbols
          item.type === "account" ? trackingMode : undefined,
        ),
      // Enable query only if dates are present (item validation done above).
      enabled: !!startDateToUse && !!endDate,
      staleTime: 30 * 1000,
      retry: false,
      placeholderData: keepPreviousData,
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

      const item = validItems[index];
      return {
        ...query.data,
        id: item.id,
        type: item.type,
        name: item.type === "symbol" ? `${item.name} (${item.id})` : item.name,
      };
    })
    .filter(Boolean);

  // Process performance data to determine effective start date (only once per data set)
  if (
    chartData?.length &&
    startDate && // Only adjust effective date if an initial start date was provided
    !effectiveStartDateRef.current &&
    !processedRef.current.effectiveStartDate
  ) {
    // Find the first account in the selected items
    const firstAccountItem = validItems.find((item) => item.type === "account");

    if (firstAccountItem) {
      // Find the performance data for the first account
      const firstAccountData = chartData.find((data) => data?.id === firstAccountItem.id);

      if (firstAccountData?.returns?.length) {
        // Get the first date string from the returns data
        const firstDataDateStr = firstAccountData.returns[0].date;

        // Compare date strings directly (YYYY-MM-DD format strings can be compared lexicographically)
        const effectiveStartDate = firstDataDateStr > startDate ? firstDataDateStr : startDate;

        effectiveStartDateRef.current = effectiveStartDate;
        processedRef.current.effectiveStartDate = effectiveStartDate;
      }
    }
  }

  // Format the effective date for display
  const displayStartDate = effectiveStartDateRef.current
    ? format(new Date(effectiveStartDateRef.current + "T00:00:00"), "MMM d, yyyy") // Add time part for correct Date parsing
    : dateRange?.from
      ? format(dateRange.from, "MMM d, yyyy")
      : "";

  const displayEndDate = dateRange?.to ? format(dateRange.to, "MMM d, yyyy") : "";

  const displayDateRange =
    displayStartDate && displayEndDate
      ? `${displayStartDate} - ${displayEndDate}`
      : "Compare account performance over time";

  return {
    data: chartData,
    isLoading,
    hasErrors,
    errorMessages,
    queries: performanceQueries,
    effectiveStartDate: effectiveStartDateRef.current,
    formattedStartDate: startDate,
    formattedEndDate: endDate,
    displayDateRange,
    isCustomRange:
      effectiveStartDateRef.current !== null && effectiveStartDateRef.current !== startDate,
  };
}
