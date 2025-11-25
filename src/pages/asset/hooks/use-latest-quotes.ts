import { useQuery } from "@tanstack/react-query";

import { getLatestQuotes } from "@/commands/market-data";
import { QueryKeys } from "@/lib/query-keys";
import { Quote } from "@/lib/types";

export function useLatestQuotes(symbols: string[]) {
  return useQuery<Record<string, Quote>>({
    queryKey: [QueryKeys.ASSETS, QueryKeys.LATEST_QUOTES, [...symbols].sort().join(",")],
    queryFn: () => getLatestQuotes(symbols),
    enabled: symbols.length > 0,
  });
}
