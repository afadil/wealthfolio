import type { SwingTradePreferences } from "../types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const DEFAULT_PREFERENCES: SwingTradePreferences = {
  selectedActivityIds: [],
  includeSwingTag: true,
  selectedAccounts: [],
  lotMatchingMethod: "FIFO",
  defaultDateRange: "YTD",
  includeFees: true,
  includeDividends: false,
};

const PREFERENCES_KEY = "swingfolio_preferences";

export function useSwingPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["swing-preferences"],
    queryFn: async (): Promise<SwingTradePreferences> => {
      try {
        const stored = localStorage.getItem(PREFERENCES_KEY);
        if (stored) {
          return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
        }
        return DEFAULT_PREFERENCES;
      } catch (error) {
        console.warn("Failed to load preferences, using defaults:", error);
        return DEFAULT_PREFERENCES;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const mutation = useMutation({
    mutationFn: async (preferences: Partial<SwingTradePreferences>) => {
      const current = query.data || DEFAULT_PREFERENCES;
      const updated = { ...current, ...preferences };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["swing-preferences"], data);
      console.debug("Swing preferences updated successfully");
    },
    onError: (error) => {
      console.error("Failed to save preferences:", error);
    },
  });

  return {
    preferences: query.data || DEFAULT_PREFERENCES,
    isLoading: query.isLoading,
    error: query.error,
    updatePreferences: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
