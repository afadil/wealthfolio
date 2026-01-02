import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";
import { useQueryClient } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { isTauri } from "@/lib/is-tauri";

/**
 * Hook that triggers broker sync when the app comes to foreground.
 *
 * - For Tauri: Listens to app:foreground event from backend
 * - For Web: Uses document.visibilitychange event
 *
 * Sync is throttled server-side to 1 hour minimum between syncs.
 */
export function useForegroundSync() {
  const { isConnected, userInfo } = useWealthfolioConnect();
  const queryClient = useQueryClient();
  const hasActiveSubscription =
    userInfo?.team?.subscriptionStatus === "active" ||
    userInfo?.team?.subscriptionStatus === "trialing";

  // Track if we should attempt sync
  const shouldSync = isConnected && hasActiveSubscription;

  useEffect(() => {
    if (!shouldSync) return;

    const triggerSync = async () => {
      try {
        if (isTauri()) {
          // For Tauri, call the foreground sync command
          const result = await invoke<{ synced: boolean; reason?: string }>(
            "trigger_foreground_sync"
          );

          if (result.synced) {
            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: [QueryKeys.BROKER_SYNC_STATES] });
            queryClient.invalidateQueries({ queryKey: [QueryKeys.IMPORT_RUNS] });
          }
        } else {
          // For web, call the API endpoint
          // The web version will be handled by the Docker scheduler
          // but we can still trigger a manual check
        }
      } catch (error) {
        console.error("Foreground sync failed:", error);
      }
    };

    if (isTauri()) {
      // Listen for Tauri foreground event
      const unlisten = listen("app:foreground", () => {
        triggerSync();
      });

      // Also trigger on initial mount if app is visible
      if (document.visibilityState === "visible") {
        triggerSync();
      }

      return () => {
        unlisten.then((fn) => fn());
      };
    } else {
      // Web: use visibility change API
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          triggerSync();
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      // Trigger on initial mount
      if (document.visibilityState === "visible") {
        triggerSync();
      }

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }
  }, [shouldSync, queryClient]);
}
