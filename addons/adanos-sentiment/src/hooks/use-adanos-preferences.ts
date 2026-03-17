import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import type { AdanosPreferences } from "../types";
import { DEFAULT_PREFERENCES } from "../lib/utils";

const PREFERENCES_KEY = "adanos_pulse_preferences";

export function useAdanosPreferences(ctx: AddonContext) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["adanos-preferences"],
    queryFn: async (): Promise<AdanosPreferences> => {
      try {
        const stored = localStorage.getItem(PREFERENCES_KEY);
        if (!stored) {
          return DEFAULT_PREFERENCES;
        }

        const parsed = JSON.parse(stored) as Partial<AdanosPreferences>;
        return {
          days: parsed.days ?? DEFAULT_PREFERENCES.days,
          enabledPlatforms:
            parsed.enabledPlatforms && parsed.enabledPlatforms.length > 0
              ? parsed.enabledPlatforms
              : DEFAULT_PREFERENCES.enabledPlatforms,
        };
      } catch (error) {
        ctx.api.logger.warn(
          "Failed to load Adanos preferences, using defaults: " + (error as Error).message,
        );
        return DEFAULT_PREFERENCES;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<AdanosPreferences>) => {
      const current = query.data || DEFAULT_PREFERENCES;
      const updated = {
        ...current,
        ...patch,
      };

      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(["adanos-preferences"], preferences);
      ctx.api.logger.debug("Adanos preferences updated");
    },
    onError: (error) => {
      ctx.api.logger.error("Failed to save Adanos preferences: " + (error as Error).message);
    },
  });

  return {
    preferences: query.data || DEFAULT_PREFERENCES,
    isLoading: query.isLoading,
    isUpdating: mutation.isPending,
    updatePreferences: mutation.mutate,
  };
}
