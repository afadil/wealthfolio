import { searchCashActivities, CashActivityType } from "@/commands/cash-activity";
import { QueryKeys } from "@/lib/query-keys";
import { ActivityDetails, ActivitySearchResponse } from "@/lib/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import { useMemo } from "react";

export interface CashActivitySearchFilters {
  accountIds: string[];
  activityTypes: CashActivityType[];
  categoryIds?: string[];
  eventIds?: string[];
  recurrenceTypes?: string[];
  search?: string;
  isCategorized?: boolean;
  hasEvent?: boolean;
  hasRecurrence?: boolean;
  amountMin?: number;
  amountMax?: number;
  startDate?: string;
  endDate?: string;
}

export interface UseCashActivitiesOptions {
  filters: CashActivitySearchFilters;
  sorting: SortingState;
  pageSize?: number;
}

export interface UseCashActivitiesResult {
  flatData: ActivityDetails[];
  totalRowCount: number;
  fetchNextPage: () => Promise<unknown>;
  hasNextPage: boolean | undefined;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

const DEFAULT_SORT = { id: "date", desc: true };
const DEFAULT_PAGE_SIZE = 50;

export function useCashActivities({
  filters,
  sorting,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseCashActivitiesOptions): UseCashActivitiesResult {
  const normalizedFilters = useMemo(() => {
    return {
      accountIds: filters.accountIds.length > 0 ? filters.accountIds : undefined,
      activityTypes: filters.activityTypes.length > 0 ? filters.activityTypes : undefined,
      categoryIds: filters.categoryIds && filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
      eventIds: filters.eventIds && filters.eventIds.length > 0 ? filters.eventIds : undefined,
      recurrenceTypes: filters.recurrenceTypes && filters.recurrenceTypes.length > 0 ? filters.recurrenceTypes : undefined,
      search: filters.search,
      isCategorized: filters.isCategorized,
      hasEvent: filters.hasEvent,
      hasRecurrence: filters.hasRecurrence,
      amountMin: filters.amountMin,
      amountMax: filters.amountMax,
      startDate: filters.startDate,
      endDate: filters.endDate,
    };
  }, [
    filters.accountIds,
    filters.activityTypes,
    filters.categoryIds,
    filters.eventIds,
    filters.recurrenceTypes,
    filters.search,
    filters.isCategorized,
    filters.hasEvent,
    filters.hasRecurrence,
    filters.amountMin,
    filters.amountMax,
    filters.startDate,
    filters.endDate,
  ]);

  const primarySort =
    sorting.length > 0 && sorting[0]?.id
      ? ({ id: sorting[0]!.id, desc: sorting[0]!.desc ?? false } as {
          id: string;
          desc: boolean;
        })
      : DEFAULT_SORT;

  const query = useInfiniteQuery<ActivitySearchResponse, Error>({
    queryKey: [
      QueryKeys.CASH_ACTIVITIES,
      normalizedFilters,
      primarySort.id,
      primarySort.desc,
      pageSize,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 0;
      return searchCashActivities(page, pageSize, normalizedFilters, primarySort);
    },
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((acc, page) => acc + page.data.length, 0);
      return fetched < lastPage.meta.totalRowCount ? allPages.length : undefined;
    },
  });

  const flatData = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data?.pages],
  );

  const totalRowCount = useMemo(
    () => query.data?.pages?.[0]?.meta.totalRowCount ?? 0,
    [query.data?.pages],
  );

  return {
    flatData,
    totalRowCount,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
