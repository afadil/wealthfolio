import { useQuery } from "@tanstack/react-query";
import type { PortfolioTarget, TargetAllocation, DeviationReport } from "@/lib/types";
import { getPortfolioTargets, getTargetAllocations, getAllocationDeviations } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";

export function usePortfolioTargets(accountId: string) {
  const {
    data: targets = [],
    isLoading,
    error,
  } = useQuery<PortfolioTarget[], Error>({
    queryKey: [QueryKeys.PORTFOLIO_TARGETS, accountId],
    queryFn: () => getPortfolioTargets(accountId),
    enabled: !!accountId,
  });

  return { targets, isLoading, error };
}

export function useTargetAllocations(targetId: string | undefined) {
  const {
    data: allocations = [],
    isLoading,
    error,
  } = useQuery<TargetAllocation[], Error>({
    queryKey: [QueryKeys.TARGET_ALLOCATIONS, targetId],
    queryFn: () => getTargetAllocations(targetId!),
    enabled: !!targetId,
  });

  return { allocations, isLoading, error };
}

export function useAllocationDeviations(targetId: string | undefined) {
  const {
    data: deviationReport,
    isLoading,
    error,
  } = useQuery<DeviationReport, Error>({
    queryKey: [QueryKeys.ALLOCATION_DEVIATIONS, targetId],
    queryFn: () => getAllocationDeviations(targetId!),
    enabled: !!targetId,
  });

  return { deviationReport, isLoading, error };
}
