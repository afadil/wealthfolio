import { searchActivities } from "@/commands/activity";
import { QueryKeys } from "@/lib/query-keys";
import { ActivityType } from "@/lib/constants";
import { ActivityDetails, ActivitySearchResponse } from "@/lib/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import { useMemo } from "react";

export interface ActivitySearchFilters {
  accountIds: string[];
  activityTypes: ActivityType[];
}

export interface UseActivitySearchOptions {
  filters: ActivitySearchFilters;
  searchQuery: string;
  sorting: SortingState;
  pageSize?: number;
}

export interface UseActivitySearchResult {
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

export function useActivitySearch({
  filters,
  searchQuery,
  sorting,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseActivitySearchOptions): UseActivitySearchResult {
  const normalizedFilters = useMemo(() => {
    return {
      accountIds: filters.accountIds.length > 0 ? filters.accountIds : undefined,
      activityTypes: filters.activityTypes.length > 0 ? filters.activityTypes : undefined
    };
  }, [filters.accountIds, filters.activityTypes]);

  const primarySort =
    sorting.length > 0 && sorting[0]?.id
      ? ({ id: sorting[0].id, desc: sorting[0].desc ?? false } as {
          id: string;
          desc: boolean;
        })
      : DEFAULT_SORT;

  const query = useInfiniteQuery<ActivitySearchResponse, Error>({
    queryKey: [
      QueryKeys.ACTIVITY_DATA,
      "shared",
      normalizedFilters,
      searchQuery,
      primarySort.id,
      primarySort.desc,
      pageSize,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 0;
      return searchActivities(page, pageSize, normalizedFilters, searchQuery, primarySort);
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
