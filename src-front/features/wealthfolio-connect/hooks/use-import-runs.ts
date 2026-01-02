import { useQuery } from "@tanstack/react-query";
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
    queryFn: () => getImportRuns(runType, limit),
    staleTime: 30 * 1000, // 30 seconds
    enabled,
  });
}
