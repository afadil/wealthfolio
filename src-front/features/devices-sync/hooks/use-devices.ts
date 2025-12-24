// Device hooks for sync feature
// ==============================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncService } from "../services/sync-service";

/**
 * Hook to fetch current device
 */
export function useCurrentDevice() {
  return useQuery({
    queryKey: ["sync", "device", "current"],
    queryFn: () => syncService.getCurrentDevice(),
    staleTime: 60_000, // Consider data fresh for 1 minute
  });
}

/**
 * Hook to rename a device
 */
export function useRenameDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deviceId, name }: { deviceId: string; name: string }) =>
      syncService.renameDevice(deviceId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync", "device", "current"] });
    },
  });
}

/**
 * Hook to revoke a device
 */
export function useRevokeDevice() {
  return useMutation({
    mutationFn: (deviceId: string) => syncService.revokeDevice(deviceId),
  });
}
