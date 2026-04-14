import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import i18n from "@/i18n/i18n";
import { getFireSettings, saveFireSettings } from "@/adapters";
import { getSettings } from "@/adapters";
import type { FireSettings } from "../types";
import { DEFAULT_SETTINGS } from "../lib/storage";

const QUERY_KEY = ["fire-planner-settings"];

interface QueryResult {
  settings: FireSettings;
  timezone?: string;
}

export function useFireSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<QueryResult> => {
      const [stored, appSettings] = await Promise.all([
        getFireSettings().catch(() => null),
        getSettings().catch(() => null),
      ]);

      const settings: FireSettings = stored
        ? { ...DEFAULT_SETTINGS, ...stored }
        : { ...DEFAULT_SETTINGS };

      if (appSettings?.baseCurrency) {
        settings.currency = appSettings.baseCurrency;
      }

      return { settings, timezone: appSettings?.timezone };
    },
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (updated: FireSettings) => {
      await saveFireSettings(updated);
      return updated;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, { ...query.data, settings: data });
      toast({ title: i18n.t("fire.settings.toast.saved") });
    },
    onError: (error: Error) => {
      toast({
        title: i18n.t("fire.settings.toast.save_failed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    settings: query.data?.settings ?? DEFAULT_SETTINGS,
    timezone: query.data?.timezone,
    isLoading: query.isLoading,
    saveSettings: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
