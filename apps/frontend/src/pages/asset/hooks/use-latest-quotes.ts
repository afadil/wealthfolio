import { useQuery } from "@tanstack/react-query";

import { getLatestQuotes } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { LatestQuoteSnapshot } from "@/lib/types";

export function useLatestQuotes(symbols: string[]) {
  return useQuery<Record<string, LatestQuoteSnapshot>>({
    queryKey: [QueryKeys.ASSETS, QueryKeys.LATEST_QUOTES, [...symbols].sort().join(",")],
    queryFn: () => getLatestQuotes(symbols),
    enabled: symbols.length > 0,
  });
}
