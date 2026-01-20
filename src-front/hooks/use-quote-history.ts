import { useQuery } from "@tanstack/react-query";
import { getQuoteHistory } from "@/adapters";
import { Quote } from "@/lib/types";
import { DataSource } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";

interface UseQuoteHistoryOptions {
  symbol: string;
  dataSource?: DataSource;
  enabled?: boolean;
}

export function useQuoteHistory({ symbol, enabled = true }: UseQuoteHistoryOptions) {
  return useQuery<Quote[], Error>({
    queryKey: [QueryKeys.QUOTE_HISTORY, symbol],
    queryFn: () => getQuoteHistory(symbol),
    enabled: !!symbol && enabled,
  });
}
