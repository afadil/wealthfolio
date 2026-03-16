import { useQuery } from "@tanstack/react-query";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import { fetchPortfolioSentiment } from "../lib/adanos-client";
import { buildTrackedHoldings } from "../lib/utils";
import type { AdanosPreferences } from "../types";

interface UsePortfolioSentimentArgs {
  ctx: AddonContext;
  apiKey: string | null;
  preferences: AdanosPreferences;
}

export function usePortfolioSentiment({ ctx, apiKey, preferences }: UsePortfolioSentimentArgs) {
  return useQuery({
    queryKey: [
      "adanos-portfolio-sentiment",
      apiKey ? "configured" : "missing",
      preferences.days,
      preferences.enabledPlatforms.join(","),
    ],
    queryFn: async () => {
      const holdings = await ctx.api.portfolio.getHoldings("TOTAL");
      const trackedHoldings = buildTrackedHoldings(holdings);

      if (!apiKey) {
        throw new Error("Adanos API key is not configured.");
      }

      if (trackedHoldings.length === 0) {
        return {
          holdings: [],
          errors: [],
          fetchedAt: new Date().toISOString(),
        };
      }

      return fetchPortfolioSentiment({
        apiKey,
        holdings: trackedHoldings,
        days: preferences.days,
        enabledPlatforms: preferences.enabledPlatforms,
      });
    },
    enabled: Boolean(apiKey),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
