import { useQuery } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import type { SwingActivity } from '../types';
import { useSwingPreferences } from './use-swing-preferences';

export function useSwingActivities(ctx: AddonContext) {
  const { preferences } = useSwingPreferences(ctx);

  return useQuery({
    queryKey: ['swing-activities', preferences.selectedAccounts, preferences.includeDividends],
    queryFn: async (): Promise<SwingActivity[]> => {
      try {
        // Use search API with filters for BUY/SELL activities, and optionally DIVIDEND
        const activityTypes = ['BUY', 'SELL'];
        if (preferences.includeDividends) {
          activityTypes.push('DIVIDEND');
        }

        const filters = {
          activityType: activityTypes,
          ...(preferences.selectedAccounts.length > 0 && {
            accountId: preferences.selectedAccounts,
          }),
        };

        const response = await ctx.api.activities.search(
          0, // page
          10000, // large page size to get all relevant activities
          filters,
          '', // no search keyword
          { id: 'date', desc: true }, // sort by date descending
        );

        // Transform to SwingActivity format
        const swingActivities: SwingActivity[] = response.data.map((activity) => ({
          ...activity,
          isSelected: preferences.selectedActivityIds.includes(activity.id),
          hasSwingTag: activity.comment?.toLowerCase().includes('swing') || false,
        }));

        return swingActivities;
      } catch (error) {
        ctx.api.logger.error('Failed to fetch swing activities: ' + (error as Error).message);
        throw error;
      }
    },
    enabled: !!ctx.api,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
