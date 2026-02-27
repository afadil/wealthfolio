import { useQuery } from "@tanstack/react-query";
import type { ActivityDetails, AddonContext } from "@wealthfolio/addon-sdk";
import { QueryKeys } from "@wealthfolio/addon-sdk";

export function useExistingDividends(ctx: AddonContext): {
  existingDivs: ActivityDetails[] | undefined;
  isLoading: boolean;
} {
  const { data: existingDivs, isLoading } = useQuery({
    queryKey: [QueryKeys.ACTIVITIES, "DIVIDEND"],
    queryFn: async () => {
      const res = await ctx.api.activities.search(0, 1000, { activityTypes: ["DIVIDEND"] }, "");
      return res.data;
    },
  });

  return { existingDivs, isLoading };
}
