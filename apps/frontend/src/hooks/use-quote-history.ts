import { useQuery } from "@tanstack/react-query";
import { getQuoteHistory } from "@/adapters";
import { Quote } from "@/lib/types";
import { DataSource } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";

interface UseQuoteHistoryOptions {
  assetId: string;
  dataSource?: DataSource;
  enabled?: boolean;
}

export function useQuoteHistory({ assetId, enabled = true }: UseQuoteHistoryOptions) {
  return useQuery<Quote[], Error>({
    queryKey: [QueryKeys.QUOTE_HISTORY, assetId],
    queryFn: () => getQuoteHistory(assetId),
    enabled: !!assetId && enabled,
  });
}
