import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { calculateAccountsSimplePerformance } from "@/adapters";
import { Account, SimplePerformanceMetrics } from "@/lib/types";
import { QueryKeys } from "@/lib/query-keys";

export const useAccountsSimplePerformance = (accounts: Account[] | undefined) => {
  const accountIds = useMemo(() => accounts?.map((acc) => acc.id) ?? [], [accounts]);

  const { data, isLoading, isFetching, isError, error } = useQuery<
    SimplePerformanceMetrics[],
    Error
  >({
    queryKey: QueryKeys.accountsSimplePerformance(accountIds),
    queryFn: () => {
      return calculateAccountsSimplePerformance(accountIds);
    },
  });

  return {
    data,
    isLoading,
    isFetching,
    isError,
    error,
  };
};
