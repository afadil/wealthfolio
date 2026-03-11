// Device hooks for sync feature
// ==============================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncService } from "../services/sync-service";

/**
 * Hook to fetch all devices
 */
export function useDevices(scope?: "my" | "team") {
  return useQuery({
    queryKey: ["sync", "devices", scope],
    queryFn: () => syncService.listDevices(scope),
    staleTime: 60_000,
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
      queryClient.invalidateQueries({ queryKey: ["sync", "device"] });
      queryClient.invalidateQueries({ queryKey: ["sync", "devices"] });
    },
  });
}

/**
 * Hook to revoke a device
 */
export function useRevokeDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deviceId: string) => syncService.revokeDevice(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync", "devices"] });
    },
  });
}
