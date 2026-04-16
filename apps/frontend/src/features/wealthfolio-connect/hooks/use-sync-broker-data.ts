import i18n from "@/i18n/i18n";
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
      toast.loading(i18n.t("toast.connect.broker_sync_loading"), { id: "broker-sync-start" });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : i18n.t("settings.exports.toast.unknown_error");
      toast.error(i18n.t("toast.connect.broker_sync_start_failed", { message }));
    },
  });
}
