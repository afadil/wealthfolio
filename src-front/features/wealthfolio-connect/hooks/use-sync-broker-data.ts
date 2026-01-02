import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { syncBrokerData } from "../services/broker-service";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

/**
 * Hook to trigger broker data sync and invalidate related queries.
 */
export function useSyncBrokerData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncBrokerData,
    onSuccess: (result) => {
      // Invalidate all queries that could be affected by sync
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PLATFORMS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITIES] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.BROKER_SYNC_STATES] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.IMPORT_RUNS] });

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });
}
