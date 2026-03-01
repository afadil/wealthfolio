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
      const pageSize = 1000;
      let page = 0;
      const allData: ActivityDetails[] = [];

      while (true) {
        const res = await ctx.api.activities.search(
          page,
          pageSize,
          { activityTypes: ["DIVIDEND"] },
          "",
        );
        allData.push(...res.data);
        if (res.data.length === 0 || allData.length >= res.meta.totalRowCount) break;
        page++;
      }

      return allData;
    },
    staleTime: 5 * 60 * 1000,
  });
  return { existingDivs, isLoading };
}
