import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { calculateAccountsSimplePerformance } from '@/commands/portfolio';
import { Account, SimplePerformanceMetrics } from '@/lib/types';

export const useAccountsSimplePerformance = (accounts: Account[] | undefined) => {
  const accountIds = useMemo(() => accounts?.map((acc) => acc.id) ?? [], [accounts]);

  const { data, isLoading, isFetching, isError, error } = useQuery<
    SimplePerformanceMetrics[],
    Error
  >(
    {
      queryKey: ['accountsSimplePerformance', accountIds.join(',') || 'none'],
      queryFn: () => {
        return calculateAccountsSimplePerformance(accountIds);
      },
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    }
  );

  return {
    data,
    isLoading,
    isFetching,
    isError,
    error,
  };
}; 