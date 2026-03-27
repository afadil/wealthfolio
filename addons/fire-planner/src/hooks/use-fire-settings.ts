import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import type { FireSettings } from "../types";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../lib/storage";

const QUERY_KEY = ["fire-planner-settings"];

interface QueryResult {
  settings: FireSettings;
  timezone?: string;
}

export function useFireSettings(ctx: AddonContext) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<QueryResult> => {
      const settings = await loadSettings(ctx);
      let timezone: string | undefined;
      try {
        const appSettings = await ctx.api.settings.get();
        if (appSettings?.baseCurrency) {
          settings.currency = appSettings.baseCurrency;
        }
        if (appSettings?.timezone) {
          timezone = appSettings.timezone;
        }
      } catch {
        // ignore — currency and timezone fall back to defaults
      }
      return { settings, timezone };
    },
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (updated: FireSettings) => {
      await saveSettings(ctx, updated);
      return updated;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, { ...query.data, settings: data });
      ctx.api.toast.success("FIRE settings saved");
    },
    onError: (error: Error) => {
      ctx.api.toast.error("Failed to save settings: " + error.message);
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
