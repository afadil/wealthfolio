import { format, startOfYear, subYears, endOfYear } from "date-fns";

export type SpendingPeriod = "YTD" | "LAST_YEAR" | "TOTAL";

export interface CashflowNavigationParams {
  categoryId?: string;
  subcategoryId?: string;
  eventId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Converts a spending/income period to start and end dates
 * @param period - The period type: YTD (year-to-date), LAST_YEAR, or TOTAL
 * @returns An object with startDate and endDate (both optional, as TOTAL has no dates)
 */
export function periodToDateRange(period: SpendingPeriod): {
  startDate?: string;
  endDate?: string;
} {
  const today = new Date();

  switch (period) {
    case "YTD":
      return {
        startDate: format(startOfYear(today), "yyyy-MM-dd"),
        endDate: format(today, "yyyy-MM-dd"),
      };
    case "LAST_YEAR": {
      const lastYear = subYears(today, 1);
      return {
        startDate: format(startOfYear(lastYear), "yyyy-MM-dd"),
        endDate: format(endOfYear(lastYear), "yyyy-MM-dd"),
      };
    }
    case "TOTAL":
    default:
      // TOTAL means no date filter
      return {};
  }
}

export function buildCashflowUrl(params: CashflowNavigationParams): string {
  const searchParams = new URLSearchParams();
  searchParams.set("tab", "transactions");
  if (params.categoryId) searchParams.set("category", params.categoryId);
  if (params.subcategoryId) searchParams.set("subcategory", params.subcategoryId);
  if (params.eventId) searchParams.set("event", params.eventId);
  if (params.startDate) searchParams.set("startDate", params.startDate);
  if (params.endDate) searchParams.set("endDate", params.endDate);
  return `/activity?${searchParams.toString()}`;
}
