import { useQuery } from "@tanstack/react-query"
import type { AddonContext } from "@wealthfolio/addon-sdk"
import type { SwingActivity } from "../types"
import { useSwingPreferences } from "./use-swing-preferences"

export function useSwingActivities(ctx: AddonContext) {
  const { preferences } = useSwingPreferences(ctx)

  return useQuery({
    queryKey: ["swing-activities", preferences.selectedAccounts],
    queryFn: async (): Promise<SwingActivity[]> => {
      try {
        // Get all activities
        const activities = await ctx.api.activities.getAll()

        // Filter to only BUY and SELL activities
        const tradingActivities = activities.filter(
          (activity) => activity.activityType === "BUY" || activity.activityType === "SELL",
        )

        // Filter by selected accounts if any
        const filteredActivities =
          preferences.selectedAccounts.length > 0
            ? tradingActivities.filter((activity) => preferences.selectedAccounts.includes(activity.accountId))
            : tradingActivities

        // Transform to SwingActivity format
        const swingActivities: SwingActivity[] = filteredActivities.map((activity) => ({
          ...activity,
          isSelected: preferences.selectedActivityIds.includes(activity.id),
          hasSwingTag: activity.comment?.toLowerCase().includes("swing") || false,
        }))

        return swingActivities
      } catch (error) {
        ctx.api.logger.error("Failed to fetch swing activities: " + (error as Error).message)
        throw error
      }
    },
    enabled: !!ctx.api,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}
