import { searchActivities } from "@/commands/activity";
import { useQuery } from "@tanstack/react-query";
import { ActivityType } from "@/lib/constants";

export function usePortfolioDividends() {
  return useQuery({
    queryKey: ["portfolio-dividends"],
    queryFn: async () => {
      const response = await searchActivities(
        0,
        10000, // Fetch a large number to ensure we get all dividends
        { activityType: [ActivityType.DIVIDEND] },
        "",
        { id: "date", desc: true },
      );

      // Aggregate dividends
      const dividendsBySymbol = new Map<string, number>();
      const dividendsByAccount = new Map<string, number>();
      
      for (const activity of response.data) {
        const symbol = activity.assetSymbol;
        const amount = activity.amount || 0;
        const accountId = activity.accountId;
        
        if (symbol) {
          const current = dividendsBySymbol.get(symbol) || 0;
          dividendsBySymbol.set(symbol, current + amount);
        }

        if (accountId) {
          const current = dividendsByAccount.get(accountId) || 0;
          dividendsByAccount.set(accountId, current + amount);
        }
      }

      return { dividendsBySymbol, dividendsByAccount };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
