import { useMutation } from "@tanstack/react-query";
import { syncBrokerData } from "../services/broker-service";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

/**
 * Hook to trigger broker data sync.
 * The actual sync runs in the background and results are handled via
 * global event listeners (SSE events trigger toasts and query invalidation).
 */
export function useSyncBrokerData() {
  return useMutation({
    mutationFn: syncBrokerData,
    onSuccess: () => {
      toast.loading("Syncing broker data...", { id: "broker-sync-start" });
    },
    onError: (error) => {
      toast.error(
        `Failed to start sync: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });
}
