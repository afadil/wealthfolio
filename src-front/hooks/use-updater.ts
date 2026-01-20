import { isDesktop, logger, isAutoUpdateCheckEnabled, checkForUpdates, installUpdate } from "@/adapters";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import type { UpdateInfo } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const UPDATE_QUERY_KEY = ["app-update"];

/**
 * Hook to check for updates on app startup.
 * Silently checks - only returns data if update available.
 * On desktop, also listens for menu-triggered update events.
 */
export function useCheckUpdateOnStartup() {
  const queryClient = useQueryClient();

  // Listen for menu-triggered update available events (desktop only)
  useEffect(() => {
    if (!isDesktop) return;

    let unlisten: (() => void) | undefined;

    // Dynamic import for Tauri-specific functionality
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<UpdateInfo>("app:update-available", (event) => {
        queryClient.setQueryData(UPDATE_QUERY_KEY, event.payload);
      }).then((fn) => {
        unlisten = fn;
      });
    });

    return () => unlisten?.();
  }, [queryClient]);

  return useQuery({
    queryKey: UPDATE_QUERY_KEY,
    queryFn: async () => {
      const enabled = await isAutoUpdateCheckEnabled();
      if (!enabled) return null;
      return checkForUpdates();
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/**
 * Hook for manual update check (e.g., from settings button).
 * Shows toast feedback for up-to-date or errors.
 */
export function useCheckForUpdates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: checkForUpdates,
    onSuccess: (updateInfo: UpdateInfo | null) => {
      // Update the query cache so dialog can show
      queryClient.setQueryData(UPDATE_QUERY_KEY, updateInfo);

      if (!updateInfo) {
        toast({
          title: "You're up to date",
          description: "You already have the latest version installed.",
        });
      }
      // If update available, the UpdateDialog will show via the query data
    },
    onError: (error: Error) => {
      logger.error("Update check failed: " + error.message);
      toast({
        title: "Update check failed",
        description: "We couldn't complete the update check. Please try again later.",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to clear the update data (dismiss dialog).
 */
export function useClearUpdate() {
  const queryClient = useQueryClient();
  return () => queryClient.setQueryData(UPDATE_QUERY_KEY, null);
}

/**
 * Hook to install an available update (desktop only).
 */
export function useInstallUpdate() {
  return useMutation({
    mutationFn: installUpdate,
  });
}
