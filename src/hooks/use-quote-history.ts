import { useQuery } from '@tanstack/react-query';
import { getQuoteHistory } from '@/commands/market-data';
import { Quote } from '@/lib/types';
import { DataSource } from '@/lib/constants';
import { QueryKeys } from '@/lib/query-keys';

interface UseQuoteHistoryOptions {
  symbol: string;
  dataSource?: DataSource;
  enabled?: boolean;
}

export function useQuoteHistory({ symbol, dataSource, enabled = true }: UseQuoteHistoryOptions) {
  return useQuery<Quote[], Error>({
    queryKey: [QueryKeys.QUOTE_HISTORY, symbol, dataSource],
    queryFn: () => getQuoteHistory(symbol, dataSource),
    enabled: !!symbol && enabled,
  });
} 