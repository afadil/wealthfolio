import { useQuery } from "@tanstack/react-query";
import { getMarketDataProviders } from "@/commands/market-data";
import { QueryKeys } from "@/lib/query-keys";
import { MarketDataProviderInfo } from "@/lib/types";
import { logger } from "@/adapters";

export function useMarketDataProviders() {
  return useQuery<MarketDataProviderInfo[], Error>({
    queryKey: [QueryKeys.MARKET_DATA_PROVIDERS],
    queryFn: async () => {
      try {
        const providers = await getMarketDataProviders();
        return providers;
      } catch (error) {
        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        logger.error(
          `Error fetching market data providers in useMarketDataProviders: ${errorMessage}`,
        );
        throw new Error(errorMessage);
      }
    },
  });
}
