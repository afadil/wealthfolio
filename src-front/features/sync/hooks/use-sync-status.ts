// Sync status hooks
// ==================

import { useQuery } from "@tanstack/react-query";
import { syncService } from "../services/sync-service";

/**
 * Hook to fetch sync status
 */
export function useSyncStatus() {
  return useQuery({
    queryKey: ["sync", "status"],
    queryFn: () => syncService.getSyncStatus(),
    staleTime: 30_000, // Consider data fresh for 30 seconds
    retry: 1, // Only retry once
  });
}

/**
 * Hook to check if pairing is needed
 */
export function useTrustStatus() {
  return useQuery({
    queryKey: ["sync", "trustStatus"],
    queryFn: () => syncService.checkTrustStatus(),
    staleTime: 30_000,
    retry: 1,
  });
}
