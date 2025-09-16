import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import type { SwingTradePreferences } from '../types';

const DEFAULT_PREFERENCES: SwingTradePreferences = {
  selectedActivityIds: [],
  includeSwingTag: true,
  selectedAccounts: [],
  lotMatchingMethod: 'FIFO',
  defaultDateRange: 'YTD',
  includeFees: true,
  includeDividends: false,
};

const PREFERENCES_KEY = 'swingfolio_preferences';

export function useSwingPreferences(ctx: AddonContext) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['swing-preferences'],
    queryFn: async (): Promise<SwingTradePreferences> => {
      try {
        const stored = localStorage.getItem(PREFERENCES_KEY);
        if (stored) {
          return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
        }
        return DEFAULT_PREFERENCES;
      } catch (error) {
        ctx.api.logger.warn(
          'Failed to load preferences, using defaults: ' + (error as Error).message,
        );
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
      queryClient.setQueryData(['swing-preferences'], data);
      ctx.api.logger.debug('Swing preferences updated successfully');
    },
    onError: (error) => {
      ctx.api.logger.error('Failed to save preferences: ' + error.message);
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
