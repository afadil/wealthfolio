import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { getImportRuns } from "../services/broker-service";
import type { ImportRun } from "../types";

interface UseImportRunsOptions {
  runType?: "SYNC" | "IMPORT";
  limit?: number;
  enabled?: boolean;
}

export function useImportRuns(options: UseImportRunsOptions = {}) {
  const { runType = "SYNC", limit = 50, enabled = true } = options;

  return useQuery<ImportRun[], Error>({
    queryKey: [QueryKeys.IMPORT_RUNS, runType, limit],
    queryFn: () => getImportRuns(runType, limit, 0),
    staleTime: 30 * 1000, // 30 seconds
    enabled,
  });
}

interface UseImportRunsInfiniteOptions {
  runType?: "SYNC" | "IMPORT";
  pageSize?: number;
  enabled?: boolean;
}

export function useImportRunsInfinite(options: UseImportRunsInfiniteOptions = {}) {
  const { runType = "SYNC", pageSize = 10, enabled = true } = options;

  return useInfiniteQuery<ImportRun[], Error>({
    queryKey: [QueryKeys.IMPORT_RUNS, "infinite", runType, pageSize],
    queryFn: async ({ pageParam = 0 }) => {
      return getImportRuns(runType, pageSize, pageParam as number);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If we got fewer items than pageSize, there's no more data
      if (lastPage.length < pageSize) {
        return undefined;
      }
      // Return the offset for the next page
      return allPages.reduce((acc, page) => acc + page.length, 0);
    },
    staleTime: 30 * 1000,
    enabled,
  });
}
