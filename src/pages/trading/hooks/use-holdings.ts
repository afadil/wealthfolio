import { useQuery } from "@tanstack/react-query";
import { getHoldings } from "@/commands/portfolio";
import type { Holding } from "@/lib/types";

interface UseHoldingsOptions {
  enabled?: boolean;
}

const TOTAL_PORTFOLIO_ACCOUNT_ID = "TOTAL";

export function useHoldings({ enabled = true }: UseHoldingsOptions) {
  return useQuery({
    queryKey: ["holdings"],
    queryFn: async (): Promise<Holding[]> => {
      // The API supports "TOTAL" accountId to get aggregated holdings from all accounts
      const data = await getHoldings(TOTAL_PORTFOLIO_ACCOUNT_ID);
      return data || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
