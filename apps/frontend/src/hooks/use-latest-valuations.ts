import { useQuery } from "@tanstack/react-query";
import { AccountValuation } from "@/lib/types";
import { getLatestValuations } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";

export function useLatestValuations(accountIds: string[]) {
  const {
    data: latestValuations,
    isLoading,
    isFetching,
    error,
  } = useQuery<AccountValuation[], Error>({
    queryKey: [QueryKeys.latestValuations, accountIds],
    queryFn: () => getLatestValuations(accountIds),
    enabled: accountIds.length > 0,
  });

  return {
    latestValuations,
    isLoading: isLoading || isFetching,
    error,
  };
}
