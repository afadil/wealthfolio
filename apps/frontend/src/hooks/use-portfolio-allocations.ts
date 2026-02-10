import { useQuery } from "@tanstack/react-query";
import { PortfolioAllocations } from "@/lib/types";
import { getPortfolioAllocations } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";

export function usePortfolioAllocations(accountId: string) {
  const {
    data: allocations,
    isLoading,
    isError,
    error,
  } = useQuery<PortfolioAllocations, Error>({
    queryKey: [QueryKeys.PORTFOLIO_ALLOCATIONS, accountId],
    queryFn: () => getPortfolioAllocations(accountId),
    enabled: !!accountId,
  });

  return { allocations, isLoading, isError, error };
}
