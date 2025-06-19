import { useQuery } from '@tanstack/react-query';
import { Holding } from '@/lib/types';
import { getHoldings } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';

export function useHoldings(accountId: string) {
  const {
    data: holdings = [],
    isLoading,
    isError,
    error,
  } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS, accountId],
    queryFn: () => getHoldings(accountId),
    enabled: !!accountId,
  });

  return { holdings, isLoading, isError, error };
}