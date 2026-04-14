import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { calculatePerformanceHistory } from "@/adapters";
import { de, enUS } from "date-fns/locale";
import { format } from "date-fns";
import type { TFunction } from "i18next";
import { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { QueryKeys } from "@/lib/query-keys";
import { TrackedItem } from "@/lib/types";

function translatePerformanceErrorMessage(raw: string, t: TFunction<"common">): string {
  if (raw.includes("Account has negative portfolio value in its history")) {
    return t("performance.error_negative_portfolio_history");
  }
  return raw;
}

/**
 * Hook to calculate cumulative returns for a list of comparison items.
 * Uses the user-selected date range directly for all queries.
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
  const { t, i18n } = useTranslation("common");
  const dateLocale = i18n.language?.startsWith("de") ? de : enUS;

  // Filter out invalid items (defensive: handles stale localStorage data)
  const validItems = selectedItems.filter(
    (item) =>
      item && typeof item.id === "string" && item.id && typeof item.type === "string" && item.type,
  );

  // Get the formatted date range for API calls, keep as undefined if not present
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const performanceQueries = useQueries({
    queries: validItems.map((item) => ({
      queryKey: [
        QueryKeys.PERFORMANCE_HISTORY,
        item.type,
        item.id,
        startDate,
        endDate,
        trackingMode,
      ],
      queryFn: () =>
        calculatePerformanceHistory(
          item.type,
          item.id,
          startDate!,
          endDate!,
          // Only pass trackingMode for accounts, not for symbols
          item.type === "account" ? trackingMode : undefined,
        ),
      // Enable query only if dates are present (item validation done above).
      enabled: !!startDate && !!endDate,
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
    .map((error) =>
      translatePerformanceErrorMessage(
        error instanceof Error ? error.message : String(error),
        t,
      ),
    );

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

  const displayStartDate = dateRange?.from
    ? format(dateRange.from, "PP", { locale: dateLocale })
    : "";

  const displayEndDate = dateRange?.to ? format(dateRange.to, "PP", { locale: dateLocale }) : "";

  const displayDateRange =
    displayStartDate && displayEndDate
      ? `${displayStartDate} - ${displayEndDate}`
      : t("performance.fallback_date_subtitle");

  return {
    data: chartData,
    isLoading,
    hasErrors,
    errorMessages,
    queries: performanceQueries,
    formattedStartDate: startDate,
    formattedEndDate: endDate,
    displayDateRange,
  };
}
