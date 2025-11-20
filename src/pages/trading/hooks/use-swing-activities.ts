import { searchActivities } from "@/commands/activity";
import type { SwingActivity } from "../types";
import { useQuery } from "@tanstack/react-query";
import { useSwingPreferences } from "./use-swing-preferences";

export function useSwingActivities() {
  const { preferences } = useSwingPreferences();

  return useQuery({
    queryKey: ["swing-activities", preferences.selectedAccounts, preferences.includeDividends],
    queryFn: async (): Promise<SwingActivity[]> => {
      try {
        // Use search API with filters for BUY/SELL/ADD_HOLDING activities, and optionally DIVIDEND
        const activityTypes = ["BUY", "SELL", "ADD_HOLDING"];
        if (preferences.includeDividends) {
          activityTypes.push("DIVIDEND");
        }

        // Since searchActivities expects single accountId but we have multiple,
        // we need to fetch for each account separately or use getActivities
        let allActivities: any[] = [];

        if (preferences.selectedAccounts.length > 0) {
          // Fetch activities for each selected account
          for (const accountId of preferences.selectedAccounts) {
            const response = await searchActivities(
              0, // page
              10000, // large page size to get all relevant activities
              { accountId: [accountId], activityType: activityTypes },
              "", // no search keyword
              { id: "date", desc: true }, // sort by date descending
            );
            allActivities.push(...response.data);
          }
        } else {
          // No account filter, get all activities
          const response = await searchActivities(
            0, // page
            10000, // large page size to get all relevant activities
            { activityType: activityTypes },
            "", // no search keyword
            { id: "date", desc: true }, // sort by date descending
          );
          allActivities = response.data;
        }

        // Transform to SwingActivity format
        const swingActivities: SwingActivity[] = allActivities.map((activity) => ({
          ...activity,
          isSelected: preferences.selectedActivityIds.includes(activity.id),
          hasSwingTag: activity.comment?.toLowerCase().includes("swing") || false,
        }));

        console.log('[SwingActivities] Fetched activities:', swingActivities.length);
        console.log('[SwingActivities] Activity types:', swingActivities.map(a => a.activityType));
        console.log('[SwingActivities] Symbols:', [...new Set(swingActivities.map(a => a.assetSymbol))]);

        return swingActivities;
      } catch (error) {
        console.error("Failed to fetch swing activities:", error);
        throw error;
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
